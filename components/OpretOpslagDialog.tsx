// components/OpretOpslagDialog.tsx
import { decode } from "base64-arraybuffer";
import * as ImageManipulator from "expo-image-manipulator";
import * as ImagePicker from "expo-image-picker";
import * as Location from "expo-location";
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ActionSheetIOS,
  ActivityIndicator,
  Alert,
  Image,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
  useWindowDimensions,
} from "react-native";
import { supabase } from "../utils/supabase";

/* ──────────────────────────────────────────────────────────────
   Konfiguration
────────────────────────────────────────────────────────────── */
const BUCKET = "opslagsbilleder";
const MAX_IMAGES = 4;

const KATEGORIER = [
  "Gratis",
  "Værktøj",
  "Arbejde tilbydes",
  "Affald",
  "Mindre ting",
  "Større ting",
  "Hjælp søges",
  "Hjælp tilbydes",
  "Byttes",
  "Udlejning",
  "Sælges",
  "Andet",
];

type SubmitData = {
  id?: string;
  overskrift: string;
  omraade: string;
  text: string;
  images?: string[] | null;
  image_url?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  kategori: string;
};

type Props = {
  visible: boolean;
  onClose: () => void;
  onSubmit: (data: SubmitData) => void | Promise<void>;
  initialValues?: {
    id?: string;
    overskrift?: string;
    omraade?: string;
    beskrivelse?: string;
    text?: string;
    image_url?: string | null;
    image_urls?: string[] | null;
    images?: string[] | null;
    kategori?: string;
    latitude?: number | null;
    longitude?: number | null;
  };
};

type NativePicked = { previewUri: string; base64: string; _kind: "native" };
type WebPicked   = { previewUri: string; blob: Blob;     _kind: "web" };
type PickedAny   = NativePicked | WebPicked;

/* ──────────────────────────────────────────────────────────────
   Hjælpere
────────────────────────────────────────────────────────────── */
async function resizeFileToBlobWeb(file: File, maxWidth = 1000, quality = 0.50) {
  const previewUrl = URL.createObjectURL(file);
  const imgEl = await new Promise<HTMLImageElement>((resolve, reject) => {
    const i = new Image();
    i.onload = () => resolve(i);
    i.onerror = reject;
    i.src = previewUrl;
  });
  const scale = Math.min(1, maxWidth / (imgEl.width || maxWidth));
  const w = Math.round((imgEl.width || maxWidth) * scale);
  const h = Math.round((imgEl.height || maxWidth) * scale);

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas context fejlede");
  ctx.drawImage(imgEl, 0, 0, w, h);

  const blob: Blob = await new Promise((res) =>
    canvas.toBlob((b) => res(b || file), "image/jpeg", quality)
  );
  return { blob, previewUrl };
}

async function tryGetLocation() {
  if (Platform.OS === "web") {
    if (!("geolocation" in navigator)) return null;
    return new Promise<{ lat: number; lng: number } | null>((resolve) => {
      navigator.geolocation.getCurrentPosition(
        (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
        () => resolve(null),
        { enableHighAccuracy: false, timeout: 10000, maximumAge: 60000 }
      );
    });
  }
  try {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== "granted") return null;
    const pos = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Balanced,
    });
    return { lat: pos.coords.latitude, lng: pos.coords.longitude };
  } catch {
    return null;
  }
}

/* Upload-sti */
function mkPath(userId: string) {
  return `posts/${userId}/post_${Date.now()}_${Math.floor(Math.random() * 1e6)}.jpg`;
}
async function uploadBase64ToSupabase(base64: string, userId: string) {
  const path = mkPath(userId);
  const { error } = await supabase.storage.from(BUCKET).upload(
    path,
    decode(base64),
    { contentType: "image/jpeg", upsert: true }
  );
  if (error) throw error;
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return data?.publicUrl ?? null;
}
async function uploadBlobToSupabase(blob: Blob, userId: string) {
  const path = mkPath(userId);
  const { error } = await supabase.storage.from(BUCKET).upload(
    path,
    blob,
    { contentType: "image/jpeg", upsert: true }
  );
  if (error) throw error;
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return data?.publicUrl ?? null;
}

