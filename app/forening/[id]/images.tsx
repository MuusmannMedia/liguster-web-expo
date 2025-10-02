// app/forening/[id]/images.tsx
import { decode } from "base64-arraybuffer";
import * as ImageManipulator from "expo-image-manipulator";
import * as ImagePicker from "expo-image-picker";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
    ActivityIndicator,
    Alert,
    FlatList,
    Image,
    Modal,
    SafeAreaView,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    useWindowDimensions,
    View,
    ViewToken,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useSession } from "../../../hooks/useSession";
import { supabase } from "../../../utils/supabase";

type EventRow = { id: string; title: string | null; start_at: string; end_at: string | null };
type EventImageRow = { id: number; image_url: string; created_at: string; event_id: string };

function fmtRange(sISO: string, eISO?: string | null) {
  const s = new Date(sISO);
  const e = eISO ? new Date(eISO) : null;
  const d = (d: Date) =>
    d.toLocaleDateString("da-DK", { day: "2-digit", month: "2-digit", year: "numeric" });
  const t = (d: Date) => d.toLocaleTimeString("da-DK", { hour: "2-digit", minute: "2-digit" });
  if (!e) return `${d(s)} kl. ${t(s)}`;
  const same = s.toDateString() === e.toDateString();
  return same ? `${d(s)} kl. ${t(s)}–${t(e)}` : `${d(s)} ${t(s)} – ${d(e)} ${t(e)}`;
}

