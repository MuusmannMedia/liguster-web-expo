// app/Nabolag.tsx
import React, { useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  Image,
  Keyboard,
  Modal,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";

import BottomNav from "../components/BottomNav";
import OpretOpslagDialog from "../components/OpretOpslagDialog";
import OpslagDetaljeModal from "../components/OpslagDetaljeModal";
import SvarModal from "../components/SvarModal";
import { Post, useNabolag } from "../hooks/useNabolag";
import { supabase } from "../utils/supabase";

/* ───────── theme ───────── */
const COLORS = {
  bg: "#7C8996",
  text: "#131921",
  white: "#fff",
  blue: "#131921",
  blueTint: "#25489022",
  grayText: "#666",
  fieldBorder: "#c7ced6",
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

/* ─────────────────────────────
   LAYOUT-VARIABLER (nemme at tweake)
   Brug disse til at styre layout per enhedstype.
   ───────────────────────────── */
const BREAKPOINTS = {
  LARGE_PHONE_MIN_WIDTH: 430, // iPhone Pro Max = 430dp (logisk bredde)
  TABLET_MIN_WIDTH: 768,
  WIDE_GRID_MIN_WIDTH: 900, // når vi vil have 3 kolonner
};

// Lille mobil (smaller than 430dp)
const SMALL_PHONE = {
  NUM_COLS: 1,
  H_PADDING: 14,
  GRID_GAP: 18,
  CARD_BOTTOM_MARGIN: 18,
  IMAGE_HEIGHT: 250,
};

// Stor mobil (≥ 430dp og < 768dp)
const LARGE_PHONE = {
  NUM_COLS: 1, // hold én kolonne på store mobiler
  H_PADDING: 14,
  GRID_GAP: 18,
  CARD_BOTTOM_MARGIN: 20,
  IMAGE_HEIGHT: 330,
};

// Tablet (≥ 768dp)
const TABLET = {
  H_PADDING: 14,
  GRID_GAP: 18,
  CARD_BOTTOM_MARGIN: 22,
  IMAGE_HEIGHT: 220,
  CARD_HEIGHT: 350, // fast korthøjde for ens korthøjde på tablet
};

/* ───────── dialogs ───────── */
function RadiusDialog({
  visible,
  value,
  onClose,
  onChange,
}: {
  visible: boolean;
  value: number;
  onClose: () => void;
  onChange: (v: number) => void;
}) {
  const distances = [1, 2, 3, 5, 10, 20, 50];
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={dialogStyles.overlay}>
        <View style={dialogStyles.dialog}>
          <Text style={dialogStyles.title}>Vis opslag indenfor</Text>
          {distances.map((d) => (
            <TouchableOpacity
              key={d}
              style={[dialogStyles.option, d === value && dialogStyles.selectedOption]}
              onPress={() => {
                onChange(d);
                onClose();
              }}
            >
              <Text style={{ fontWeight: d === value ? "bold" : "normal" }}>{d} km</Text>
            </TouchableOpacity>
          ))}
          <TouchableOpacity style={dialogStyles.closeBtn} onPress={onClose}>
            <Text style={dialogStyles.closeBtnText}>Luk</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

function KategoriDialog({
  visible,
  value,
  onClose,
  onChange,
}: {
  visible: boolean;
  value: string | null;
  onClose: () => void;
  onChange: (v: string | null) => void;
}) {
  const { KATEGORIER } = require("../hooks/useNabolag");
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={dialogStyles.overlay}>
        <View style={dialogStyles.dialog}>
          <Text style={dialogStyles.title}>Vælg kategori</Text>
          {KATEGORIER.map((k: string) => (
            <TouchableOpacity
              key={k}
              style={[dialogStyles.option, k === value && dialogStyles.selectedOption]}
              onPress={() => {
                onChange(k);
                onClose();
              }}
            >
              <Text style={{ fontWeight: k === value ? "bold" : "normal" }}>{k}</Text>
            </TouchableOpacity>
          ))}
          <TouchableOpacity style={dialogStyles.closeBtn} onPress={onClose}>
            <Text style={dialogStyles.closeBtnText}>Luk</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

/* ───────── screen ───────── */
export default function Nabolag() {
  const {
    userId,
    userLocation,
    loading,
    refreshing,
    filteredPosts,
    searchQuery,
    setSearchQuery,
    radius,
    handleRadiusChange,
    kategoriFilter,
    setKategoriFilter,
    onRefresh,
    createPost,
    distanceInKm,
  } = useNabolag();

  const [opretVisible, setOpretVisible] = useState(false);
  const [detaljeVisible, setDetaljeVisible] = useState(false);
  const [svarVisible, setSvarVisible] = useState(false);
  const [radiusVisible, setRadiusVisible] = useState(false);
  const [kategoriVisible, setKategoriVisible] = useState(false);
  const [valgtOpslag, setValgtOpslag] = useState<Post | null>(null);

  // layout
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();

  const isTablet = width >= BREAKPOINTS.TABLET_MIN_WIDTH;
  const isLargePhone = !isTablet && width >= BREAKPOINTS.LARGE_PHONE_MIN_WIDTH;

  // Kolonner
  const NUM_COLS = isTablet ? (width >= BREAKPOINTS.WIDE_GRID_MIN_WIDTH ? 3 : 2) : isLargePhone ? LARGE_PHONE.NUM_COLS : SMALL_PHONE.NUM_COLS;

  // Gitterafstand/padding
  const GRID_GAP = isTablet ? TABLET.GRID_GAP : isLargePhone ? LARGE_PHONE.GRID_GAP : SMALL_PHONE.GRID_GAP;
  const H_PADDING = isTablet ? TABLET.H_PADDING : isLargePhone ? LARGE_PHONE.H_PADDING : SMALL_PHONE.H_PADDING;

  const INNER_WIDTH = Math.max(0, width - H_PADDING * 2);
  const isGrid = NUM_COLS > 1;
  const itemWidth = isGrid ? (INNER_WIDTH - GRID_GAP * (NUM_COLS - 1)) / NUM_COLS : "100%";

  // Kort/billede-højder
  const imageHeight = isTablet ? TABLET.IMAGE_HEIGHT : isLargePhone ? LARGE_PHONE.IMAGE_HEIGHT : SMALL_PHONE.IMAGE_HEIGHT;

  const CARD_H = isTablet ? TABLET.CARD_HEIGHT : undefined;
  const CARD_BOTTOM_MARGIN = isTablet ? TABLET.CARD_BOTTOM_MARGIN : isLargePhone ? LARGE_PHONE.CARD_BOTTOM_MARGIN : SMALL_PHONE.CARD_BOTTOM_MARGIN;

  const handleOpretOpslag = async (postData: any) => {
    const success = await createPost(postData);
    if (success) setOpretVisible(false);
  };

  /* ── hide/show header on scroll ── */
  const headerHeightRef = useRef(0);
  const [headerHeight, setHeaderHeight] = useState(0);
  const scrollY = useRef(new Animated.Value(0)).current;

  // ignorér negativ scroll (pull-to-refresh)
  const negativePart = scrollY.interpolate({
    inputRange: [-200, 0],
    outputRange: [-200, 0],
    extrapolate: "clamp",
  });
  const nonNegativeY = Animated.subtract(scrollY, negativePart);

  const clamped = Animated.diffClamp(nonNegativeY, 0, Math.max(1, headerHeight));
  const headerTranslateY = clamped.interpolate({
    inputRange: [0, headerHeight],
    outputRange: [0, -headerHeight],
    extrapolate: "clamp",
  });

  const listPaddingTop = headerHeight;

  // Højde på BottomNav
  const BOTTOM_NAV_H = 86;
  const bottomSpacer = BOTTOM_NAV_H + insets.bottom + 14;

  return (
    <View style={styles.root}>
      {/* Sticky header */}
      <Animated.View
        style={[styles.headerWrap, { transform: [{ translateY: headerTranslateY }], paddingHorizontal: H_PADDING }]}
        onLayout={(e) => {
          const h = e.nativeEvent.layout.height;
          if (headerHeightRef.current !== h) {
            headerHeightRef.current = h;
            setHeaderHeight(h);
          }
        }}
      >
        <SafeAreaView edges={["top"]}>
          <TouchableOpacity style={styles.primaryCta} onPress={() => setOpretVisible(true)} activeOpacity={0.88}>
            <Text style={styles.primaryCtaText}>OPRET NYT OPSLAG</Text>
          </TouchableOpacity>

          {/* Filters */}
          <View style={styles.filterRow}>
            <TextInput
              value={searchQuery}
              onChangeText={setSearchQuery}
              style={styles.searchInput}
              placeholder="Søg i opslag…"
              placeholderTextColor="#666"
              returnKeyType="search"
              onSubmitEditing={Keyboard.dismiss}
              blurOnSubmit
            />
            <TouchableOpacity style={styles.iconBtn} onPress={() => setKategoriVisible(true)} activeOpacity={0.8}>
              <Text style={styles.iconBtnText}>▼</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.radiusBtn} onPress={() => setRadiusVisible(true)}>
              <Text style={styles.radiusBtnText}>{radius} km</Text>
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </Animated.View>

      {/* Liste */}
      <Animated.View style={{ flex: 1, paddingHorizontal: H_PADDING }}>
        {loading ? (
          <ActivityIndicator size="large" color={COLORS.blue} style={{ marginTop: listPaddingTop + 30 }} />
        ) : (
          <Animated.FlatList
            data={filteredPosts}
            key={NUM_COLS}
            keyExtractor={(item) => item.id}
            style={{ width: "100%" }}
            contentContainerStyle={{
              paddingTop: 8,
              paddingBottom: bottomSpacer,
            }}
            ListHeaderComponent={<View style={{ height: listPaddingTop }} />}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            numColumns={NUM_COLS}
            columnWrapperStyle={isGrid ? { gap: GRID_GAP } : undefined}
            renderItem={({ item, index }) => (
              <TouchableOpacity
                onPress={() => {
                  setValgtOpslag(item);
                  setDetaljeVisible(true);
                }}
                style={{
                  width: isGrid ? (itemWidth as number) : "100%",
                  marginBottom: index === filteredPosts.length - 1 ? 0 : CARD_BOTTOM_MARGIN,
                }}
                activeOpacity={0.87}
              >
                <View style={[styles.card, CARD_H ? { height: CARD_H, overflow: "hidden" } : null]}>
                  {!!item.image_url && <Image source={{ uri: item.image_url }} style={[styles.cardImage, { height: imageHeight }]} />}
                  {!!item.kategori && (
                    <View style={styles.badge}>
                      <Text style={styles.badgeText}>{item.kategori}</Text>
                    </View>
                  )}

                  {/* Overskrift – maks 1 linje */}
                  <Text style={styles.cardTitle} numberOfLines={1} ellipsizeMode="tail">
                    {item.overskrift}
                  </Text>

                  {/* Brødtekst/teaser – maks 1 linje */}
                  <Text style={styles.cardTeaser} numberOfLines={1} ellipsizeMode="tail">
                    {item.text}
                  </Text>

                  {/* By + postnummer (placering) */}
                  <Text style={styles.cardPlace} numberOfLines={1} ellipsizeMode="tail">
                    {item.omraade}
                  </Text>
                </View>
              </TouchableOpacity>
            )}
            ListEmptyComponent={<Text style={[styles.emptyText, { paddingTop: listPaddingTop }]}>Ingen opslag fundet.</Text>}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[COLORS.blue]} />}
            onScroll={Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], {
              useNativeDriver: true,
              // dismiss tastatur når man scroller – også hvis man starter i "tomme" områder
              listener: () => Keyboard.dismiss(),
            })}
            scrollEventThrottle={16}
            bounces
            alwaysBounceVertical
            overScrollMode="always"
            // vigtigt: hele listeområdet er scrollbart, også mellem kortene
            scrollIndicatorInsets={{ top: listPaddingTop, bottom: bottomSpacer }}
            contentInsetAdjustmentBehavior="never"
          />
        )}
      </Animated.View>

      {/* Modals */}
      <OpslagDetaljeModal
        visible={detaljeVisible}
        opslag={valgtOpslag}
        currentUserId={userId}
        onClose={() => setDetaljeVisible(false)}
        onSendSvar={() => {
          // Åbn kun svar, hvis det IKKE er eget opslag
          if (!valgtOpslag || !userId) return;
          if (valgtOpslag.user_id === userId) {
            Alert.alert("Kan ikke svare", "Du kan ikke svare på dit eget opslag.");
            return;
          }
          setDetaljeVisible(false);
          setSvarVisible(true);
        }}
      />

      <SvarModal
        visible={svarVisible}
        onClose={() => setSvarVisible(false)}
        onSend={async (svarTekst) => {
          if (!valgtOpslag || !userId || !valgtOpslag.user_id) return;

          // Ekstra sikkerhed: blokér send til dig selv
          if (valgtOpslag.user_id === userId) {
            setSvarVisible(false);
            Alert.alert("Kan ikke svare", "Du kan ikke svare på dit eget opslag.");
            return;
          }

          const threadId = [userId, valgtOpslag.user_id].sort().join("_") + "_" + valgtOpslag.id;
          await supabase.from("messages").insert([
            {
              thread_id: threadId,
              sender_id: userId,
              receiver_id: valgtOpslag.user_id,
              post_id: valgtOpslag.id,
              text: svarTekst,
            },
          ]);
          setSvarVisible(false);
        }}
      />

      <OpretOpslagDialog visible={opretVisible} onClose={() => setOpretVisible(false)} onSubmit={handleOpretOpslag} currentUserId={userId} />

      <RadiusDialog visible={radiusVisible} value={radius} onClose={() => setRadiusVisible(false)} onChange={handleRadiusChange} />
      <KategoriDialog visible={kategoriVisible} value={kategoriFilter} onClose={() => setKategoriVisible(false)} onChange={setKategoriFilter} />

      <BottomNav />
    </View>
  );
}

