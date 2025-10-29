// app/MineOpslag.tsx
import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Image,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions,
  Alert, // ⬅️ NY
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import BottomNav from "../components/BottomNav";
import OpretOpslagDialog from "../components/OpretOpslagDialog";
import OpslagDetaljeModal from "../components/OpslagDetaljeModal";
import { useMineOpslag } from "../hooks/useMineOpslag";
import { Post } from "../hooks/useOpslag";
import { supabase } from "../utils/supabase"; // ⬅️ NY

/* ───────── theme (matcher Opslag) ───────── */
const COLORS = {
  bg: "#869FB9",
  card: "#fff",
  text: "#131921",
  blue: "#131921",
  blueTint: "#25489022",
  red: "#e85c5c",
  white: "#fff",
  gray: "#666",
  orange: "#e89c5c",
  orangeTint: "#e89c5c22",
};
const RADII = { sm: 14, md: 18, lg: 24, xl: 28, full: 999 };
const SHADOW = {
  card: {
    shadowColor: "#000",
    shadowOpacity: 0.07,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  lift: {
    shadowColor: "#000",
    shadowOpacity: 0.09,
    shadowRadius: 7,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
};

const GRID_GAP = 18;
const H_PADDING = 14;

/* Tekstlinje-højder for konsistent korthøjde (1 linje hver) */
const LH = { title: 20, place: 18, teaser: 18 };

const V_SPACING = {
  afterImage: 10,
  afterBadge: 7,
  betweenTitlePlace: 2,
  betweenPlaceTeaser: 2,
  cardPaddingTop: 12,
  cardPaddingBottom: 22,
};

const CHIP = { padV: 6, padH: 14, font: 13, line: 16 };
/* Reserveret højde til chip-række (kan rumme to chips side-by-side) */
const BADGE_BLOCK_H = CHIP.line + CHIP.padV * 2 + V_SPACING.afterBadge + 4; // = 39

const ACTIONS_MARGIN_TOP = 12;
const ACTION_BUTTON_BUFFER = 40;

/* Konfiguration for udløb */
const EXPIRES_DAYS = 14;
const MS_HOUR = 60 * 60 * 1000;
const MS_DAY = 24 * MS_HOUR;
const SOON_THRESHOLD_MS = 2 * MS_DAY; // < 48 timer = "snart"

/* Helper: vælg primært billede robust */
function getPrimaryImage(p: Partial<Post> | undefined | null): string | null {
  if (!p) return null;
  return (
    (p as any).image_url ||
    (Array.isArray((p as any).images) && (p as any).images[0]) ||
    (Array.isArray((p as any).image_urls) && (p as any).image_urls[0]) ||
    null
  );
}

/* Helper: udregn og formater hvor lang tid der er tilbage.
   Bruger 'expires_at' hvis tilgængelig, ellers created_at + 14 dage. */
function getExpiry(p: Partial<Post>): {
  label: string; // "Udløber om 5d 3t" / "Udløbet"
  state: "ok" | "soon" | "overdue";
} {
  const createdMs = p?.created_at ? Date.parse(p.created_at as string) : NaN;
  const expiresMsExplicit = (p as any)?.expires_at ? Date.parse((p as any).expires_at as string) : NaN;

  const fallbackExpires =
    Number.isFinite(createdMs) ? createdMs + EXPIRES_DAYS * MS_DAY : NaN;

  const expiresAt = Number.isFinite(expiresMsExplicit) ? expiresMsExplicit : fallbackExpires;
  if (!Number.isFinite(expiresAt)) return { label: "", state: "ok" };

  const diff = expiresAt - Date.now();
  if (diff <= 0) return { label: "Udløbet", state: "overdue" };

  const days = Math.floor(diff / MS_DAY);
  const hours = Math.floor((diff % MS_DAY) / MS_HOUR);

  const label = days > 0 ? `Udløber om ${days}d ${hours}t` : `Udløber om ${hours}t`;
  const state = diff < SOON_THRESHOLD_MS ? "soon" : "ok";
  return { label, state };
}

export default function MineOpslagScreen() {
  const {
    userId,
    mineOpslag = [],
    loading,
    createPost,
    updatePost,
    deletePost,
    refetchMineOpslag,
  } = useMineOpslag() as any;

  const [detaljeVisible, setDetaljeVisible] = useState(false);
  const [valgtOpslag, setValgtOpslag] = useState<Post | null>(null);

  const [dialogState, setDialogState] = useState<{
    visible: boolean;
    mode: "create" | "edit";
    initialData: Post | null;
  }>({ visible: false, mode: "create", initialData: null });

  // layout
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const isPhone = width < 650;
  const NUM_COLS = isPhone ? 1 : width >= 900 ? 3 : 2;
  const isGrid = NUM_COLS > 1;

  const INNER_WIDTH = Math.max(0, width - H_PADDING * 2);
  const itemWidth = isGrid ? (INNER_WIDTH - GRID_GAP * (NUM_COLS - 1)) / NUM_COLS : "100%";

  const IMAGE_H = isPhone ? 250 : 220;

  const CARD_H =
    V_SPACING.cardPaddingTop +
    IMAGE_H +
    V_SPACING.afterImage +
    BADGE_BLOCK_H +
    LH.title +
    V_SPACING.betweenTitlePlace +
    LH.place +
    V_SPACING.betweenPlaceTeaser +
    LH.teaser +
    ACTIONS_MARGIN_TOP +
    ACTION_BUTTON_BUFFER +
    V_SPACING.cardPaddingBottom;

  /* Sticky header uden pop */
  const headerHRef = useRef(0);
  const [headerH, setHeaderH] = useState(0);
  const scrollY = useRef(new Animated.Value(0)).current;

  const negativePart = scrollY.interpolate({ inputRange: [-200, 0], outputRange: [-200, 0], extrapolate: "clamp" });
  const nonNegativeY = Animated.subtract(scrollY, negativePart);
  const clamped = Animated.diffClamp(nonNegativeY, 0, Math.max(1, headerH));
  const headerTranslateY = clamped.interpolate({ inputRange: [0, headerH], outputRange: [0, -headerH], extrapolate: "clamp" });

  const listPaddingTop = headerH;

  const BOTTOM_NAV_H = 86;
  const bottomSpacer = BOTTOM_NAV_H + insets.bottom + 14;

  /* Pull-to-refresh */
  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = async () => {
    setRefreshing(true);
    try {
      if (typeof refetchMineOpslag === "function") await refetchMineOpslag();
      else await new Promise((r) => setTimeout(r, 450));
    } finally {
      setRefreshing(false);
    }
  };

  /* Tick hvert minut, så “Udløber om …” opdaterer sig selv */
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((n) => n + 1), 60 * 1000);
    return () => clearInterval(id);
  }, []);

  const handleDialogSubmit = async (data: any) => {
    const ok = dialogState.mode === "create" ? await createPost(data) : await updatePost(data);
    if (ok) {
      setDialogState({ visible: false, mode: "create", initialData: null });
      try { await refetchMineOpslag?.(); } catch {}
    }
  };

  // ⬇️ NY: Forlæng 1 uge
  const handleExtend = async (postId: string) => {
    try {
      const newExpiry = new Date(Date.now() + 7 * MS_DAY).toISOString();
      const { error } = await supabase
        .from("posts")
        .update({ expires_at: newExpiry })
        .eq("id", postId);

      if (error) throw error;
      Alert.alert("Forlænget", "Opslaget er forlænget med 7 dage.");
      await refetchMineOpslag?.();
    } catch (err: any) {
      console.error("Fejl ved forlængelse:", err);
      Alert.alert("Fejl", err?.message ?? "Kunne ikke forlænge opslaget.");
    }
  };

  return (
    <View style={styles.root}>
      {/* Sticky top-CTA */}
      <Animated.View
        style={[styles.headerWrap, { transform: [{ translateY: headerTranslateY }], paddingHorizontal: H_PADDING }]}
        onLayout={(e) => {
          const h = Math.round(e.nativeEvent.layout.height);
          if (headerHRef.current !== h) { headerHRef.current = h; setHeaderH(h); }
        }}
      >
        <SafeAreaView edges={["top"]}>
          <TouchableOpacity
            style={styles.primaryCta}
            onPress={() => setDialogState({ visible: true, mode: "create", initialData: null })}
            activeOpacity={0.88}
          >
            <Text style={styles.primaryCtaText}>OPRET NYT OPSLAG</Text>
          </TouchableOpacity>
        </SafeAreaView>
      </Animated.View>

      {/* Liste */}
      {loading ? (
        <ActivityIndicator size="large" color={COLORS.blue} style={{ marginTop: listPaddingTop + 30 }} />
      ) : (
        <Animated.FlatList
          data={mineOpslag}
          key={NUM_COLS}
          keyExtractor={(item) => item.id}
          style={{ width: "100%" }}
          ListHeaderComponent={<View style={{ height: listPaddingTop }} />}
          contentContainerStyle={{ paddingTop: 8, paddingBottom: bottomSpacer, paddingHorizontal: H_PADDING }}
          numColumns={NUM_COLS}
          columnWrapperStyle={isGrid ? { gap: GRID_GAP } : undefined}
          extraData={tick}
          renderItem={({ item, index }) => {
            const img = getPrimaryImage(item);
            const title = item.overskrift ?? "";
            const place = item.omraade ?? "";
            const teaser = item.text ?? "";
            const expiry = getExpiry(item);

            return (
              <TouchableOpacity
                onPress={() => { setValgtOpslag(item); setDetaljeVisible(true); }}
                activeOpacity={0.85}
                style={{
                  width: isGrid ? (itemWidth as number) : "100%",
                  marginBottom: index === mineOpslag.length - 1 ? 0 : 18,
                }}
              >
                <View style={[styles.card, { height: CARD_H, overflow: "hidden" }]}>
                  {/* Billede / placeholder */}
                  {img ? (
                    <Image source={{ uri: img }} style={[styles.cardImage, { height: IMAGE_H }]} />
                  ) : (
                    <View style={[styles.cardImage, styles.noImageBox, { height: IMAGE_H }]}>
                      <Text style={styles.noImageText}>Ingen billeder</Text>
                    </View>
                  )}

                  {/* Chip-række: kategori + udløb */}
                  <View style={{ height: BADGE_BLOCK_H, justifyContent: "flex-end" }}>
                    <View style={{ flexDirection: "row", gap: 8 }}>
                      {!!item.kategori && (
                        <View style={styles.badge}>
                          <Text style={styles.badgeText} numberOfLines={1}>{item.kategori}</Text>
                        </View>
                      )}

                      {!!expiry.label && (
                        <View
                          style={[
                            styles.badge,
                            expiry.state === "ok" && styles.badgeInfo,
                            expiry.state === "soon" && styles.badgeSoon,
                            expiry.state === "overdue" && styles.badgeDanger,
                          ]}
                        >
                          <Text
                            style={[
                              styles.badgeText,
                              (expiry.state === "soon" || expiry.state === "overdue") && { fontWeight: "900" },
                            ]}
                            numberOfLines={1}
                          >
                            {expiry.label}
                          </Text>
                        </View>
                      )}
                    </View>
                  </View>

                  {/* Tekster */}
                  <Text style={[styles.cardTitle, { lineHeight: LH.title }]} numberOfLines={1} ellipsizeMode="tail">
                    {title}
                  </Text>
                  <Text style={[styles.cardPlace, { lineHeight: LH.place }]} numberOfLines={1} ellipsizeMode="tail">
                    {place}
                  </Text>
                  <Text style={[styles.cardTeaser, { lineHeight: LH.teaser }]} numberOfLines={1} ellipsizeMode="tail">
                    {teaser}
                  </Text>

                  {/* Knapper */}
                  <View style={[styles.actionsRow, { marginTop: ACTIONS_MARGIN_TOP }]}>
                    {/* Forlæng vises når udløb er “snart” */}
                    {expiry.state === "soon" && (
                      <TouchableOpacity
                        style={[styles.btn, styles.btnOrange]}
                        onPress={() => handleExtend(item.id)}
                        activeOpacity={0.9}
                      >
                        <Text style={styles.btnText}>FORLÆNG 1 UGE</Text>
                      </TouchableOpacity>
                    )}

                    <TouchableOpacity
                      style={[styles.btn, styles.btnBlue]}
                      onPress={() => setDialogState({ visible: true, mode: "edit", initialData: item })}
                      activeOpacity={0.9}
                    >
                      <Text style={styles.btnText}>RET</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.btn, styles.btnRed]}
                      onPress={() => deletePost(item.id)}
                      activeOpacity={0.9}
                    >
                      <Text style={styles.btnText}>SLET</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </TouchableOpacity>
            );
          }}
          ListEmptyComponent={<Text style={styles.emptyText}>Du har ikke oprettet nogen opslag endnu.</Text>}
          onScroll={Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], { useNativeDriver: true })}
          scrollEventThrottle={16}
          bounces
          alwaysBounceVertical
          overScrollMode="always"
          scrollIndicatorInsets={{ top: listPaddingTop, bottom: bottomSpacer }}
          contentInsetAdjustmentBehavior="never"
          keyboardShouldPersistTaps="handled"
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[COLORS.blue]} />}
        />
      )}

      {/* Detalje-modal */}
      <OpslagDetaljeModal
        visible={detaljeVisible}
        opslag={valgtOpslag}
        currentUserId={userId}
        onClose={() => setDetaljeVisible(false)}
        onSendSvar={() => {}}
      />

      {/* Opret/Ret dialog */}
      <OpretOpslagDialog
        visible={dialogState.visible}
        onClose={() => setDialogState({ visible: false, mode: "create", initialData: null })}
        onSubmit={handleDialogSubmit}
        initialValues={dialogState.initialData}
      />

      <BottomNav />
    </View>
  );
}

