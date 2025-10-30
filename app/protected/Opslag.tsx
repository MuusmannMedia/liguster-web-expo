// app/protected/Opslag.tsx
import React, { useCallback, useRef, useState } from "react";
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

import BottomNav from "../../components/BottomNav";
import OpretOpslagDialog from "../../components/OpretOpslagDialog";
import OpslagDetaljeModal from "../../components/OpslagDetaljeModal";
import SvarModal from "../../components/SvarModal";
import { Post, useOpslag, KATEGORIER } from "../../hooks/useOpslag";
import { useHydrationGate } from "../../hooks/useHydrationGate";
import { supabase } from "../../utils/supabase";

/* ───────── theme ───────── */
const COLORS = {
  bg: "#869FB9",
  text: "#131921",
  white: "#fff",
  blue: "#131921",
  blueTint: "#25489022",
  grayText: "#666",
  fieldBorder: "#c7ced6",
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

/* ───────── layout ───────── */
const BREAKPOINTS = { LARGE_PHONE_MIN_WIDTH: 430, TABLET_MIN_WIDTH: 768, WIDE_GRID_MIN_WIDTH: 900 };

const SMALL_PHONE = { NUM_COLS: 1, H_PADDING: 14, GRID_GAP: 18, CARD_BOTTOM_MARGIN: 18, IMAGE_HEIGHT: 250 };
const LARGE_PHONE = { NUM_COLS: 1, H_PADDING: 14, GRID_GAP: 18, CARD_BOTTOM_MARGIN: 20, IMAGE_HEIGHT: 330 };
const TABLET = { H_PADDING: 14, GRID_GAP: 18, CARD_BOTTOM_MARGIN: 22, IMAGE_HEIGHT: 220, CARD_HEIGHT: 350 };

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

/* ───────── PostCard (ingen lazy) ───────── */
const PostCard = React.memo(function PostCard({
  item,
  imageHeight,
  onPress,
}: {
  item: Post;
  imageHeight: number;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.87}>
      <View style={styles.card}>
        {!!item.image_url && (
          <Image source={{ uri: item.image_url }} style={[styles.cardImage, { height: imageHeight }]} />
        )}

        {!!item.kategori && (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{item.kategori}</Text>
          </View>
        )}

        <Text style={styles.cardTitle} numberOfLines={1} ellipsizeMode="tail">
          {item.overskrift}
        </Text>
        <Text style={styles.cardTeaser} numberOfLines={1} ellipsizeMode="tail">
          {item.text}
        </Text>
        <Text style={styles.cardPlace} numberOfLines={1} ellipsizeMode="tail">
          {item.omraade}
        </Text>
      </View>
    </TouchableOpacity>
  );
});

