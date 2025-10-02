// app/MineOpslag.tsx
import React, { useRef, useState } from "react";
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
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import BottomNav from "../components/BottomNav";
import OpretOpslagDialog from "../components/OpretOpslagDialog";
import OpslagDetaljeModal from "../components/OpslagDetaljeModal";
import { useMineOpslag } from "../hooks/useMineOpslag";
import { Post } from "../hooks/useNabolag";

/* ───────── theme ───────── */
const COLORS = {
  bg: "#7C8996",
  card: "#fff",
  text: "#131921",
  blue: "#131921",
  blueTint: "#25489022",
  red: "#e85c5c",
  white: "#fff",
  gray: "#666",
};
const RADII = { sm: 8, md: 10, lg: 14, xl: 18 };
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
  afterBadge: 7,           // margin under chip
  betweenTitlePlace: 2,
  betweenPlaceTeaser: 2,
  cardPaddingTop: 12,
  cardPaddingBottom: 12,
};

/* Chip-dimensioner (matcher Nabolag) */
const CHIP = {
  padV: 6,
  padH: 14,
  font: 13,
  line: 16,
};
/* Badge-reserveret højde = chipH + marginBottom + lidt luft */
const BADGE_BLOCK_H = CHIP.line + CHIP.padV * 2 + V_SPACING.afterBadge + 4; // 16+12+7+4 = 39

/* Knaprække (kompakt) */
const ACTIONS_MARGIN_TOP = 8;
const ACTION_BUTTON_BUFFER = 40; // reserveret buffer i korthøjden

export default function MineOpslagScreen() {
  const { userId, mineOpslag, loading, createPost, updatePost, deletePost, refetchMineOpslag } =
    (useMineOpslag() as any);

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

  // Ens billedehøjde pr. device-type
  const IMAGE_H = isPhone ? 250 : 220;

  // Ens korthøjde (billede + badge-blok + 3 linjer tekst + spacing + paddings + knap-buffer)
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

  const negativePart = scrollY.interpolate({
    inputRange: [-200, 0],
    outputRange: [-200, 0],
    extrapolate: "clamp",
  });
  const nonNegativeY = Animated.subtract(scrollY, negativePart);
  const clamped = Animated.diffClamp(nonNegativeY, 0, Math.max(1, headerH));
  const headerTranslateY = clamped.interpolate({
    inputRange: [0, headerH],
    outputRange: [0, -headerH],
    extrapolate: "clamp",
  });

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

  const handleDialogSubmit = async (data: any) => {
    const ok = dialogState.mode === "create" ? await createPost(data) : await updatePost(data);
    if (ok) {
      setDialogState({ visible: false, mode: "create", initialData: null });
      try { await refetchMineOpslag?.(); } catch {}
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
          renderItem={({ item, index }) => (
            <TouchableOpacity
              onPress={() => { setValgtOpslag(item); setDetaljeVisible(true); }}
              activeOpacity={0.85}
              style={{
                width: isGrid ? (itemWidth as number) : "100%",
                marginBottom: index === mineOpslag.length - 1 ? 0 : 18,
              }}
            >
              <View style={[styles.card, { height: CARD_H, overflow: "hidden" }]}>
                {/* Ens billedehøjde */}
                {!!item.image_url && (
                  <Image source={{ uri: item.image_url }} style={[styles.cardImage, { height: IMAGE_H }]} />
                )}

                {/* Reserveret badge-område (ens højde) */}
                <View style={{ height: BADGE_BLOCK_H, justifyContent: "flex-end" }}>
                  {!!item.kategori && (
                    <View style={styles.badge}>
                      <Text style={styles.badgeText} numberOfLines={1}>{item.kategori}</Text>
                    </View>
                  )}
                </View>

                {/* 1 linje titel */}
                <Text style={[styles.cardTitle, { lineHeight: LH.title }]} numberOfLines={1} ellipsizeMode="tail">
                  {item.overskrift}
                </Text>

                {/* 1 linje placering */}
                <Text style={[styles.cardPlace, { lineHeight: LH.place }]} numberOfLines={1} ellipsizeMode="tail">
                  {item.omraade}
                </Text>

                {/* 1 linje brødtekst */}
                <Text style={[styles.cardTeaser, { lineHeight: LH.teaser }]} numberOfLines={1} ellipsizeMode="tail">
                  {item.text}
                </Text>

                {/* Knaprække (kompakt) */}
                <View style={[styles.actionsRow, { marginTop: ACTIONS_MARGIN_TOP }]}>
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
          )}
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

      {/* Detalje-modal – viser “Det er dit opslag” og deaktiverer besked-knap */}
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

  /* Sticky header */
  headerWrap: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    backgroundColor: COLORS.bg,
    paddingTop: 8,
    paddingBottom: 10,
    zIndex: 20,
  },

  /* CTA */
  primaryCta: {
    width: "100%",
    backgroundColor: COLORS.blue,
    borderRadius: RADII.sm,
    paddingVertical: 12,
    paddingHorizontal: 18,
    marginTop: 10,
    alignItems: "center",
    borderWidth: 3,
    borderColor: COLORS.white,
    ...SHADOW.lift,
  },
  primaryCtaText: { color: COLORS.white, fontSize: 17, fontWeight: "bold", letterSpacing: 1 },

  /* Kort */
  card: {
    backgroundColor: COLORS.card,
    borderRadius: RADII.lg,
    paddingTop: V_SPACING.cardPaddingTop,
    paddingBottom: V_SPACING.cardPaddingBottom,
    paddingHorizontal: 12,
    width: "100%",
    minWidth: 0,
    alignItems: "flex-start",
    ...SHADOW.card,
  },
  cardImage: {
    width: "100%",
    borderRadius: RADII.md,
    marginBottom: V_SPACING.afterImage,
    height: 160, // overstyres inline
    resizeMode: "cover",
  },

  /* Kategori-chip — samme look som i Nabolag */
  badge: {
    alignSelf: "flex-start",
    backgroundColor: COLORS.blueTint,
    borderRadius: 999,
    paddingHorizontal: CHIP.padH,
    paddingVertical: CHIP.padV,
    marginBottom: V_SPACING.afterBadge,
  },
  badgeText: {
    color: COLORS.text,
    fontWeight: "800",
    fontSize: CHIP.font,
    lineHeight: CHIP.line,
  },

  /* Tekster (1 linje hver) */
  cardTitle: {
    fontWeight: "bold",
    fontSize: 16,
    marginBottom: V_SPACING.betweenTitlePlace,
    textDecorationLine: "underline",
    color: COLORS.text,
  },
  cardPlace: { fontSize: 14, color: "#222", marginBottom: V_SPACING.betweenPlaceTeaser },
  cardTeaser: { fontSize: 14, color: "#444" },

  /* Knaprække — kompakt */
  actionsRow: {
    flexDirection: "row",
    alignSelf: "flex-end",
    gap: 8,
  },

  /* Knapper — small og smalle */
  btn: {
    borderRadius: RADII.sm,
    paddingHorizontal: 12,
    paddingVertical: 6,
    minHeight: 30,
    alignItems: "center",
    justifyContent: "center",
  },
  btnBlue: { backgroundColor: COLORS.blue },
  btnRed: { backgroundColor: COLORS.red },
  btnText: { color: COLORS.white, fontWeight: "bold", fontSize: 13, letterSpacing: 0.5 },

  /* Tom liste */
  emptyText: { color: COLORS.gray, marginTop: 22, alignSelf: "center" },
});