export default function ImagesListScreen() {
  // ----- hooks (stabile) -----
  const { id, eventId } = useLocalSearchParams<{ id: string; eventId?: string | string[] }>();
  const foreningId = Array.isArray(id) ? id[0] : id;
  const router = useRouter();
  const { session } = useSession();
  const userId = session?.user?.id ?? null;

  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const isTablet = width >= 768;

  // oversigt
  const [loading, setLoading] = useState(true);
  const [events, setEvents] = useState<EventRow[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [thumbs, setThumbs] = useState<Record<string, string | null>>({});

  // galleri
  const [showModal, setShowModal] = useState(false);
  const [activeEvent, setActiveEvent] = useState<EventRow | null>(null);
  const [images, setImages] = useState<EventImageRow[]>([]);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  // upload state
  const [uploading, setUploading] = useState(false);

  // grid layout
  const gridCols = useMemo(() => (isTablet ? 4 : 2), [isTablet]);
  const GUTTER = 8;
  const SIDE_PAD = 12;
  const itemSize = useMemo(
    () => Math.floor((width - SIDE_PAD * 2 - GUTTER * (gridCols - 1)) / gridCols),
    [width, gridCols]
  );

  // viewer (overlay)
  const [showImage, setShowImage] = useState(false);
  const [viewerIndex, setViewerIndex] = useState(0);
  const viewerRef = useRef<FlatList<EventImageRow>>(null);
  const viewerViewabilityConfig = useRef({ itemVisiblePercentThreshold: 60 }).current;
  const onViewerItemsChanged = useRef(
    ({ viewableItems }: { viewableItems: Array<ViewToken> }) => {
      if (viewableItems.length > 0) {
        const v = viewableItems[0];
        if (typeof v.index === "number") setViewerIndex(v.index);
      }
    }
  ).current;

  // ----- data -----
  const fetchEvents = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("forening_events")
      .select("id, title, start_at, end_at")
      .eq("forening_id", foreningId)
      .order("start_at", { ascending: false });
    setLoading(false);
    if (error) { setEvents([]); return; }
    setEvents((data || []) as EventRow[]);
  }, [foreningId]);

  const fetchPerEventMeta = useCallback(async (evs: EventRow[]) => {
    const nextCounts: Record<string, number> = {};
    const nextThumbs: Record<string, string | null> = {};
    await Promise.all(
      evs.map(async (ev) => {
        const { data, count } = await supabase
          .from("event_images")
          .select("id, image_url, created_at", { count: "exact" })
          .eq("event_id", ev.id)
          .order("created_at", { ascending: false })
          .limit(1);
        nextCounts[ev.id] = typeof count === "number" ? count : (data?.length || 0);
        nextThumbs[ev.id] = data?.[0]?.image_url ?? null;
      })
    );
    setCounts(nextCounts);
    setThumbs(nextThumbs);
  }, []);

  useEffect(() => { if (foreningId) fetchEvents(); }, [foreningId, fetchEvents]);
  useEffect(() => { if (events.length) fetchPerEventMeta(events); }, [events, fetchPerEventMeta]);

  const openGallery = useCallback(async (ev: EventRow) => {
    setActiveEvent(ev);
    const { data } = await supabase
      .from("event_images")
      .select("id, image_url, created_at, event_id")
      .eq("event_id", ev.id)
      .order("created_at", { ascending: false });
    const list = (data || []) as EventImageRow[];
    setImages(list);
    setViewerIndex(0);
    setShowImage(false);
    setShowModal(true);
    requestAnimationFrame(() => {
      viewerRef.current?.scrollToIndex?.({ index: 0, animated: false });
    });
  }, []);

  // ----- Åbn automatisk korrekt galleri ved deep-link fra event -----
  const didAutoOpen = useRef(false);
  useEffect(() => {
    const wantedId = Array.isArray(eventId) ? eventId[0] : eventId;
    if (didAutoOpen.current || !wantedId || events.length === 0) return;
    const wanted = events.find((e) => e.id === wantedId);
    if (wanted) {
      didAutoOpen.current = true;
      openGallery(wanted);
    }
  }, [eventId, events, openGallery]);

  // ----- delete -----
  const deriveStoragePath = (url: string): string | null => {
    try {
      const u = new URL(url);
      const after = u.pathname.split("/object/public/")[1] || "";
      if (after.startsWith("eventbilleder/")) return after.replace("eventbilleder/", "");
    } catch {
      const idx = url.lastIndexOf("/");
      if (idx >= 0) return url.slice(idx + 1);
    }
    return null;
  };

  const deleteImage = useCallback(async (img: EventImageRow) => {
    try {
      setDeletingId(img.id);
      const storagePath = deriveStoragePath(img.image_url);
      if (storagePath) {
        const { error: storageErr } = await supabase.storage.from("eventbilleder").remove([storagePath]);
        if (storageErr) console.warn("Storage delete fejl:", storageErr.message);
      }
      const { error: dbErr } = await supabase.from("event_images").delete().eq("id", img.id);
      if (dbErr) throw dbErr;

      setImages((prev) => prev.filter((i) => i.id !== img.id));
      if (activeEvent) {
        setCounts((prev) => ({ ...prev, [activeEvent.id]: Math.max(0, (prev[activeEvent.id] || 1) - 1) }));
        setThumbs((prev) => ({
          ...prev,
          [activeEvent.id]: prev[activeEvent.id] && images.length <= 1 ? null : prev[activeEvent.id],
        }));
      }
      setViewerIndex((idx) => Math.min(idx, Math.max(0, images.length - 2)));
    } catch (e: any) {
      Alert.alert("Fejl", e?.message ?? "Kunne ikke slette billedet.");
    } finally {
      setDeletingId(null);
    }
  }, [activeEvent, images.length]);

  const confirmDelete = useCallback(
    (img: EventImageRow) => {
      Alert.alert("Slet billede?", "Vil du slette dette billede permanent?", [
        { text: "Annuller", style: "cancel" },
        { text: "Slet", style: "destructive", onPress: () => deleteImage(img) },
      ]);
    },
    [deleteImage]
  );

  // ----- upload -----
  const ensureMediaPermission = async () => {
    const perm = await ImagePicker.getMediaLibraryPermissionsAsync();
    if (perm.granted) return true;
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    return status === "granted";
  };

  const pickAndUpload = useCallback(async () => {
    if (!activeEvent) {
      Alert.alert("Vælg aktivitet", "Åbn først et galleri (tryk på en aktivitet).");
      return;
    }
    try {
      const ok = await ensureMediaPermission();
      if (!ok) {
        Alert.alert("Adgang nægtet", "Giv adgang til billeder for at kunne uploade.");
        return;
      }

      const anyPicker = ImagePicker as any;
      const mediaTypesProp = anyPicker?.MediaType?.Images ?? ImagePicker.MediaTypeOptions.Images;

      const res = await ImagePicker.launchImageLibraryAsync({
        // @ts-expect-error – understøt begge enum-navne
        mediaTypes: Array.isArray(mediaTypesProp) ? mediaTypesProp : mediaTypesProp,
        allowsEditing: false,
        quality: 1,
      });

      if ((res as any)?.canceled) return;
      const asset = (res as any)?.assets?.[0];
      if (!asset?.uri) return;

      // Nedskalér til max bredde 1600 og komprimer ~60%
      const manipulated = await ImageManipulator.manipulateAsync(
        asset.uri,
        [{ resize: { width: 1600 } }],
        { compress: 0.6, format: ImageManipulator.SaveFormat.JPEG, base64: true }
      );
      if (!manipulated.base64) {
        Alert.alert("Fejl", "Kunne ikke læse billedet.");
        return;
      }

      setUploading(true);

      // Upload til Storage
      const BUCKET = "eventbilleder";
      const storagePath = `events/${activeEvent.id}/img_${Date.now()}.jpg`;
      const { error: upErr } = await supabase.storage
        .from(BUCKET)
        .upload(storagePath, decode(manipulated.base64), {
          contentType: "image/jpeg",
          upsert: true,
        });
      if (upErr) throw upErr;

      const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(storagePath);
      const image_url = pub?.publicUrl ?? null;
      if (!image_url) throw new Error("Kunne ikke få public URL til billedet.");

      // Insert i DB – bemærk storage_path er NOT NULL hos dig
      const { data: inserted, error: insErr } = await supabase
        .from("event_images")
        .insert([{
          event_id: activeEvent.id,
          image_url,
          uploaded_by: userId ?? null,
          storage_path: storagePath,
        }])
        .select()
        .single();
      if (insErr) throw insErr;

      // Opdatér UI
      const newRow = inserted as EventImageRow;
      setImages((prev) => [newRow, ...prev]);
      setCounts((prev) => ({ ...prev, [activeEvent.id]: (prev[activeEvent.id] ?? 0) + 1 }));
      setThumbs((prev) => ({ ...prev, [activeEvent.id]: prev[activeEvent.id] ?? image_url }));
    } catch (e: any) {
      Alert.alert("Fejl", e?.message ?? "Kunne ikke uploade billedet.");
    } finally {
      setUploading(false);
    }
  }, [activeEvent, userId]);

  // ----- UI -----
  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#131921" />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: "#7C8996" }}>
      {/* Topbar */}
      <View style={styles.topBar}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backBtnText}>‹</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Billedgallerier</Text>
        <View style={{ width: 34 }} />
      </View>

      <FlatList
        data={events}
        keyExtractor={(e) => e.id}
        contentContainerStyle={{ paddingBottom: 24 }}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        removeClippedSubviews
        windowSize={5}
        initialNumToRender={8}
        renderItem={({ item: ev }) => (
          <TouchableOpacity onPress={() => openGallery(ev)} style={styles.row} activeOpacity={0.9}>
            {thumbs[ev.id] ? (
              <Image source={{ uri: thumbs[ev.id]! }} style={styles.thumb} />
            ) : (
              <View style={[styles.thumb, styles.thumbPh]}>
                <Text>–</Text>
              </View>
            )}
            <View style={{ flex: 1 }}>
              <Text style={styles.rowTitle}>{ev.title || "Aktivitet"}</Text>
              <Text style={styles.rowMeta}>{fmtRange(ev.start_at, ev.end_at)}</Text>
            </View>
            <Text style={styles.countBadge}>{counts[ev.id] ?? 0}</Text>
          </TouchableOpacity>
        )}
      />

      {/* --------- Galleri pr. event --------- */}
      <Modal
        visible={showModal}
        animationType="slide"
        presentationStyle="fullScreen"
        onRequestClose={() => setShowModal(false)}
      >
        <SafeAreaView style={styles.fullscreenWrap}>
          {/* Header (safe area) */}
          <View style={[styles.modalHeader, { paddingTop: insets.top + 6 }]}>
            <TouchableOpacity onPress={() => setShowModal(false)} style={styles.headerCloseBtn}>
              <Text style={styles.headerCloseTxt}>✕</Text>
            </TouchableOpacity>
            <Text style={styles.modalTitle} numberOfLines={1}>
              {activeEvent?.title || "Billeder"}
            </Text>
            <View style={{ width: 44 }} />
          </View>

          {images.length === 0 ? (
            <View style={{ padding: 16 }}>
              <Text style={{ color: "#fff", opacity: 0.8 }}>Ingen billeder endnu.</Text>
            </View>
          ) : (
            <FlatList
              data={images}
              key={gridCols}
              numColumns={gridCols}
              keyExtractor={(i) => i.id.toString()}
              contentContainerStyle={{
                paddingHorizontal: SIDE_PAD,
                paddingTop: 8,
                paddingBottom: 24 + insets.bottom,
              }}
              removeClippedSubviews
              windowSize={7}
              initialNumToRender={isTablet ? 18 : 10}
              renderItem={({ item, index }) => {
                const isLastInRow = (index + 1) % gridCols === 0;
                return (
                  <TouchableOpacity
                    style={[
                      styles.gridItem,
                      {
                        width: itemSize,
                        height: itemSize,
                        marginRight: isLastInRow ? 0 : GUTTER,
                        marginBottom: GUTTER,
                      },
                    ]}
                    onPress={() => {
                      setViewerIndex(index);
                      setShowImage(true);
                      requestAnimationFrame(() => {
                        viewerRef.current?.scrollToIndex?.({ index, animated: false });
                      });
                    }}
                    onLongPress={() => confirmDelete(item)}
                    activeOpacity={0.85}
                  >
                    <Image source={{ uri: item.image_url }} style={styles.gridImage} />
                    {deletingId === item.id && (
                      <View style={styles.deletingOverlay}>
                        <ActivityIndicator color="#fff" />
                      </View>
                    )}
                  </TouchableOpacity>
                );
              }}
            />
          )}

          {/* Upload-knap – centreret i bunden */}
          <View style={[styles.uploadBar, { paddingBottom: Math.max(12, insets.bottom) }]}>
            <TouchableOpacity
              style={[styles.uploadBtn, uploading && { opacity: 0.7 }]}
              onPress={pickAndUpload}
              disabled={uploading}
              activeOpacity={0.9}
            >
              <Text style={styles.uploadBtnText}>{uploading ? "Uploader…" : "Upload billede"}</Text>
            </TouchableOpacity>
          </View>

          {/* ---------- Fullscreen viewer (swipe + zoom) ---------- */}
          {showImage && images.length > 0 && (() => {
            const HEADER_BTN = 44;
            const headerHeight = (insets.top + 6) + HEADER_BTN + 8;
            const pageH = Math.max(0, height - headerHeight);

            return (
              <View style={styles.viewerOverlay}>
                <View style={[styles.modalHeader, { paddingTop: insets.top + 6 }]}>
                  <TouchableOpacity onPress={() => setShowImage(false)} style={styles.headerCloseBtn}>
                    <Text style={styles.headerCloseTxt}>✕</Text>
                  </TouchableOpacity>
                  <Text style={styles.modalTitle}>
                    {viewerIndex + 1} / {images.length}
                  </Text>
                  <View style={{ width: 44 }} />
                </View>

                <FlatList
                  ref={viewerRef}
                  data={images}
                  key={`viewer-${width}-${pageH}`}
                  keyExtractor={(i) => i.id.toString()}
                  horizontal
                  pagingEnabled
                  showsHorizontalScrollIndicator={false}
                  initialScrollIndex={viewerIndex}
                  onScrollToIndexFailed={() => {
                    setTimeout(() => viewerRef.current?.scrollToIndex?.({ index: viewerIndex, animated: false }), 0);
                  }}
                  viewabilityConfig={viewerViewabilityConfig}
                  onViewableItemsChanged={onViewerItemsChanged}
                  style={{ height: pageH }}
                  renderItem={({ item }) => (
                    <ScrollView
                      style={{ width, height: pageH }}
                      contentContainerStyle={{
                        width,
                        height: pageH,
                        justifyContent: "center",
                        alignItems: "center",
                        backgroundColor: "#000",
                      }}
                      minimumZoomScale={1}
                      maximumZoomScale={4}
                      bouncesZoom
                      showsHorizontalScrollIndicator={false}
                      showsVerticalScrollIndicator={false}
                    >
                      <Image
                        source={{ uri: item.image_url }}
                        style={{ width, height: pageH, resizeMode: "contain" as any }}
                      />
                    </ScrollView>
                  )}
                />
              </View>
            );
          })()}
        </SafeAreaView>
      </Modal>
    </View>
  );
}