/* ───────── styles ───────── */
const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.bg },

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

  content: { flex: 1 },

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

  /* Filters */
  filterRow: {
    width: "100%",
    flexDirection: "row",
    alignItems: "center",
    marginTop: 14,
    gap: 10,
  },
  searchInput: {
    flex: 1,
    backgroundColor: COLORS.white,
    borderRadius: RADII.sm,
    paddingHorizontal: 15,
    paddingVertical: 10,
    fontSize: 15,
    color: COLORS.text,
    borderWidth: 1.5,
    borderColor: COLORS.fieldBorder,
  },
  iconBtn: {
    height: 45,
    width: 45,
    borderRadius: RADII.sm,
    backgroundColor: COLORS.blue,
    borderWidth: 3,
    borderColor: COLORS.white,
    alignItems: "center",
    justifyContent: "center",
    ...SHADOW.card,
  },
  iconBtnText: { fontSize: 18, color: COLORS.white, fontWeight: "bold", marginTop: -2 },
  radiusBtn: {
    minWidth: 54,
    height: 45,
    paddingHorizontal: 14,
    borderRadius: RADII.sm,
    backgroundColor: COLORS.blue,
    borderWidth: 3,
    borderColor: COLORS.white,
    alignItems: "center",
    justifyContent: "center",
    ...SHADOW.card,
  },
  radiusBtnText: { color: COLORS.white, fontWeight: "bold", fontSize: 15, letterSpacing: 1 },

  /* Cards */
  card: {
    width: "100%",
    backgroundColor: COLORS.white,
    borderRadius: RADII.lg,
    padding: 12,
    ...SHADOW.card,
  },
  cardImage: { width: "100%", borderRadius: RADII.md, marginBottom: 10, height: 160 },
  badge: {
    alignSelf: "flex-start",
    backgroundColor: COLORS.blueTint,
    borderRadius: RADII.sm,
    paddingHorizontal: 10,
    paddingVertical: 4,
    marginBottom: 7,
  },
  badgeText: { color: COLORS.text, fontWeight: "bold", fontSize: 13 },

  // Tekster
  cardTitle: { fontWeight: "bold", fontSize: 16, marginBottom: 2, textDecorationLine: "underline" },
  cardTeaser: { fontSize: 14, color: "#444", marginBottom: 2 },
  cardPlace: { fontSize: 14, color: "#222" },

  emptyText: { color: COLORS.grayText, marginTop: 22, alignSelf: "center" },
});

const dialogStyles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: "rgba(20,30,40,0.60)", justifyContent: "center", alignItems: "center" },
  dialog: { backgroundColor: COLORS.white, borderRadius: RADII.xl, padding: 22, width: 260, alignItems: "center" },
  title: { fontSize: 18, fontWeight: "bold", color: COLORS.text, marginBottom: 15 },
  option: {
    paddingVertical: 10,
    paddingHorizontal: 15,
    borderRadius: RADII.sm,
    marginBottom: 7,
    backgroundColor: "#f4f7fa",
    width: 210,
    alignItems: "center",
  },
  selectedOption: { backgroundColor: COLORS.blueTint, borderColor: COLORS.blue, borderWidth: 3 },
  closeBtn: { marginTop: 10, padding: 8 },
  closeBtnText: { color: COLORS.text, fontWeight: "bold" },
});