// app/Beskeder.tsx
import { useFocusEffect, useRouter } from "expo-router";
import React, { useCallback, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Platform,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import BottomNav from "../components/BottomNav";
import useBeskeder from "../hooks/useBeskeder";

type ThreadItem = {
  thread_id: string;
  post_id?: string | null;
  sender_id: string;
  receiver_id: string;
  text?: string | null;
  posts?: { overskrift?: string | null; omraade?: string | null } | null;
};

const BG = "#7C8996";

/* Typografi */
const TITLE_FS = 20;
const TITLE_LH = 22;
const PLACE_FS = 15;
const PLACE_LH = 17;
const SNIPPET_FS = 15;
const SNIPPET_LH = 17;

/* Knapper */
const BTN_H = 36;

/* Afstande – nemme at tweake */
const PADDING_V = 16;
const SPACE_TITLE = 2;
const SPACE_PLACE = 2;
const SPACE_SNIPPET = 6;
const EXTRA_BOTTOM_SPACE = 20; // luft under brødtekst
const CARD_H_OVERRIDE = 0; // sæt fx til 200 eller 220 for at tvinge højden

export default function BeskederScreen() {
  const { userId, threads = [], loading, deleteThread, refresh } = useBeskeder();
  const router = useRouter();
  const { width, height } = useWindowDimensions();

  const isPhone = Math.min(width, height) < 650;
  const NUM_COLS = isPhone ? 1 : width >= 1024 ? 3 : 2;

  const OUTER = 16;
  const GAP = 12;
  const innerWidth = Math.max(0, width - OUTER * 2);
  const cardWidth =
    NUM_COLS === 1 ? Math.min(420, innerWidth) : (innerWidth - GAP * (NUM_COLS - 1)) / NUM_COLS;

  // Standard-højde (kan overrides)
  const CALC_H =
    PADDING_V * 2 +
    TITLE_LH +
    SPACE_TITLE +
    PLACE_LH +
    SPACE_PLACE +
    SNIPPET_LH +
    SPACE_SNIPPET +
    EXTRA_BOTTOM_SPACE +
    BTN_H;

  const CARD_H = CARD_H_OVERRIDE > 0 ? CARD_H_OVERRIDE : CALC_H;

  // Pull-to-refresh
  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await refresh();
    } catch (e) {
      // valgfrit: log/ignore
    } finally {
      // lille delay så UI ikke “blinker” ved meget hurtige svar
      setTimeout(() => setRefreshing(false), 250);
    }
  }, [refresh]);

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh])
  );

  const goToChat = (item: ThreadItem) => {
    const otherUser = item.sender_id === userId ? item.receiver_id : item.sender_id;
    router.push({
      pathname: "/ChatScreen",
      params: {
        threadId: item.thread_id,
        postId: item.post_id ?? "",
        otherUserId: otherUser ?? "",
      },
    });
  };

  const renderItem = ({ item, index }: { item: ThreadItem; index: number }) => (
    <View
      style={[
        styles.card,
        {
          width: cardWidth,
          marginBottom: index === threads.length - 1 ? 0 : 18,
          height: CARD_H,
          paddingVertical: PADDING_V,
        },
      ]}
    >
      <TouchableOpacity
        style={{ flex: 1, width: "100%" }}
        activeOpacity={0.85}
        onPress={() => goToChat(item)}
      >
        <Text
          style={[
            styles.title,
            {
              fontSize: TITLE_FS,
              lineHeight: TITLE_LH,
              marginBottom: SPACE_TITLE,
              ...Platform.select({ android: { includeFontPadding: false as const } }),
            },
          ]}
          numberOfLines={1}
        >
          {item.posts?.overskrift || "UKENDT OPSLAG"}
        </Text>

        <Text
          style={[
            styles.place,
            {
              fontSize: PLACE_FS,
              lineHeight: PLACE_LH,
              marginBottom: SPACE_PLACE,
              ...Platform.select({ android: { includeFontPadding: false as const } }),
            },
          ]}
          numberOfLines={1}
        >
          {item.posts?.omraade || " "}
        </Text>

        <Text
          style={[
            styles.snippet,
            {
              fontSize: SNIPPET_FS,
              lineHeight: SNIPPET_LH,
              marginBottom: SPACE_SNIPPET + EXTRA_BOTTOM_SPACE,
              ...Platform.select({ android: { includeFontPadding: false as const } }),
            },
          ]}
          numberOfLines={1}
          ellipsizeMode="tail"
        >
          {item.text || " "}
        </Text>
      </TouchableOpacity>

      <View style={[styles.actionsRow, { height: BTN_H }]}>
        <TouchableOpacity style={[styles.readBtn, { height: BTN_H }]} onPress={() => goToChat(item)}>
          <Text style={styles.readBtnText}>LÆS BESKED</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.deleteBtn, { height: BTN_H }]}
          onPress={() => deleteThread(item.thread_id)}
        >
          <Text style={styles.deleteBtnText}>SLET</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  return (
    <SafeAreaView style={styles.safe} edges={["left", "right", "bottom", "top"]}>
      {loading ? (
        <ActivityIndicator size="large" color="#254890" style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={threads as ThreadItem[]}
          key={`cols-${NUM_COLS}`}
          keyExtractor={(it, i) => it?.thread_id ?? String(i)}
          numColumns={NUM_COLS}
          style={styles.list}
          ListHeaderComponent={<View style={{ height: 16 }} />}
          ListFooterComponent={<View style={{ height: 90 }} />}
          contentContainerStyle={{
            paddingHorizontal: OUTER,
            ...(NUM_COLS === 1 ? { alignItems: "center" } : null),
            backgroundColor: BG,
          }}
          columnWrapperStyle={NUM_COLS > 1 ? { gap: GAP } : undefined}
          renderItem={renderItem}
          ListEmptyComponent={<Text style={styles.empty}>Du har ingen beskeder endnu.</Text>}
          // Pull-to-refresh
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={["#131921"]} />
          }
          // Lidt bedre følelse ved pull
          bounces
          alwaysBounceVertical
          overScrollMode="always"
        />
      )}
      <BottomNav />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: BG },
  list: { flex: 1, width: "100%", backgroundColor: "transparent" },

  card: {
    backgroundColor: "#fff",
    borderRadius: 18,
    paddingHorizontal: 18,
    shadowColor: "#000",
    shadowOpacity: 0.08,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
    alignItems: "flex-start",
  },

  title: { fontWeight: "700", color: "#131921" },
  place: { color: "#222", fontWeight: "600" },
  snippet: { color: "#111" },

  actionsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    width: "100%",
    gap: 16,
  },
  readBtn: {
    backgroundColor: "#131921",
    borderRadius: 10,
    paddingHorizontal: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  readBtnText: { color: "#fff", fontWeight: "bold", fontSize: 13 },
  deleteBtn: {
    backgroundColor: "#e34141",
    borderRadius: 10,
    paddingHorizontal: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  deleteBtnText: { color: "#fff", fontWeight: "bold", fontSize: 13 },

  empty: { color: "#fff", marginTop: 22, alignSelf: "center" },
});