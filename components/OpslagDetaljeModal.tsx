// components/OpslagDetaljeModal.tsx
import React, { useMemo, useRef, useState } from "react";
import {
  Alert,
  Animated,
  Dimensions,
  FlatList,
  Image,
  Modal,
  NativeScrollEvent,
  NativeSyntheticEvent,
  PanResponder,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Post } from "../hooks/useOpslag";

type Props = {
  visible: boolean;
  opslag: Post | null;
  currentUserId: string | null;
  onClose: () => void;
  onSendSvar: () => void;
};

export default function OpslagDetaljeModal({
  visible,
  opslag,
  currentUserId,
  onClose,
  onSendSvar,
}: Props) {
  const W = Dimensions.get("window").width;
  const H = Dimensions.get("window").height;

  const isOwn = !!(opslag && currentUserId && opslag.user_id === currentUserId);

  const DRAG_CLOSE_THRESHOLD = Math.max(140, Math.round(H * 0.18));

  const isTablet = Math.min(W, H) >= 600;
  const TYPO = {
    title: isTablet ? 22 : 18,
    sub: isTablet ? 18 : 15,
    text: isTablet ? 18 : 16,
    chip: isTablet ? 16 : 14,
  };

  const CARD_MAX_H = isTablet ? Math.round(H * 0.85) : Math.min(760, Math.round(H * 0.85));
  const CARD_MAX_W = isTablet ? Math.min(980, Math.round(W * 0.86)) : Math.min(732, W - 32);

  const IMG_W = CARD_MAX_W;
  const IMG_H = Math.round((IMG_W / 4) * 3);

  const images: string[] = useMemo(() => {
    if (!opslag) return [];
    const imgs =
      ((opslag as any).images as string[] | null | undefined) ??
      ((opslag as any).image_urls as string[] | null | undefined);
    if (imgs && imgs.length > 0) return imgs.filter(Boolean);
    if (opslag?.image_url) return [opslag.image_url];
    return [];
  }, [opslag]);

  const [index, setIndex] = useState(0);
  const listRef = useRef<FlatList<string>>(null);
  const onScrollImages = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const x = e.nativeEvent.contentOffset.x;
    const i = Math.round(x / IMG_W);
    if (i !== index) setIndex(i);
  };

  /* Lightbox */
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState(0);
  const lightboxRef = useRef<FlatList<string>>(null);
  const openLightboxAt = (i: number) => {
    setLightboxIndex(i);
    setLightboxOpen(true);
    setTimeout(() => lightboxRef.current?.scrollToIndex({ index: i, animated: false }), 0);
  };

  /* Fælles translate for hele scenen */
  const translateY = useRef(new Animated.Value(0)).current;

  /* Brødtekst-område (måles i skærmkoordinater) */
  const textZoneRef = useRef<View>(null);
  const textRect = useRef<{ x: number; y: number; w: number; h: number } | null>(null);

  const measureTextZone = () => {
    textZoneRef.current?.measureInWindow?.((x: number, y: number, w: number, h: number) => {
      textRect.current = { x, y, w, h };
    });
  };
  const inTextRect = (pageX: number, pageY: number) => {
    const r = textRect.current;
    if (!r) return false;
    return pageX >= r.x && pageX <= r.x + r.w && pageY >= r.y && pageY <= r.y + r.h;
  };

  /* PanResponder på HELE kortet — undtagen når gestus starter i brødteksten */
  const shouldPan = (evt: any, g: any) => {
    const { pageX, pageY } = evt.nativeEvent || {};
    if (inTextRect(pageX, pageY)) return false;
    return Math.abs(g.dy) > 6 && Math.abs(g.dy) > Math.abs(g.dx) && g.dy > 0;
  };

  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponderCapture: shouldPan,
      onMoveShouldSetPanResponderCapture: shouldPan,
      onMoveShouldSetPanResponder: shouldPan,
      onPanResponderMove: (_evt, g) => {
        if (g.dy > 0) translateY.setValue(g.dy);
      },
      onPanResponderRelease: () => {
        const current = (translateY as any)._value ?? 0;
        const shouldClose = current > DRAG_CLOSE_THRESHOLD;
        Animated.timing(translateY, {
          toValue: shouldClose ? H : 0,
          duration: 220,
          useNativeDriver: true,
        }).start(() => {
          if (shouldClose) {
            translateY.setValue(0);
            onClose();
          }
        });
      },
      onPanResponderTerminate: () => {
        Animated.timing(translateY, { toValue: 0, duration: 200, useNativeDriver: true }).start();
      },
    })
  ).current;

  if (!opslag) return null;

  /* ---------- Share / Copy helpers ---------- */
  const deepLink = `ligusterapp://post/${opslag.id}`;
  const shareUrl = deepLink;

  // Kopiér-til-clipboard med dynamisk import + fallback
  async function copyToClipboard(text: string): Promise<boolean> {
    try {
      const { setStringAsync } = await import("expo-clipboard");
      await setStringAsync(text);
      return true;
    } catch {
      return false;
    }
  }

  const handleCopyLink = async () => {
    const ok = await copyToClipboard(shareUrl);
    if (ok) {
      Alert.alert("Kopieret", "Link til opslaget er kopieret.");
    } else {
      try {
        await Share.share({ message: shareUrl, url: shareUrl });
      } catch {}
      Alert.alert("Tip", "Kunne ikke kopiere – delte linket i stedet.");
    }
  };

  const handleShare = async () => {
    try {
      await Share.share({
        message: `${opslag.overskrift}\n${opslag.omraade ?? ""}\n\n${shareUrl}`,
        url: shareUrl,
        title: opslag.overskrift,
      });
    } catch {
      // user cancelled
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.root}>
        <Animated.View style={[styles.dim, { transform: [{ translateY }] }]} pointerEvents="none" />

        <Animated.View style={[styles.cardContainer, { transform: [{ translateY }] }]} {...pan.panHandlers}>
          <View style={[styles.card, { maxWidth: CARD_MAX_W, maxHeight: CARD_MAX_H }]}>
            {/* Topbar */}
            <View style={[styles.topbar, isTablet && { height: 56, paddingLeft: 18, paddingRight: 20 }]}>
              <View style={{ width: 24 }} />
              <View style={[styles.grabber, isTablet && { width: 56 }]} />
              <TouchableOpacity
                onPress={onClose}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                style={styles.closeBtn}
              >
                <Text style={[styles.closeIcon, isTablet && { fontSize: 28 }]}>✕</Text>
              </TouchableOpacity>
            </View>

            {/* Scrollbart indhold */}
            <ScrollView
              style={styles.scrollArea}
              contentContainerStyle={{ paddingBottom: 12 }}
              showsVerticalScrollIndicator
              onContentSizeChange={() => setTimeout(measureTextZone, 0)}
              onLayout={() => setTimeout(measureTextZone, 0)}
            >
              {/* Slider */}
              {images.length > 0 ? (
                <View style={[styles.sliderWrap, { width: IMG_W, height: IMG_H, alignSelf: "center" }]}>
                  <FlatList
                    ref={listRef}
                    data={images}
                    keyExtractor={(u, i) => u + "_" + i}
                    horizontal
                    pagingEnabled
                    showsHorizontalScrollIndicator={false}
                    onScroll={onScrollImages}
                    scrollEventThrottle={16}
                    renderItem={({ item, index: i }) => (
                      <Pressable onPress={() => openLightboxAt(i)}>
                        <View style={[styles.sliderFrame, { width: IMG_W, height: IMG_H }]}>
                          <Image source={{ uri: item }} style={styles.sliderImage} resizeMode="cover" />
                        </View>
                      </Pressable>
                    )}
                    style={{ width: IMG_W, height: IMG_H }}
                  />
                </View>
              ) : (
                <View style={[styles.placeholder, { width: IMG_W, height: IMG_H }]}>
                  <Text style={{ color: "#64748b" }}>Ingen billeder</Text>
                </View>
              )}

              {/* dots */}
              {images.length > 1 && (
                <View style={styles.dots}>
                  {images.map((_, i) => (
                    <View key={i} style={[styles.dot, i === index && styles.dotActive]} />
                  ))}
                </View>
              )}

              {/* Overskrift under billedet */}
              <Text style={[styles.titleBelow, { fontSize: TYPO.title }]}>{opslag.overskrift}</Text>

              {/* Info */}
              <View style={styles.body}>
                {!!opslag.kategori && <Text style={[styles.chip, { fontSize: TYPO.chip }]}>{opslag.kategori}</Text>}
                {!!opslag.omraade && <Text style={[styles.sub, { fontSize: TYPO.sub }]}>{opslag.omraade}</Text>}

                {/* BRØDTEKST */}
                <View ref={textZoneRef}>
                  {!!opslag.text && <Text style={[styles.text, { fontSize: TYPO.text }]}>{opslag.text}</Text>}
                </View>
              </View>
            </ScrollView>

            {/* Handling – fast i bunden */}
            <View style={[styles.footer, isTablet && { paddingVertical: 12 }]}>
              {/* Sekundære handlinger til venstre */}
              <View style={styles.secondaryRow}>
                <TouchableOpacity
                  onPress={handleCopyLink}
                  style={[styles.smallBtn, styles.secondaryBtn]}
                  hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                >
                  <Text style={styles.secondaryText}>KOPIÉR LINK</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={handleShare}
                  style={[styles.smallBtn, styles.secondaryBtn]}
                  hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                >
                  <Text style={styles.secondaryText}>DEL</Text>
                </TouchableOpacity>
              </View>

              {/* Primær til højre */}
              {isOwn ? (
                <View style={[styles.smallBtn, styles.secondaryBtn]}>
                  <Text style={[styles.secondaryText, { color: "#334155", fontWeight: "800" }]}>
                    Det er dit opslag
                  </Text>
                </View>
              ) : (
                <TouchableOpacity style={[styles.smallBtn, styles.primaryBtn]} onPress={onSendSvar}>
                  <Text style={[styles.secondaryText, { color: "#fff" }]}>Skriv besked</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        </Animated.View>
      </View>

      {/* LIGHTBOX */}
      <Modal
        visible={lightboxOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setLightboxOpen(false)}
      >
        <View style={styles.lightboxBg}>
          <TouchableOpacity
            onPress={() => setLightboxOpen(false)}
            style={[styles.lightboxCloseBtn, isTablet && { top: 50, right: 28 }]}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Text style={[styles.lightboxCloseText, isTablet && { fontSize: 22 }]}>✕</Text>
          </TouchableOpacity>

          <View style={{ flex: 1 }}>
            <FlatList
              ref={lightboxRef}
              data={images}
              keyExtractor={(u, i) => "big_" + u + "_" + i}
              horizontal
              pagingEnabled
              showsHorizontalScrollIndicator={false}
              initialScrollIndex={lightboxIndex}
              getItemLayout={(_data, i) => ({ index: i, length: W, offset: W * i })}
              onMomentumScrollEnd={(e) => {
                const i = Math.round(e.nativeEvent.contentOffset.x / W);
                if (i !== lightboxIndex) setLightboxIndex(i);
              }}
              renderItem={({ item }) => (
                <ScrollView
                  style={{ width: W, height: H }}
                  contentContainerStyle={styles.zoomContainer}
                  maximumZoomScale={4}
                  minimumZoomScale={1}
                  bounces={false}
                  centerContent
                >
                  <Image
                    source={{ uri: item }}
                    style={{ width: W, height: Math.min(H * 0.9, W * 1.6), backgroundColor: "black" }}
                    resizeMode="contain"
                  />
                </ScrollView>
              )}
            />
          </View>

          {images.length > 1 && (
            <View style={styles.lightboxDots}>
              {images.map((_, i) => (
                <View key={i} style={[styles.lightboxDot, i === lightboxIndex && styles.lightboxDotActive]} />
              ))}
            </View>
          )}
        </View>
      </Modal>
    </Modal>
  );
}

/* ───────── styles ───────── */
const SMALL_BTN_H = 34; // ens højde for alle tre knapper
const SMALL_BTN_RADIUS = 10;
const SMALL_BTN_PAD_H = 12;

const styles = StyleSheet.create({
  root: { flex: 1 },
  dim: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(20, 30, 40, 1)" },
  cardContainer: { flex: 1, alignItems: "center", justifyContent: "center", padding: 16 },
  card: { width: "100%", backgroundColor: "#fff", borderRadius: 16, overflow: "hidden" },

  topbar: {
    height: 52,
    paddingLeft: 12,
    paddingRight: 20,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#fff",
  },
  grabber: { width: 40, height: 5, borderRadius: 5, backgroundColor: "#E5E7EB" },
  closeBtn: { height: "100%", justifyContent: "center", paddingLeft: 0, paddingTop: 8, paddingRight: 0 },
  closeIcon: { fontSize: 24, color: "#0f172a", fontWeight: "900" },

  scrollArea: { flexGrow: 0 },

  sliderWrap: { marginTop: 8, borderRadius: 0, overflow: "hidden", backgroundColor: "#e5e7eb" },
  sliderFrame: { width: "100%", height: "100%" },
  sliderImage: { width: "100%", height: "100%" },

  placeholder: {
    alignSelf: "center",
    backgroundColor: "#f1f5f9",
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 8,
  },

  dots: { flexDirection: "row", gap: 6, alignSelf: "center", marginTop: 8 },
  dot: { width: 7, height: 7, borderRadius: 7, backgroundColor: "#cbd5e1" },
  dotActive: { backgroundColor: "#0f172a" },

  titleBelow: { fontWeight: "700", color: "#0f172a", marginTop: 12, paddingHorizontal: 14, textAlign: "left" },

  body: { marginTop: 8, paddingHorizontal: 14 },
  chip: {
    alignSelf: "flex-start",
    paddingHorizontal: 15,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: "#eef2ff",
    color: "#1e293b",
    fontWeight: "800",
    marginBottom: 10,
  },
  sub: { color: "#334155", marginBottom: 6, fontWeight: "700" },
  text: { color: "#0f172a", lineHeight: 22 },

  footer: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#EDF2F7",
    backgroundColor: "#fff",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },

  /* Fælles “small button” base – bruges af alle tre */
  smallBtn: {
    minHeight: SMALL_BTN_H,
    borderRadius: SMALL_BTN_RADIUS,
    paddingHorizontal: SMALL_BTN_PAD_H,
    alignItems: "center",
    justifyContent: "center",
  },

  /* Sekundære knapper (venstre) */
  secondaryRow: { flexDirection: "row", gap: 8 },
  secondaryBtn: {
    backgroundColor: "#e9eef5",
  },
  secondaryText: { color: "#0f172a", fontWeight: "800", fontSize: 12 },

  /* Primær (højre) – samme størrelse, blot mørk baggrund */
  primaryBtn: { backgroundColor: "#131921" },

  lightboxBg: { flex: 1, backgroundColor: "#000", justifyContent: "center" },
  lightboxCloseBtn: {
    position: "absolute",
    top: 40,
    right: 20,
    zIndex: 10,
    backgroundColor: "rgba(255,255,255,0.14)",
    borderRadius: 18,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  lightboxCloseText: { color: "#fff", fontSize: 18, fontWeight: "900" },
  zoomContainer: { flexGrow: 1, alignItems: "center", justifyContent: "center" },
  lightboxDots: { position: "absolute", bottom: 30, alignSelf: "center", flexDirection: "row", gap: 8 },
  lightboxDot: { width: 8, height: 8, borderRadius: 8, backgroundColor: "rgba(255,255,255,0.35)" },
  lightboxDotActive: { backgroundColor: "#fff" },
});