/* ───────── screen ───────── */
export default function Opslag() {
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
    requestLocationOnce,
  } = useOpslag();

  const { runAppHydrationOnce } = useHydrationGate();
  const firstHydrationDone = useRef(false);

  // Første data-load efter login – efter UI er tegnet
  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      if (firstHydrationDone.current) return;
      await runAppHydrationOnce(async () => {
        if (!cancelled) {
          await onRefresh();
          firstHydrationDone.current = true;
        }
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [runAppHydrationOnce, onRefresh]);

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

  const NUM_COLS =
    isTablet ? (width >= BREAKPOINTS.WIDE_GRID_MIN_WIDTH ? 3 : 2) : isLargePhone ? LARGE_PHONE.NUM_COLS : SMALL_PHONE.NUM_COLS;

  const GRID_GAP = isTablet ? TABLET.GRID_GAP : isLargePhone ? LARGE_PHONE.GRID_GAP : SMALL_PHONE.GRID_GAP;
  const H_PADDING = isTablet ? TABLET.H_PADDING : isLargePhone ? LARGE_PHONE.H_PADDING : SMALL_PHONE.H_PADDING;

  const INNER_WIDTH = Math.max(0, width - H_PADDING * 2);
  const isGrid = NUM_COLS > 1;
  const itemWidth = isGrid ? (INNER_WIDTH - GRID_GAP * (NUM_COLS - 1)) / NUM_COLS : "100%";

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

  // Lokations-nudge (vises kun når vi mangler lokation)
  const showLocationNudge = !userLocation;

  // Busy-state til lokationsknap
  const [locBusy, setLocBusy] = useState(false);
  const handleAskLocation = useCallback(async () => {
    if (locBusy) return;
    setLocBusy(true);
    try {
      await requestLocationOnce();
    } finally {
      setLocBusy(false);
    }
  }, [locBusy, requestLocationOnce]);

  // Memoized helpers til FlatList
  const keyExtractor = useCallback((item: Post) => item.id, []);
  const renderItem = useCallback(
    ({ item, index }: { item: Post; index: number }) => (
      <View
        style={{
          width: isGrid ? (itemWidth as number) : "100%",
          marginBottom: index === filteredPosts.length - 1 ? 0 : CARD_BOTTOM_MARGIN,
        }}
      >
        <PostCard
          item={item}
          imageHeight={imageHeight}
          onPress={() => {
            setValgtOpslag(item);
            setDetaljeVisible(true);
          }}
        />
      </View>
    ),
    [filteredPosts.length, isGrid, itemWidth, CARD_BOTTOM_MARGIN, imageHeight]
  );

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

          {/* Nudge for lokation */}
          {showLocationNudge && (
            <View style={{ marginTop: 10 }}>
              <TouchableOpacity
                onPress={handleAskLocation}
                disabled={locBusy}
                style={{
                  backgroundColor: "#0f172a",
                  paddingVertical: 12,
                  paddingHorizontal: 18,
                  borderRadius: RADII.full,
                  opacity: locBusy ? 0.7 : 1,
                }}
                activeOpacity={0.9}
                accessibilityRole="button"
                accessibilityLabel="Brug min lokation"
              >
                {locBusy ? (
                  <ActivityIndicator />
                ) : (
                  <Text style={{ color: "#fff", fontWeight: "800", textAlign: "center" }}>
                    Brug min lokation for nærmeste opslag
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          )}
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
            keyExtractor={keyExtractor}
            style={{ width: "100%" }}
            contentContainerStyle={{ paddingTop: 8, paddingBottom: bottomSpacer }}
            ListHeaderComponent={<View style={{ height: listPaddingTop }} />}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            numColumns={NUM_COLS}
            columnWrapperStyle={isGrid ? { gap: GRID_GAP } : undefined}
            renderItem={renderItem}
            ListEmptyComponent={<Text style={[styles.emptyText, { paddingTop: listPaddingTop }]}>Ingen opslag fundet.</Text>}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[COLORS.blue]} />}
            onScroll={Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], {
              useNativeDriver: true,
              listener: () => Keyboard.dismiss(),
            })}
            scrollEventThrottle={16}
            bounces
            alwaysBounceVertical
            overScrollMode="always"
            scrollIndicatorInsets={{ top: listPaddingTop, bottom: bottomSpacer }}
            contentInsetAdjustmentBehavior="never"
            // (bevar rimelig aggressiv render for performance)
            windowSize={8}
            initialNumToRender={10}
            maxToRenderPerBatch={10}
            updateCellsBatchingPeriod={40}
            removeClippedSubviews={false}
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

      <OpretOpslagDialog
        visible={opretVisible}
        onClose={() => setOpretVisible(false)}
        onSubmit={handleOpretOpslag}
        currentUserId={userId}
      />

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
    borderBottomLeftRadius: 40,
    borderBottomRightRadius: 40,
    backgroundColor: COLORS.bg,
    paddingTop: 8,
    paddingBottom: 20,
    zIndex: 20,
  },

  content: { flex: 1 },

  /* CTA */
  primaryCta: {
    width: "100%",
    backgroundColor: COLORS.blue,
    borderRadius: RADII.full, // pill
    paddingVertical: 14,
    paddingHorizontal: 20,
    marginTop: 10,
    alignItems: "center",
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
    borderRadius: RADII.full, // pill
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 15,
    color: COLORS.text,
    borderColor: COLORS.fieldBorder,
  },
  iconBtn: {
    height: 45,
    width: 45,
    borderRadius: RADII.full, // circle
    backgroundColor: COLORS.blue,
    alignItems: "center",
    justifyContent: "center",
    ...SHADOW.card,
  },
  iconBtnText: { fontSize: 18, color: COLORS.white, fontWeight: "bold", marginTop: -2 },
  radiusBtn: {
    minWidth: 60,
    height: 45,
    paddingHorizontal: 16,
    borderRadius: RADII.full, // pill
    backgroundColor: COLORS.blue,
    alignItems: "center",
    justifyContent: "center",
    ...SHADOW.card,
  },
  radiusBtnText: { color: COLORS.white, fontWeight: "bold", fontSize: 15, letterSpacing: 1 },

  /* Cards (runde hjørner) */
  card: {
    width: "100%",
    backgroundColor: COLORS.white,
    borderRadius: RADII.xl, // store, bløde hjørner
    padding: 14,
    ...SHADOW.card,
  },
  cardImage: {
    width: "100%",
    borderRadius: RADII.lg, // runde kanter på billedet
    marginBottom: 10,
    height: 160,
  },
  badge: {
    alignSelf: "flex-start",
    backgroundColor: COLORS.blueTint,
    borderRadius: RADII.full, // pill
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginBottom: 8,
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
  dialog: { backgroundColor: COLORS.white, borderRadius: RADII.xl, padding: 22, width: 280, alignItems: "center" },
  title: { fontSize: 18, fontWeight: "bold", color: COLORS.text, marginBottom: 15 },
  option: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: RADII.full, // pill
    marginBottom: 8,
    backgroundColor: "#f4f7fa",
    width: 220,
    alignItems: "center",
  },
  selectedOption: { backgroundColor: COLORS.blueTint, borderColor: COLORS.blue, borderWidth: 3 },
  closeBtn: {
    marginTop: 10,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: RADII.full, // pill
    backgroundColor: "#eef2f6",
  },
  closeBtnText: { color: COLORS.text, fontWeight: "bold" },
});