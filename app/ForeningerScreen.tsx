// app/ForeningerScreen.tsx
import { Feather } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import React, { useCallback, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Image,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
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
import { useAlleForeninger, useMineForeninger } from "../hooks/useForeninger";
import { useSession } from "../hooks/useSession";
import { supabase } from "../utils/supabase";
import { Forening } from "./types/forening";

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
const GRID_GAP = 18;
const H_PADDING = 14;

/* ─────────────────────────────
   LAYOUT VARIABLER (MOBIL vs. TABLET)
   ───────────────────────────── */
const TABLET_MIN_WIDTH = 768;

// Højde delt mellem søgefelt og “Mine/Alle”-knapper (matcher Nabolag)
const SEARCH_H = 45;

// Mobil
const PHONE = {
  IMG_H: 230,
  CARD_H: undefined as number | undefined,
  CARD_BOTTOM_MARGIN: 18,
};

// Tablet
const TABLET = {
  IMG_H: 220,
  CARD_H: 340,
  CARD_BOTTOM_MARGIN: 22,
};

// Faste linjehøjder
const NAME_LH = 20;  // 1 linje
const PLACE_LH = 18; // 1 linje
const DESC_LH = 18;  // 2 linjer → 36px

export default function ForeningerScreen() {
  const [visning, setVisning] = useState<"mine" | "alle">("mine");
  const [search, setSearch] = useState("");
  const [showCreate, setShowCreate] = useState(false);

  const [refreshKey, setRefreshKey] = useState(0);
  const [refreshing, setRefreshing] = useState(false);

  const router = useRouter();
  const { session } = useSession();
  const userId = session?.user?.id;

  const { data: alleForeninger = [], loading: loadingAlle } = useAlleForeninger(refreshKey);
  const { data: mineForeninger = [], loading: loadingMine } = useMineForeninger(userId, refreshKey);

  const foreninger: Forening[] = visning === "mine" ? mineForeninger : alleForeninger;
  const loading = visning === "mine" ? loadingMine : loadingAlle;

  useFocusEffect(
    useCallback(() => {
      setRefreshKey((k) => k + 1);
      return () => {};
    }, [])
  );

  const onPullToRefresh = useCallback(() => {
    setRefreshing(true);
    setRefreshKey((k) => k + 1);
    requestAnimationFrame(() => setRefreshing(false));
  }, []);

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    if (!s) return foreninger ?? [];
    return (foreninger ?? []).filter((f) => {
      const navn = (f?.navn ?? "").toLowerCase();
      const sted = (f?.sted ?? "").toLowerCase();
      const beskrivelse = (f?.beskrivelse ?? "").toLowerCase();
      return navn.includes(s) || sted.includes(s) || beskrivelse.includes(s);
    });
  }, [foreninger, search]);

  /* layout / grid */
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();

  const isTablet = width >= TABLET_MIN_WIDTH;
  const isPhone = width < 650;

  const NUM_COLS = isPhone ? 1 : width >= 900 ? 3 : 2;
  const isGrid = NUM_COLS > 1;

  const INNER_WIDTH = Math.max(0, width - H_PADDING * 2);

  // Device-afledte værdier
  const IMG_H = isTablet ? TABLET.IMG_H : PHONE.IMG_H;
  const CARD_H = isTablet ? TABLET.CARD_H : PHONE.CARD_H;
  const CARD_BOTTOM_MARGIN = isTablet ? TABLET.CARD_BOTTOM_MARGIN : PHONE.CARD_BOTTOM_MARGIN;

  /* ── sticky header (samme princip som i Nabolag) ── */
  const headerHRef = useRef(0);
  const [headerH, setHeaderH] = useState(0);
  const scrollY = useRef(new Animated.Value(0)).current;

  // Ignorer negativ scroll (pull-to-refresh), så header ikke hopper
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

  // Højde på BottomNav (så intet skjules bag den)
  const BOTTOM_NAV_H = 86;
  const bottomSpacer = BOTTOM_NAV_H + insets.bottom + 14;

  return (
    <View style={styles.root}>
      {/* Sticky/hidden header */}
      <Animated.View
        style={[
          styles.headerWrap,
          { transform: [{ translateY: headerTranslateY }], paddingHorizontal: H_PADDING },
        ]}
        onLayout={(e) => {
          const h = Math.round(e.nativeEvent.layout.height);
          if (headerHRef.current !== h) {
            headerHRef.current = h;
            setHeaderH(h);
          }
        }}
        // vigtigt: lad touches under header passere videre
        pointerEvents="box-none"
      >
        <SafeAreaView edges={["top"]}>
          {/* Søg + Opret */}
          <View style={styles.searchRow}>
            <View style={styles.searchWrap}>
              <TextInput
                style={styles.searchInput}
                value={search}
                onChangeText={setSearch}
                placeholder="Søg i foreninger…"
                placeholderTextColor="#a1a9b6"
                returnKeyType="search"
                onSubmitEditing={Keyboard.dismiss}
                blurOnSubmit
              />
              <Feather name="search" size={21} color="#254890" style={styles.searchIcon} />
            </View>
            <TouchableOpacity
              style={styles.addBtn}
              onPress={() => setShowCreate(true)}
              activeOpacity={0.87}
            >
              <Feather name="plus" size={28} color="#fff" />
            </TouchableOpacity>
          </View>

          {/* Skift Mine/Alle */}
          <View style={styles.switchRow}>
            <TouchableOpacity
              style={[styles.switchBtn, styles.switchBtnSize, visning === "mine" && styles.switchBtnActive]}
              onPress={() => setVisning("mine")}
              activeOpacity={0.9}
            >
              <Text style={[styles.switchText, visning === "mine" && styles.switchTextActive]}>
                MINE FORENINGER
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.switchBtn, styles.switchBtnSize, visning === "alle" && styles.switchBtnActive]}
              onPress={() => setVisning("alle")}
              activeOpacity={0.9}
            >
              <Text style={[styles.switchText, visning === "alle" && styles.switchTextActive]}>
                ALLE FORENINGER
              </Text>
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </Animated.View>

      {/* Liste (hele fladen scroller) */}
      {loading ? (
        <ActivityIndicator size="large" color="#fff" style={{ marginTop: listPaddingTop + 30 }} />
      ) : (
        <Animated.FlatList
          data={filtered}
          key={NUM_COLS}
          keyExtractor={(item: Forening) => item.id}
          style={{ flex: 1 }}
          ListHeaderComponent={<View style={{ height: listPaddingTop }} />}
          contentContainerStyle={{
            paddingTop: 8,
            paddingBottom: bottomSpacer,
            paddingHorizontal: H_PADDING, // <- vigtig: padding i selve listen
          }}
          numColumns={NUM_COLS}
          columnWrapperStyle={isGrid ? { gap: GRID_GAP } : undefined}
          renderItem={({ item, index }) => (
            <TouchableOpacity
              onPress={() => router.push(`/forening/${item.id}`)}
              activeOpacity={0.87}
              style={{
                width: isGrid ? ((INNER_WIDTH - GRID_GAP * (NUM_COLS - 1)) / NUM_COLS) : "100%",
                marginBottom: index === filtered.length - 1 ? 0 : CARD_BOTTOM_MARGIN,
              }}
            >
              <View style={[styles.card, CARD_H ? { height: CARD_H, overflow: "hidden" } : null]}>
                {item.billede_url ? (
                  <Image source={{ uri: item.billede_url }} style={[styles.img, { height: IMG_H }]} />
                ) : (
                  <View style={[styles.imgPlaceholder, { height: IMG_H }]}>
                    <Text style={styles.imgPlaceholderText} numberOfLines={2}>
                      {item.navn}
                    </Text>
                  </View>
                )}

                <Text style={[styles.navn, { lineHeight: NAME_LH }]} numberOfLines={1}>
                  {item.navn}
                </Text>
                <Text style={[styles.sted, { lineHeight: PLACE_LH }]} numberOfLines={1}>
                  {item.sted}
                </Text>
                <Text
                  style={[styles.beskrivelse, { lineHeight: DESC_LH, height: DESC_LH * 2 }]}
                  numberOfLines={2}
                >
                  {item.beskrivelse || " "}
                </Text>
              </View>
            </TouchableOpacity>
          )}
          ListEmptyComponent={
            <Text style={{ color: "#fff", marginTop: 40, textAlign: "center" }}>
              {visning === "mine"
                ? "Du er endnu ikke medlem af nogen foreninger."
                : "Ingen foreninger fundet."}
            </Text>
          }
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onPullToRefresh} tintColor="#fff" />
          }
          onScroll={Animated.event(
            [{ nativeEvent: { contentOffset: { y: scrollY } } }],
            {
              useNativeDriver: true,
              listener: () => Keyboard.dismiss(),
            }
          )}
          onScrollBeginDrag={() => Keyboard.dismiss()}
          keyboardDismissMode="on-drag"
          keyboardShouldPersistTaps="handled"
          scrollEventThrottle={16}
          bounces
          alwaysBounceVertical
          overScrollMode="always"
          scrollIndicatorInsets={{ top: listPaddingTop, bottom: bottomSpacer }}
          contentInsetAdjustmentBehavior="never"
        />
      )}

      {/* Opret modal */}
      {showCreate && (
        <CreateForeningModal
          visible={showCreate}
          onClose={() => setShowCreate(false)}
          userId={userId}
          onCreated={() => setRefreshKey((k) => k + 1)}
        />
      )}

      <BottomNav />
    </View>
  );
}