/* -------------------- Styles -------------------- */
const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#7C8996" },

  topBar: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 14,
    paddingTop: 42,
    paddingBottom: 8,
    alignItems: "center",
    backgroundColor: "#7C8996",
  },
  backBtn: {
    width: 34, height: 34, borderRadius: 17, backgroundColor: "#131921",
    alignItems: "center", justifyContent: "center", borderWidth: 3, borderColor: "#ffffff",
  },
  backBtnText: { color: "#fff", fontWeight: "800", fontSize: 16, lineHeight: 16 },
  title: { color: "#fff", fontWeight: "900", fontSize: 14 },

  row: {
    flexDirection: "row", alignItems: "center", backgroundColor: "#fff",
    marginHorizontal: 14, padding: 12, borderRadius: 12, borderWidth: 1, borderColor: "#eef1f4",
    marginTop: 10, gap: 10,
  },
  rowTitle: { fontSize: 12, fontWeight: "800", color: "#131921" },
  rowMeta: { fontSize: 10, color: "#000", opacity: 0.7, marginTop: 2 },
  thumb: { width: 76, height: 56, borderRadius: 8, backgroundColor: "#f0f0f0" },
  thumbPh: { alignItems: "center", justifyContent: "center" },
  countBadge: {
    backgroundColor: "#131921", color: "#fff", fontWeight: "900", fontSize: 12,
    paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, marginLeft: 8,
  },
  separator: { height: StyleSheet.hairlineWidth, backgroundColor: "#e9edf1" },

  /* Fullscreen modal scaffolding */
  fullscreenWrap: { flex: 1, backgroundColor: "#000" },

  /* Modal header (safe area) */
  modalHeader: {
    paddingHorizontal: 10,
    paddingBottom: 8,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "rgba(0,0,0,0.45)",
  },
  headerCloseBtn: {
    width: 44, height: 44, borderRadius: 10,
    backgroundColor: "rgba(0,0,0,0.85)",
    alignItems: "center", justifyContent: "center",
  },
  headerCloseTxt: { color: "#fff", fontSize: 20, fontWeight: "900" },
  modalTitle: {
    color: "#fff", fontWeight: "900", fontSize: 16,
    marginHorizontal: 8, flex: 1, textAlign: "center",
  },

  /* Grid */
  gridItem: { borderRadius: 12, overflow: "hidden", backgroundColor: "#111" },
  gridImage: { width: "100%", height: "100%" },

  deletingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.45)",
    alignItems: "center",
    justifyContent: "center",
  },

  /* Upload bar (bund) */
  uploadBar: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: "center",
    justifyContent: "center",
    paddingTop: 8,
    backgroundColor: "rgba(0,0,0,0.0)",
  },
  uploadBtn: {
    backgroundColor: "#fff",
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 20,
    alignItems: "center",
    justifyContent: "center",
    minWidth: 220,
  },
  uploadBtnText: { color: "#131921", fontWeight: "900", fontSize: 14 },

  /* Fullscreen viewer overlay */
  viewerOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "#000",
    zIndex: 20,
  },
});