/* ──────────────────────────────────────────────────────────────
   Kategori dropdown (fixet overlay + tablet-størrelser)
────────────────────────────────────────────────────────────── */
function KategoriDropdown({
  selected,
  onSelect,
}: {
  selected: string;
  onSelect: (c: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const { width, height } = useWindowDimensions();
  const isTablet = Math.min(width, height) >= 768;

  const LIST_W = isTablet ? 320 : 250;
  const LIST_MAX_H = isTablet ? 420 : 300;
  const ITEM_PAD_V = isTablet ? 14 : 12;
  const ITEM_FS = isTablet ? 17 : 16;

  return (
    <>
      <TouchableOpacity
        style={styles.dropdownBtn}
        onPress={() => setOpen(true)}
        activeOpacity={0.8}
      >
        <Text style={selected ? styles.dropdownBtnText : styles.dropdownBtnPlaceholder}>
          {selected || "Vælg kategori"}
        </Text>
      </TouchableOpacity>

      <Modal
        visible={open}
        transparent
        animationType="fade"
        onRequestClose={() => setOpen(false)}
      >
        {/* Baggrund der kan lukkes ved tap */}
        <Pressable style={styles.dropdownOverlay} onPress={() => setOpen(false)}>
          {/* Selve boksen fanger touch, så tryk ikke bobler op til overlay */}
          <TouchableWithoutFeedback>
            <View style={[styles.dropdownList, { width: LIST_W, maxHeight: LIST_MAX_H }]}>
              <ScrollView bounces showsVerticalScrollIndicator>
                {KATEGORIER.map((k) => {
                  const active = selected === k;
                  return (
                    <TouchableOpacity
                      key={k}
                      onPress={() => { onSelect(k); setOpen(false); }}
                      activeOpacity={0.9}
                      style={[
                        styles.dropdownItem,
                        { paddingVertical: ITEM_PAD_V },
                        active && { backgroundColor: "#25489011" },
                      ]}
                    >
                      <Text
                        style={[
                          styles.dropdownItemText,
                          { fontSize: ITEM_FS },
                          active && { color: "#254890", fontWeight: "bold" },
                        ]}
                        numberOfLines={1}
                      >
                        {k}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            </View>
          </TouchableWithoutFeedback>
        </Pressable>
      </Modal>
    </>
  );
}

/* ──────────────────────────────────────────────────────────────
   Komponent
────────────────────────────────────────────────────────────── */
export default function OpretOpslagDialog({ visible, onClose, onSubmit, initialValues }: Props) {
  const { width, height } = useWindowDimensions();
  const isTablet = Math.min(width, height) >= 768;

  const [id, setId] = useState<string | undefined>();
  const [overskrift, setOverskrift] = useState("");
  const [omraade, setOmraade] = useState("");
  const [beskrivelse, setBeskrivelse] = useState("");
  const [kategori, setKategori] = useState("");
  const [uploading, setUploading] = useState(false);

  const [picked, setPicked] = useState<PickedAny[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [lat, setLat] = useState<number | null | undefined>(undefined);
  const [lng, setLng] = useState<number | null | undefined>(undefined);

  /* Hent bruger-id til filstier */
  useEffect(() => {
    let active = true;
    (async () => {
      const { data } = await supabase.auth.getUser();
      if (active) setCurrentUserId(data.user?.id || null);
    })();
    return () => { active = false; };
  }, []);

  /* Init når modal åbner */
  useEffect(() => {
    if (!visible) return;
    setId(initialValues?.id);
    setOverskrift(initialValues?.overskrift || "");
    setOmraade(initialValues?.omraade || "");
    setBeskrivelse(initialValues?.beskrivelse ?? initialValues?.text ?? "");
    setKategori(initialValues?.kategori || "");
    setLat(initialValues?.latitude ?? null);
    setLng(initialValues?.longitude ?? null);

    const existing =
      initialValues?.images && initialValues.images.length > 0 ? initialValues.images :
      initialValues?.image_urls && initialValues.image_urls.length > 0 ? initialValues.image_urls :
      initialValues?.image_url ? [initialValues.image_url] : [];

    setPicked(
      (existing ?? []).slice(0, MAX_IMAGES).map((u) =>
        Platform.OS === "web"
          ? ({ _kind: "web", previewUri: u, blob: new Blob() } as PickedAny)
          : ({ _kind: "native", previewUri: u, base64: "" } as PickedAny)
      )
    );
  }, [visible, initialValues]);

  const canAddMore = picked.length < MAX_IMAGES;

  /* ── Native galleri/kamera ───────────────────── */
  async function addAssetsFromPicker(assets: ImagePicker.ImagePickerAsset[]) {
    const remaining = Math.max(0, MAX_IMAGES - picked.length);
    const chosen = assets.slice(0, remaining);

    const results: PickedAny[] = [];
    for (const a of chosen) {
      if (!a?.uri) continue;
      const manip = await ImageManipulator.manipulateAsync(
        a.uri,
        [{ resize: { width: 1400 } }],
        { compress: 0.7, format: ImageManipulator.SaveFormat.JPEG, base64: true }
      );
      if (!manip.base64) continue;
      results.push({ _kind: "native", previewUri: manip.uri, base64: manip.base64 });
    }
    if (results.length) setPicked((arr) => [...arr, ...results]);
  }

  const pickFromLibraryNative = async () => {
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (perm.status !== "granted") throw new Error("Manglende tilladelse til fotobibliotek.");

      const selectionLimit = Math.max(1, MAX_IMAGES - picked.length);
      const res = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsMultipleSelection: true,
        selectionLimit,
        quality: 1,
      });
      if (res.canceled || !res.assets?.length) return;
      await addAssetsFromPicker(res.assets);
    } catch (e: any) {
      Alert.alert("Fejl", e?.message ?? "Kunne ikke vælge billeder.");
    }
  };

  const captureWithCameraNative = async () => {
    try {
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (perm.status !== "granted") throw new Error("Manglende tilladelse til kamera.");
      const res = await ImagePicker.launchCameraAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 1,
      });
      if (res.canceled || !res.assets?.length) return;
      await addAssetsFromPicker(res.assets);
    } catch (e: any) {
      Alert.alert("Fejl", e?.message ?? "Kunne ikke tage billede.");
    }
  };

  const openNativePicker = () => {
    if (!canAddMore) return;
    if (Platform.OS !== "ios") {
      Alert.alert("Tilføj billeder", undefined, [
        { text: "Tag billede", onPress: captureWithCameraNative },
        { text: "Vælg fra galleri", onPress: pickFromLibraryNative },
        { text: "Annuller", style: "cancel" },
      ]);
    } else {
      ActionSheetIOS.showActionSheetWithOptions(
        { options: ["Annuller", "Tag billede", "Vælg fra galleri (flere)"], cancelButtonIndex: 0 },
        (i) => { if (i === 1) captureWithCameraNative(); if (i === 2) pickFromLibraryNative(); }
      );
    }
  };

  /* ── Web filer ───────────────────────────────── */
  const openWebPicker = () => { if (canAddMore) fileInputRef.current?.click(); };
  const onWebFilesPicked = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const list = e.target.files;
    if (!list || list.length === 0) return;
    const room = MAX_IMAGES - picked.length;
    const files = Array.from(list).slice(0, room);

    const results: PickedAny[] = [];
    for (const f of files) {
      const { blob, previewUrl } = await resizeFileToBlobWeb(f, 1400, 0.72);
      results.push({ _kind: "web", previewUri: previewUrl, blob });
    }
    setPicked((arr) => [...arr, ...results]);
    e.currentTarget.value = ""; // tillad valg af samme fil igen
  };

  const removeAt = (idx: number) => {
    setPicked((arr) => {
      const clone = [...arr];
      const item = clone[idx];
      if (Platform.OS === "web" && item && (item as any).previewUri?.startsWith?.("blob:")) {
        try { URL.revokeObjectURL((item as any).previewUri); } catch {}
      }
      clone.splice(idx, 1);
      return clone;
    });
  };

  /* ── Submit ───────────────────────────────────── */
  const title = useMemo(() => (id ? "Ret opslag" : "Opret opslag"), [id]);

  const handleSubmit = async () => {
    if (!overskrift.trim() || !omraade.trim() || !beskrivelse.trim() || !kategori) {
      Alert.alert("Udfyld alle felter og vælg en kategori.");
      return;
    }
    const { data: user } = await supabase.auth.getUser();
    const currentUserId = user.user?.id;
    if (!currentUserId) {
      Alert.alert("Bruger ikke fundet. Log evt. ind igen.");
      return;
    }

    setUploading(true);
    try {
      // Upload “nye” billeder
      const urls: string[] = [];
      for (const item of picked) {
        const isUrl = /^https?:\/\//i.test(item.previewUri);
        if (isUrl) {
          urls.push(item.previewUri);
          continue;
        }
        if (item._kind === "native") {
          const u = await uploadBase64ToSupabase((item as NativePicked).base64, currentUserId);
          if (u) urls.push(u);
        } else {
          const u = await uploadBlobToSupabase((item as WebPicked).blob, currentUserId);
          if (u) urls.push(u);
        }
      }
      const primary = urls[0] ?? null;

      // Lokation
      let latitude: number | null | undefined = lat ?? null;
      let longitude: number | null | undefined = lng ?? null;
      if (latitude == null || longitude == null) {
        const got = await tryGetLocation();
        if (got) { latitude = got.lat; longitude = got.lng; }
      }

      await onSubmit({
        id,
        overskrift,
        omraade,
        text: beskrivelse,
        images: urls.length ? urls : null,
        image_url: primary,
        latitude: latitude ?? null,
        longitude: longitude ?? null,
        kategori,
      });
    } catch (e: any) {
      Alert.alert("Fejl", e?.message ?? "Kunne ikke oprette opslag.");
    } finally {
      setUploading(false);
    }
  };

  /* ── Render ───────────────────────────────────── */
  const dialogW = isTablet ? Math.min(540, Math.round(width * 0.6)) : 350;
  const thumbsSize = isTablet ? 74 : 62;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === "ios" ? "padding" : "height"}>
        <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
          <View style={styles.overlay} />
        </TouchableWithoutFeedback>

        <View style={[styles.dialog, { width: dialogW, padding: isTablet ? 26 : 22 }]}>
          <Text style={[styles.title, isTablet && { fontSize: 20 }]}>{title}</Text>

          <ScrollView keyboardShouldPersistTaps="handled">
            <Text style={styles.label}>Overskrift</Text>
            <TextInput
              style={styles.input}
              placeholder="Skriv en titel…"
              value={overskrift}
              onChangeText={setOverskrift}
              editable={!uploading}
            />

            <Text style={styles.label}>Område</Text>
            <TextInput
              style={styles.input}
              placeholder="F.eks. Lyngby, 2800"
              value={omraade}
              onChangeText={setOmraade}
              editable={!uploading}
            />

            <Text style={styles.label}>Beskrivelse</Text>
            <TextInput
              style={[styles.input, styles.textArea, isTablet && { minHeight: 90 }]}
              placeholder="Skriv dit opslag her…"
              value={beskrivelse}
              onChangeText={setBeskrivelse}
              multiline
              editable={!uploading}
            />

            <Text style={styles.label}>Kategori</Text>
            <KategoriDropdown selected={kategori} onSelect={setKategori} />

            <Text style={[styles.billederLabel, isTablet && { marginTop: 6 }]}>
              Billeder (op til {MAX_IMAGES}) — du kan vælge flere ad gangen fra din kamerarulle.
              {"\n"}Første billede bliver vist som forside.
            </Text>

            <View style={[styles.thumbRow, { minHeight: thumbsSize }]}>
              {picked.map((p, idx) => (
                <View key={idx} style={[styles.thumbBox, { width: thumbsSize, height: thumbsSize }]}>
                  <Image source={{ uri: p.previewUri }} style={styles.thumb} />
                  <TouchableOpacity style={styles.removeBtn} onPress={() => removeAt(idx)} disabled={uploading}>
                    <Text style={styles.removeBtnText}>×</Text>
                  </TouchableOpacity>
                </View>
              ))}

              {picked.length < MAX_IMAGES && (
                Platform.OS === "web" ? (
                  <>
                    <TouchableOpacity
                      style={[styles.addBtn, { width: thumbsSize, height: thumbsSize }]}
                      onPress={openWebPicker}
                      disabled={uploading}
                    >
                      <Text style={styles.addBtnText}>＋</Text>
                    </TouchableOpacity>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      multiple
                      style={{ display: "none" }}
                      onChange={onWebFilesPicked}
                    />
                  </>
                ) : (
                  <TouchableOpacity
                    style={[styles.addBtn, { width: thumbsSize, height: thumbsSize }]}
                    onPress={openNativePicker}
                    disabled={uploading}
                  >
                    <Text style={styles.addBtnText}>＋</Text>
                  </TouchableOpacity>
                )
              )}
            </View>

            {uploading && (
              <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 8 }}>
                <ActivityIndicator color="#254890" />
                <Text style={styles.uploadingText}>Uploader…</Text>
              </View>
            )}
          </ScrollView>

          <View style={[styles.buttonRow, isTablet && { paddingTop: 12 }]}>
            <TouchableOpacity style={[styles.cancelBtn, isTablet && { minWidth: 120, padding: 14 }]} onPress={onClose} disabled={uploading}>
              <Text style={styles.cancelText}>Annuller</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.submitBtn, isTablet && { minWidth: 120, padding: 14 }]} onPress={handleSubmit} disabled={uploading}>
              <Text style={styles.submitText}>{id ? "Gem" : "Opret"}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