/* ───────── Opret modal ───────── */
function CreateForeningModal({
  visible,
  onClose,
  userId,
  onCreated,
}: {
  visible: boolean;
  onClose: () => void;
  userId?: string;
  onCreated?: () => void;
}) {
  const [navn, setNavn] = useState("");
  const [sted, setSted] = useState("");
  const [beskrivelse, setBeskrivelse] = useState("");
  const [loading, setLoading] = useState(false); // ← FIX: fjernet '�'
  const router = useRouter();

  const disabled = !userId || !navn.trim() || !sted.trim() || !beskrivelse.trim();

  async function handleOpret() {
    if (disabled) return;
    setLoading(true);

    const { data, error } = await supabase
      .from("foreninger")
      .insert([{ navn: navn.trim(), sted: sted.trim(), beskrivelse: beskrivelse.trim(), oprettet_af: userId }])
      .select("id")
      .single();

    if (error) {
      setLoading(false);
      alert("Noget gik galt ved oprettelse: " + error.message);
      return;
    }

    if (data?.id) {
      const { error: mErr } = await supabase
        .from("foreningsmedlemmer")
        .insert([{ forening_id: data.id, user_id: userId!, rolle: "admin", status: "approved" }]);
      if (mErr) console.warn("Kunne ikke tilføje medlemskab:", mErr.message);
    }

    setLoading(false);
    setNavn(""); setSted(""); setBeskrivelse("");

    onCreated?.();
    onClose();

    if (data?.id) router.push(`/forening/${data.id}`);
  }

  if (!visible) return null;

  return (
    <KeyboardAvoidingView
      style={styles.modalBackdrop}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      keyboardVerticalOffset={80}
    >
      <View style={styles.modalContent}>
        <Text style={styles.modalTitle}>Opret ny forening</Text>

        <Text style={styles.fieldLabel}>Navn</Text>
        <TextInput style={styles.modalInput} placeholder="Navn på foreningen" value={navn} onChangeText={setNavn} />

        <Text style={styles.fieldLabel}>Sted</Text>
        <TextInput style={styles.modalInput} placeholder="F.eks. København" value={sted} onChangeText={setSted} />

        <Text style={styles.fieldLabel}>Beskrivelse</Text>
        <TextInput
          style={styles.modalInput}
          placeholder="Kort beskrivelse"
          value={beskrivelse}
          onChangeText={setBeskrivelse}
          multiline
        />

        <View style={{ flexDirection: "row", gap: 12, marginTop: 15 }}>
          <TouchableOpacity onPress={onClose} style={[styles.modalBtn, { backgroundColor: "#aaa" }]} disabled={loading}>
            <Text style={{ color: "#fff" }}>Annullér</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={handleOpret}
            style={[styles.modalBtn, disabled && { opacity: 0.5 }]}
            disabled={loading || disabled}
          >
            <Text style={{ color: "#fff" }}>{loading ? "Opretter..." : "Opret"}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

/* ───────── styles ───────── */
const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.bg },

  /* Sticky header */
  headerWrap: {
    position: "absolute",
    top: 0, left: 0, right: 0,
    backgroundColor: COLORS.bg,
    paddingTop: 8,
    paddingBottom: 10,
    zIndex: 20,
  },

  /* Top controls */
  searchRow: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 10 },
  searchWrap: { flex: 1, position: "relative" },
  searchInput: {
    height: SEARCH_H, // matcher Nabolag
    backgroundColor: "#fff",
    borderRadius: 8,
    paddingHorizontal: 14,
    fontSize: 15,
    color: "#222",
    borderWidth: 1.5,
    borderColor: "#dde1e8",
  },
  searchIcon: { position: "absolute", right: 12, top: 12 },
  addBtn: {
    height: SEARCH_H,
    width: SEARCH_H,
    borderRadius: 8,
    backgroundColor: COLORS.blue,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 3,
    borderColor: "#fff",
  },

  // Samme lodrette spacing som Nabolags filterRow (14)
  switchRow: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 14 },
  switchBtn: {
    flex: 1,
    backgroundColor: "#fff",
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  switchBtnSize: { height: SEARCH_H },
  switchBtnActive: { backgroundColor: COLORS.blue, borderWidth: 3, borderColor: "#fff" },
  switchText: { color: COLORS.blue, fontWeight: "bold", fontSize: 10, letterSpacing: 0.5 },
  switchTextActive: { color: "#fff", fontWeight: "bold" },

  /* Cards */
  card: {
    width: "100%",
    backgroundColor: "#fff",
    borderRadius: RADII.lg,
    padding: 12,
    ...SHADOW.card,
  },
  img: { width: "100%", borderRadius: RADII.md, marginBottom: 8, resizeMode: "cover" },
  imgPlaceholder: {
    width: "100%",
    borderRadius: RADII.md,
    marginBottom: 8,
    backgroundColor: "#E7EBF0",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 10,
  },
  imgPlaceholderText: { color: "#536071", fontWeight: "800", textAlign: "center" },

  navn: { fontWeight: "bold", fontSize: 16, color: COLORS.text, marginBottom: 2 },
  sted: { color: "#444", fontSize: 15, marginBottom: 4, fontWeight: "600" },
  beskrivelse: { color: "#666", fontSize: 14 },

  /* Modal */
  modalBackdrop: {
    position: "absolute", top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: "rgba(40,50,60,0.43)", alignItems: "center", justifyContent: "center", zIndex: 100,
  },
  modalContent: {
    width: 320, backgroundColor: "#fff", borderRadius: 12, padding: 20,
    shadowColor: "#000", shadowOpacity: 0.18, shadowRadius: 10, elevation: 7,
  },
  modalTitle: { fontWeight: "bold", fontSize: 22, color: "#254890", marginBottom: 13, textAlign: "center" },
  fieldLabel: { fontSize: 15, fontWeight: "bold", color: "#254890", marginBottom: 2, marginTop: 6 },
  modalInput: {
    backgroundColor: "#f3f3f7", borderRadius: 7, padding: 9, fontSize: 17,
    color: "#222", borderWidth: 1, borderColor: "#dde1e8", marginBottom: 8,
  },
  modalBtn: { flex: 1, backgroundColor: "#254890", borderRadius: 7, padding: 13, alignItems: "center" },
});