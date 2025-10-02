// app/forening/[id]/threads.tsx
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from "react-native";
import { useSession } from "../../../hooks/useSession";
import { supabase } from "../../../utils/supabase";

/** DB rows */
type ThreadRow = {
  id: string;
  forening_id: string;
  title: string;
  created_at: string;
  created_by: string;
};

type MsgRow = { id: string; user_id: string; text: string; created_at: string };

type UiMsg = {
  id: string;
  text: string;
  created_at: string;
  user: { id: string; name: string | null; email: string | null; avatar_url: string | null };
};

type MedlemsRow = {
  user_id: string;
  rolle?: string | null;
  status?: "pending" | "approved" | "declined" | null;
  users?: { name?: string | null; username?: string | null; avatar_url?: string | null; email?: string | null } | null;
};

/** Helpers */
const isAdmin = (m: MedlemsRow, ownerId?: string | null) => {
  const r = (m.rolle || "").toLowerCase();
  return r === "admin" || r === "administrator" || (!!ownerId && m.user_id === ownerId);
};

const resolveAvatarUrl = (maybePath?: string | null): string | null => {
  if (!maybePath) return null;
  if (/^https?:\/\//i.test(maybePath)) return maybePath;
  const path = maybePath.replace(/^\/+/, "");
  const { data } = supabase.storage.from("avatars").getPublicUrl(path);
  return data?.publicUrl || null;
};

const getDisplayNameFromMember = (m?: MedlemsRow["users"] | null) => {
  const n = m?.name?.trim() || (m as any)?.username?.trim();
  if (n) return n;
  const email = m?.email || "";
  return email.includes("@") ? email.split("@")[0] : "Ukendt";
};

export default function ThreadsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { session } = useSession();
  const userId = session?.user?.id ?? null;

  const [loading, setLoading] = useState(true);
  const [ownerId, setOwnerId] = useState<string | null>(null);

  const [members, setMembers] = useState<MedlemsRow[]>([]);
  const [threads, setThreads] = useState<ThreadRow[]>([]);
  const [creatingThread, setCreatingThread] = useState(false);
  const [newThreadTitle, setNewThreadTitle] = useState("");

  // Navneopslag
  const nameFromMembers = useMemo(() => {
    const map: Record<string, string> = {};
    members.forEach((m) => (map[m.user_id] = getDisplayNameFromMember(m.users)));
    return map;
  }, [members]);
  const [extraNames, setExtraNames] = useState<Record<string, string>>({});

  const getNameFromId = (uid: string) => nameFromMembers[uid] || extraNames[uid] || "Ukendt";

  const myRow = useMemo(
    () => members.find((m) => m.user_id === userId) || null,
    [members, userId]
  );
  const amAdmin = !!myRow && isAdmin(myRow, ownerId);

  /** Init: ejer + medlemmer */
  useEffect(() => {
    (async () => {
      setLoading(true);
      const { data: f } = await supabase.from("foreninger").select("oprettet_af").eq("id", id).single();
      if (f) setOwnerId(f.oprettet_af ?? null);

      const { data: mem } = await supabase
        .from("foreningsmedlemmer")
        .select(
          "user_id, rolle, status, users:users!foreningsmedlemmer_user_id_fkey (name, username, avatar_url, email)"
        )
        .eq("forening_id", id);

      if (mem) {
        setMembers(
          (mem as MedlemsRow[]).map((m) => ({
            ...m,
            users: { ...m.users, avatar_url: resolveAvatarUrl(m.users?.avatar_url ?? null) },
          }))
        );
      }
      setLoading(false);
    })();
  }, [id]);

  /** Hent tråde */
  const fetchThreads = async () => {
    const { data, error } = await supabase
      .from("forening_threads")
      .select("id, forening_id, title, created_at, created_by")
      .eq("forening_id", id)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Kunne ikke hente tråde:", error.message);
      setThreads([]);
      return;
    }
    const rows = (data || []) as ThreadRow[];
    setThreads(rows);

    // Hent navne for oprettere der ikke er i medlemslisten (fx ex-medlemmer)
    const missing = [...new Set(rows.map((t) => t.created_by))].filter((uid) => !nameFromMembers[uid]);
    if (missing.length) {
      const { data: usersData } = await supabase
        .from("users")
        .select("id, name, username, email")
        .in("id", missing);
      if (usersData) {
        const add: Record<string, string> = {};
        usersData.forEach((u) => {
          const n = u.name?.trim() || (u as any).username?.trim() || (u.email?.includes("@") ? u.email.split("@")[0] : "Ukendt");
          add[u.id] = n || "Ukendt";
        });
        setExtraNames((prev) => ({ ...prev, ...add }));
      }
    }
  };

  useEffect(() => {
    fetchThreads();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, nameFromMembers]);

  /** Opret tråd */
  const createThread = async () => {
    if (!userId || !id || !newThreadTitle.trim()) return;
    try {
      setCreatingThread(true);
      const { data, error } = await supabase
        .from("forening_threads")
        .insert([{ forening_id: String(id), title: newThreadTitle.trim(), created_by: userId }])
        .select()
        .single();
      if (error) {
        Alert.alert("Fejl", "Kunne ikke oprette tråd: " + error.message);
        return;
      }
      setNewThreadTitle("");
      setThreads((prev) => [data as ThreadRow, ...prev]);
    } finally {
      setCreatingThread(false);
    }
  };

  /** Tråddialog state */
  const [showThread, setShowThread] = useState(false);
  const [activeThread, setActiveThread] = useState<ThreadRow | null>(null);
  const [msgs, setMsgs] = useState<UiMsg[]>([]);
  const [newMsg, setNewMsg] = useState("");
  const inputRef = useRef<TextInput>(null);

  /** Hent beskeder til aktiv tråd */
  async function fetchThreadMessages(threadId: string) {
    const { data, error } = await supabase
      .from("forening_messages")
      .select("id, user_id, text, created_at")
      .eq("thread_id", threadId)
      .order("created_at", { ascending: true });

    if (error) {
      console.error("Kunne ikke hente beskeder:", error.message);
      setMsgs([]);
      return;
    }
    const rows = (data || []) as MsgRow[];

    const userIds = [...new Set(rows.map((r) => r.user_id).filter(Boolean))];
    let usersById: Record<string, { id: string; name: string | null; username: string | null; email: string | null; avatar_url: string | null }> = {};
    if (userIds.length > 0) {
      const { data: usersData } = await supabase.from("users").select("id, name, username, email, avatar_url").in("id", userIds);
      if (usersData) {
        usersById = Object.fromEntries(
          usersData.map((u) => [
            u.id,
            {
              id: u.id,
              name: u.name ?? null,
              username: (u as any).username ?? null,
              email: u.email ?? null,
              avatar_url: resolveAvatarUrl((u as any).avatar_url ?? null),
            },
          ])
        );
      }
    }

    const mapped: UiMsg[] = rows.map((m) => {
      const u = usersById[m.user_id];
      const displayName = u?.name || u?.username || (u?.email ? u.email.split("@")[0] : "Ukendt");
      return {
        id: m.id,
        text: m.text,
        created_at: m.created_at,
        user: { id: m.user_id, name: displayName ?? null, email: u?.email || null, avatar_url: u?.avatar_url || null },
      };
    });
    setMsgs(mapped);
  }

  /** Åbn tråd */
  const openThread = async (t: ThreadRow) => {
    setActiveThread(t);
    await fetchThreadMessages(t.id);
    setShowThread(true);
    setTimeout(() => inputRef.current?.focus(), 200);
  };

  /** Send besked */
  const sendMessage = async () => {
    if (!activeThread || !userId || !newMsg.trim()) return;
    const text = newMsg.trim();
    setNewMsg("");

    const { data, error } = await supabase
      .from("forening_messages")
      .insert([{ thread_id: activeThread.id, user_id: userId, text }])
      .select()
      .single();

    if (error) {
      Alert.alert("Fejl", "Kunne ikke sende besked: " + error.message);
      return;
    }

    setMsgs((prev) => [
      ...prev,
      {
        id: (data as any).id,
        text,
        created_at: (data as any).created_at,
        user: { id: userId, name: "Mig", email: session?.user?.email ?? null, avatar_url: null },
      },
    ]);
  };

  /** Slet tråd (CASCADE håndterer beskeder) */
  const [deletingThreadId, setDeletingThreadId] = useState<string | null>(null);
  const canDeleteThread = (t: ThreadRow) => amAdmin || t.created_by === userId;

  const deleteThread = (t: ThreadRow) => {
    if (!canDeleteThread(t)) return;
    Alert.alert("Slet tråd", `Vil du slette tråden "${t.title}"?`, [
      { text: "Annuller", style: "cancel" },
      {
        text: "Slet",
        style: "destructive",
        onPress: async () => {
          try {
            setDeletingThreadId(t.id);

            // Slet KUN tråden. Beskeder ryger via FK ON DELETE CASCADE.
            const { error } = await supabase
              .from("forening_threads")
              .delete()
              .eq("id", t.id);

            if (error) {
              Alert.alert("Fejl", "Kunne ikke slette tråden: " + error.message);
              return;
            }

            setThreads((prev) => prev.filter((x) => x.id !== t.id));
            if (activeThread?.id === t.id) setShowThread(false);
          } catch (e: any) {
            Alert.alert("Fejl", "Kunne ikke slette tråden: " + (e?.message ?? e));
          } finally {
            setDeletingThreadId(null);
          }
        },
      },
    ]);
  };

  /** (Valgfrit) Slet enkeltbeskeder i modal (kræver policies i SQL pkt. 4) */
  const canDeleteMsg = (m: UiMsg) => amAdmin || m.user?.id === userId;
  const deleteMessage = (m: UiMsg) => {
    if (!canDeleteMsg(m)) return;
    Alert.alert("Slet besked", "Vil du slette denne besked?", [
      { text: "Annuller", style: "cancel" },
      {
        text: "Slet",
        style: "destructive",
        onPress: async () => {
          const { error } = await supabase.from("forening_messages").delete().eq("id", m.id);
          if (error) {
            Alert.alert("Fejl", "Kunne ikke slette beskeden: " + error.message);
            return;
          }
          setMsgs((prev) => prev.filter((x) => x.id !== m.id));
        },
      },
    ]);
  };

  /** UI */
  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#131921" />
      </View>
    );
  }

  return (
    <View style={styles.mainContainer}>
      {/* Topbar */}
      <View style={styles.topBar}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backBtnText}>‹</Text>
        </TouchableOpacity>
        <View style={{ width: 34 }} />
      </View>

      {/* Opret tråd */}
      <View style={styles.section}>
        <View style={styles.threadCreateRow}>
          <TextInput
            value={newThreadTitle}
            onChangeText={setNewThreadTitle}
            style={styles.threadInput}
            placeholder="Ny tråd – skriv en overskrift…"
            placeholderTextColor="#9aa0a6"
            onSubmitEditing={createThread}
            returnKeyType="done"
          />
          <TouchableOpacity style={styles.threadCreateBtn} onPress={createThread} disabled={creatingThread}>
            <Text style={styles.threadCreateText}>{creatingThread ? "..." : "Opret"}</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Liste over tråde */}
      <View style={[styles.section, { flex: 1 }]}>
        {threads.length === 0 ? (
          <Text style={styles.sectionMuted}>Ingen tråde endnu.</Text>
        ) : (
          <FlatList
            data={threads}
            keyExtractor={(item) => item.id}
            keyboardShouldPersistTaps="handled"
            renderItem={({ item: t }) => {
              const canDel = canDeleteThread(t);
              const deleting = deletingThreadId === t.id;
              return (
                <View style={styles.threadItemRow}>
                  <TouchableOpacity style={styles.threadItemLeft} onPress={() => openThread(t)}>
                    <Text style={styles.threadTitle}>{t.title}</Text>
                    <Text style={styles.threadMeta}>
                      Oprettet af {getNameFromId(t.created_by)} · {new Date(t.created_at).toLocaleDateString()}
                    </Text>
                  </TouchableOpacity>
                  {canDel && (
                    <TouchableOpacity
                      onPress={() => deleteThread(t)}
                      style={styles.iconDeleteBtn}
                      disabled={deleting}
                    >
                      <Text style={styles.iconDeleteText}>{deleting ? "…" : "✕"}</Text>
                    </TouchableOpacity>
                  )}
                </View>
              );
            }}
          />
        )}
      </View>

      {/* Tråd-dialog */}
      <Modal
        visible={showThread}
        transparent
        animationType="slide"
        onRequestClose={() => setShowThread(false)}
      >
        <KeyboardAvoidingView
          style={styles.modalBackdrop}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <View style={styles.threadModalCard}>
            <View style={styles.threadModalHeader}>
              <Text style={styles.threadModalTitle} numberOfLines={2}>
                {activeThread?.title || "Tråd"}
              </Text>
              <TouchableOpacity onPress={() => setShowThread(false)} style={styles.modalCloseBtn}>
                <Text style={styles.modalCloseText}>✕</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.threadModalBody}>
              {msgs.length === 0 ? (
                <Text style={styles.sectionMuted}>Ingen beskeder i denne tråd endnu.</Text>
              ) : (
                <FlatList
                  data={msgs}
                  keyExtractor={(m) => m.id}
                  keyboardShouldPersistTaps="handled"
                  contentContainerStyle={{ padding: 12 }}
                  renderItem={({ item: m }) => (
                    <TouchableOpacity
                      onLongPress={() => deleteMessage(m)}
                      delayLongPress={350}
                      activeOpacity={0.85}
                      style={styles.msgRow}
                    >
                      <View style={styles.msgBubble}>
                        <Text style={styles.msgAuthor}>{m.user.name || "Ukendt"}</Text>
                        <Text style={styles.msgText}>{m.text}</Text>
                        <Text style={styles.msgTime}>{new Date(m.created_at).toLocaleString()}</Text>
                        {canDeleteMsg(m) && (
                          <Text style={{ fontSize: 10, opacity: 0.6, marginTop: 4 }}>
                            (Hold nede for at slette)
                          </Text>
                        )}
                      </View>
                    </TouchableOpacity>
                  )}
                />
              )}
            </View>

            <View style={styles.msgInputRow}>
              <TextInput
                ref={inputRef}
                value={newMsg}
                onChangeText={setNewMsg}
                style={styles.msgInput}
                placeholder="Skriv en besked…"
                placeholderTextColor="#9aa0a6"
                onSubmitEditing={sendMessage}
                returnKeyType="send"
              />
              <TouchableOpacity style={styles.msgSendBtn} onPress={sendMessage}>
                <Text style={styles.msgSendText}>Send</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