/* ───────── styles ───────── */
const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.bg },

  headerWrap: {
    position: "absolute",
    top: 0, left: 0, right: 0,
    backgroundColor: COLORS.bg,
    paddingTop: 8,
    borderBottomLeftRadius: 40,
    borderBottomRightRadius: 40,
    paddingBottom: 20,
    zIndex: 20,
  },

  primaryCta: {
    width: "100%",
    backgroundColor: COLORS.blue,
    borderRadius: RADII.full,
    paddingVertical: 14,
    paddingHorizontal: 20,
    marginTop: 10,
    alignItems: "center",
    ...SHADOW.lift,
  },
  primaryCtaText: { color: COLORS.white, fontSize: 17, fontWeight: "bold", letterSpacing: 1 },

  card: {
    backgroundColor: COLORS.card,
    borderRadius: RADII.xl,
    paddingTop: V_SPACING.cardPaddingTop,
    paddingBottom: V_SPACING.cardPaddingBottom,
    paddingHorizontal: 14,
    width: "100%",
    minWidth: 0,
    alignItems: "flex-start",
    ...SHADOW.card,
  },
  cardImage: {
    width: "100%",
    borderRadius: RADII.lg,
    marginBottom: V_SPACING.afterImage,
    height: 160,
    resizeMode: "cover",
  },
  noImageBox: { backgroundColor: "#E7EBF0", alignItems: "center", justifyContent: "center" },
  noImageText: { color: "#536071", fontWeight: "700" },

  /* Kategori-chip (basis) */
  badge: {
    alignSelf: "flex-start",
    backgroundColor: COLORS.blueTint,
    borderRadius: RADII.full,
    paddingHorizontal: CHIP.padH,
    paddingVertical: CHIP.padV,
    marginBottom: V_SPACING.afterBadge,
  },
  /* Udløbs-variant: normal/soon/danger */
  badgeInfo: { backgroundColor: COLORS.blueTint },
  badgeSoon: { backgroundColor: COLORS.orangeTint, borderWidth: 1, borderColor: COLORS.orange },
  badgeDanger: { backgroundColor: "#e85c5c22", borderWidth: 1, borderColor: COLORS.red },

  badgeText: {
    color: COLORS.text,
    fontWeight: "800",
    fontSize: CHIP.font,
    lineHeight: CHIP.line,
  },

  /* Tekster (1 linje hver) */
  cardTitle: { fontWeight: "bold", fontSize: 16, marginBottom: V_SPACING.betweenTitlePlace, textDecorationLine: "underline", color: COLORS.text },
  cardPlace: { fontSize: 14, color: "#222", marginBottom: V_SPACING.betweenPlaceTeaser },
  cardTeaser: { fontSize: 14, color: "#444" },

  /* Knaprække */
  actionsRow: { flexDirection: "row", alignSelf: "flex-end", gap: 8 },

  btn: { borderRadius: RADII.full, paddingHorizontal: 14, paddingVertical: 8, minHeight: 32, alignItems: "center", justifyContent: "center" },
  btnBlue: { backgroundColor: COLORS.blue },
  btnRed: { backgroundColor: COLORS.red },
  btnOrange: { backgroundColor: COLORS.orange }, // ⬅️ NY
  btnText: { color: COLORS.white, fontWeight: "bold", fontSize: 13, letterSpacing: 0.5 },

  emptyText: { color: COLORS.gray, marginTop: 22, alignSelf: "center" },
});