/* ──────────────────────────────────────────────────────────────
   Styles
────────────────────────────────────────────────────────────── */
const styles = StyleSheet.create({
  overlay: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(20,30,40,0.65)" },
  container: { flex: 1, justifyContent: "center", alignItems: "center" },
  dialog: { width: 350, maxHeight: "90%", backgroundColor: "#fff", borderRadius: 18, padding: 22 },
  title: { fontSize: 18, fontWeight: "bold", color: "#254890", marginBottom: 14, textAlign: "center" },

  input: {
    backgroundColor: "#f4f7fa",
    borderRadius: 7,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#e0e6ed",
  },
  textArea: { minHeight: 70, textAlignVertical: "top" },
  label: { fontSize: 14, color: "#254890", fontWeight: "600", marginBottom: 6 },

  billederLabel: { fontSize: 14, color: "#254890", marginTop: 4, marginBottom: 7, fontWeight: "600" },

  thumbRow: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginBottom: 10, minHeight: 62 },
  thumbBox: { width: 62, height: 62, borderRadius: 7, backgroundColor: "#eee", position: "relative" },
  thumb: { width: "100%", height: "100%", borderRadius: 7 },

  addBtn: {
    width: 62,
    height: 62,
    borderRadius: 7,
    backgroundColor: "#f3f3f3",
    borderWidth: 1,
    borderColor: "#ddd",
    alignItems: "center",
    justifyContent: "center",
  },
  addBtnText: { fontSize: 28, color: "#444" },

  removeBtn: {
    position: "absolute",
    top: -7,
    right: -7,
    backgroundColor: "#e85c5c",
    borderRadius: 13,
    width: 24,
    height: 24,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 2,
  },
  removeBtnText: { color: "#fff", fontWeight: "bold" },

  uploadingText: { marginLeft: 8, color: "#254890" },

  buttonRow: {
    flexDirection: "row",
    justifyContent: "center",
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: "#f0f0f0",
    gap: 10,
  },
  cancelBtn: { backgroundColor: "#e0e6ed", borderRadius: 8, padding: 12, minWidth: 100, alignItems: "center" },
  cancelText: { color: "#254890", fontWeight: "bold" },
  submitBtn: { backgroundColor: "#254890", borderRadius: 8, padding: 12, minWidth: 100, alignItems: "center" },
  submitText: { color: "#fff", fontWeight: "bold" },

  /* Dropdown */
  dropdownBtn: { backgroundColor: "#f4f7fa", borderRadius: 7, padding: 12, borderWidth: 1, borderColor: "#e0e6ed", marginBottom: 12 },
  dropdownBtnText: { color: "#000" },
  dropdownBtnPlaceholder: { color: "#999" },

  dropdownOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
    justifyContent: "center",
    alignItems: "center",
    padding: 16,
  },
  dropdownList: {
    backgroundColor: "#fff",
    borderRadius: 10,
    width: 250,
    maxHeight: 300,
    overflow: "hidden",
  },
  dropdownItem: { paddingVertical: 12, paddingHorizontal: 16, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: "#eee" },
  dropdownItemText: { fontSize: 16, color: "#0f172a" },
});