/** Styles (samme som hos dig) */
const styles = StyleSheet.create({
  mainContainer: {
    flex: 1,
    backgroundColor: "#7C8996",
  },
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#7C8996" },

  /* Topbar */
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

  /* Sektioner */
  section: {
    marginTop: 12, marginHorizontal: 14, backgroundColor: "#FFFFFF", borderRadius: 14, padding: 12,
    borderWidth: 1, borderColor: "#eef1f4",
  },
  sectionMuted: { marginTop: 4, color: "#000", fontSize: 12, opacity: 0.7 },

  /* Opret tråd */
  threadCreateRow: { flexDirection: "row", gap: 8 },
  threadInput: {
    flex: 1, borderWidth: 1, borderColor: "#e5e8ec", borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 10, color: "#000", backgroundColor: "#fafafa",
  },
  threadCreateBtn: { backgroundColor: "#131921", borderRadius: 10, paddingHorizontal: 14, justifyContent: "center" },
  threadCreateText: { color: "#fff", fontWeight: "800" },

  /* Liste element */
  threadItemRow: { flexDirection: "row", alignItems: "center", paddingVertical: 10 },
  threadItemLeft: { flex: 1 },
  threadTitle: { fontSize: 12, fontWeight: "800", color: "#131921" },
  threadMeta: { fontSize: 10, color: "#000", opacity: 0.6, marginTop: 2 },
  iconDeleteBtn: {
    backgroundColor: "#000",
    borderRadius: 8,
    width: 32,
    height: 28,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#000",
    marginLeft: 8,
  },
  iconDeleteText: { color: "#fff", fontWeight: "900", fontSize: 14, lineHeight: 14 },

  /* Modal */
  modalBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.90)", alignItems: "center", justifyContent: "center", padding: 18 },
  threadModalCard: {
    width: "100%", maxWidth: 640, height: "86%", backgroundColor: "#fff", borderRadius: 16,
    borderWidth: 1, borderColor: "#e9edf1", overflow: "hidden",
  },
  threadModalHeader: {
    padding: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: "#e9edf1",
    flexDirection: "row", alignItems: "center",
  },
  threadModalTitle: { flex: 1, fontSize: 16, fontWeight: "800", color: "#131921" },
  modalCloseBtn: {
    backgroundColor: "#e9edf1",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  modalCloseText: { color: "#131921", fontWeight: "900", fontSize: 16 },

  threadModalBody: { flex: 1, backgroundColor: "#fff" },

  msgRow: { marginBottom: 10, paddingHorizontal: 6 },
  msgBubble: {
    backgroundColor: "#f4f6f8",
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: "#e9edf1",
  },
  msgAuthor: { fontSize: 11, fontWeight: "800", color: "#131921" },
  msgText: { fontSize: 14, color: "#000", marginTop: 2 },
  msgTime: { fontSize: 10, color: "#000", opacity: 0.6, marginTop: 2 },

  msgInputRow: {
    flexDirection: "row", gap: 8, padding: 12,
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: "#e9edf1", backgroundColor: "#fff",
  },
  msgInput: {
    flex: 1, borderWidth: 1, borderColor: "#e5e8ec", borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: Platform.OS === "ios" ? 12 : 8,
    color: "#000", backgroundColor: "#fafafa",
  },
  msgSendBtn: { backgroundColor: "#131921", borderRadius: 10, paddingHorizontal: 16, justifyContent: "center" },
  msgSendText: { color: "#fff", fontWeight: "800" },
});