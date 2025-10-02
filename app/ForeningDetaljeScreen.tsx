// app/ForeningDetaljeScreen.tsx

import { decode } from "base64-arraybuffer";
import * as ImagePicker from "expo-image-picker";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Image,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

// ✅ Korrekte stier ift. din struktur (hooks/, types/, utils/ er søster-mapper til app/)
import { useSession } from "../hooks/useSession";
import { Forening } from "../types/forening";
import { supabase } from "../utils/supabase";

type MedlemsRow = {
  user_id: string;
  rolle?: string | null;
  status?: "pending" | "approved" | "declined" | null;
  users?: {
    name?: string | null;
    username?: string | null;
    avatar_url?: string | null; // sti eller fuld URL
    email?: string | null;
  } | null;
};

// --------- Helpers ----------
const getDisplayName = (m: MedlemsRow) => {
  const n = m.users?.name?.trim() || m.users?.username?.trim();
  if (n) return n;
  const email = m.users?.email || "";
  return email.includes("@") ? email.split("@")[0] : "Ukendt";
};

const isAdmin = (m: MedlemsRow, ownerId?: string | null) => {
  const r = (m.rolle || "").toLowerCase();
  return r === "admin" || r === "administrator" || (!!ownerId && m.user_id === ownerId);
};

/** Konverterer en evt. sti til public URL i bucket 'avatars' */
const resolveAvatarUrl = (maybePath?: string | null): string | null => {
  if (!maybePath) return null;
  if (/^https?:\/\//i.test(maybePath)) return maybePath;
  const path = maybePath.replace(/^\/+/, "");
  const { data } = supabase.storage.from("avatars").getPublicUrl(path);
  return data?.publicUrl || null;
};

// Badge-komponent til status
const StatusBadge = ({ status }: { status?: string | null }) => {
  if (!status) return null;
  let color = "#cbd5e1";
  if (status === "approved") color = "#16a34a";
  if (status === "pending") color = "#f59e0b";
  if (status === "declined") color = "#ef4444";
  return (
    <View style={[styles.statusBadge, { backgroundColor: color }]}>
      <Text style={styles.statusBadgeText}>{status.toUpperCase()}</Text>
    </View>
  );
};

export default function ForeningDetaljeScreen() {
  const { id } = useLocalSearchParams();
  const router = useRouter();
  const { session } = useSession();
  const userId = session?.user?.id ?? null;

  const [forening, setForening] = useState<Forening | null>(null);
  const [loading, setLoading] = useState(true);

  const [medlemmer, setMedlemmer] = useState<MedlemsRow[]>([]);
  const [antalGodkendte, setAntalGodkendte] = useState(0);

  const [showMembers, setShowMembers] = useState(false);
  const [selectedMember, setSelectedMember] = useState<MedlemsRow | null>(null);

  const [uploading, setUploading] = useState(false);

  // Hent forening
  useEffect(() => {
    if (!id) return;
    (async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from("foreninger")
        .select("*")
        .eq("id", id)
        .single();
      if (error) console.error("Kunne ikke hente forening:", error);
      setForening(data ?? null);
      setLoading(false);
    })();
  }, [id]);

  // Hent medlemmer
  const fetchMedlemmer = async () => {
    if (!id) return;
    const { data, error } = await supabase
      .from("foreningsmedlemmer")
      .select(
        "user_id, rolle, status, users:users!foreningsmedlemmer_user_id_fkey (name, username, avatar_url, email)"
      )
      .eq("forening_id", id);

    if (error) {
      console.error("Kunne ikke hente medlemmer:", error?.message || error);
      setMedlemmer([]);
      setAntalGodkendte(0);
      return;
    }

    const mapped = (data as MedlemsRow[]).map((m) => ({
      ...m,
      users: { ...m.users, avatar_url: resolveAvatarUrl(m.users?.avatar_url ?? null) },
    }));

    setMedlemmer(mapped);
    setAntalGodkendte(mapped.filter((m) => m.status === "approved").length);
  };

  useEffect(() => {
    fetchMedlemmer();
  }, [id]);

  // Er jeg admin/ejer?
  const isUserAdmin = useMemo(() => {
    const me = medlemmer.find((m) => m.user_id === userId);
    return !!me && isAdmin(me, forening?.oprettet_af);
  }, [medlemmer, userId, forening?.oprettet_af]);

  // Upload header
  const handleUploadHeader = async () => {
    if (!forening || forening.oprettet_af !== userId) return;
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.8,
      base64: true,
    });
    if (res.canceled) return;

    setUploading(true);
    const file = res.assets?.[0];
    if (!file?.base64) {
      setUploading(false);
      alert("Kunne ikke hente billedet.");
      return;
    }

    const ext = (file.uri.split(".").pop() || "jpg").toLowerCase();
    const path = `${id}_${Date.now()}.${ext}`;

    const { error: uploadError } = await supabase.storage
      .from("foreningsbilleder")
      .upload(path, decode(file.base64), {
        contentType: file.type || "image/jpeg",
        upsert: true,
      });
    if (uploadError) {
      setUploading(false);
      alert("Fejl ved upload: " + uploadError.message);
      return;
    }

    const { data } = supabase.storage.from("foreningsbilleder").getPublicUrl(path);
    const publicUrl = data.publicUrl;

    const { error: updateErr } = await supabase
      .from("foreninger")
      .update({ billede_url: publicUrl })
      .eq("id", id);
    if (updateErr) {
      setUploading(false);
      alert("Kunne ikke gemme billedets URL: " + updateErr.message);
      return;
    }

    setForening((prev) => (prev ? { ...prev, billede_url: publicUrl } : prev));
    setUploading(false);
  };

  // Bliv medlem → pending
  const handleBlivMedlem = async () => {
    if (!userId || !id) return;
    const { error } = await supabase.from("foreningsmedlemmer").insert([
      { forening_id: id as string, user_id: userId, rolle: "medlem", status: "pending" },
    ]);
    if (error) {
      alert("Kunne ikke sende anmodning: " + error.message);
      return;
    }
    alert("Din anmodning er sendt og afventer godkendelse.");
    fetchMedlemmer();
  };

  // Forlad
  const handleForlad = async () => {
    if (!userId || !id) return;
    const { error } = await supabase
      .from("foreningsmedlemmer")
      .delete()
      .eq("forening_id", id)
      .eq("user_id", userId);
    if (error) {
      alert("Kunne ikke forlade foreningen: " + error.message);
      return;
    }
    fetchMedlemmer();
  };

  // Admin actions
  const handleGodkend = async (uid: string) => {
    const { error } = await supabase
      .from("foreningsmedlemmer")
      .update({ status: "approved" })
      .eq("forening_id", id)
      .eq("user_id", uid);
    if (error) alert("Fejl: " + error.message);
    fetchMedlemmer();
  };

  const handleAfvis = async (uid: string) => {
    const { error } = await supabase
      .from("foreningsmedlemmer")
      .update({ status: "declined" })
      .eq("forening_id", id)
      .eq("user_id", uid);
    if (error) alert("Fejl: " + error.message);
    fetchMedlemmer();
  };

  if (loading || !forening) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#254890" />
      </View>
    );
  }

  // Del mængder: admin ser alle; andre ser kun approved
  const approved = medlemmer.filter((m) => m.status === "approved");
  const pending = medlemmer.filter((m) => m.status === "pending");
  const declined = medlemmer.filter((m) => m.status === "declined");

  const adminsApproved = approved.filter((m) => isAdmin(m, forening.oprettet_af));
  const membersApproved = approved.filter((m) => !isAdmin(m, forening.oprettet_af));

  // Skal top-badge vise pending?
  const pendingCount = isUserAdmin ? pending.length : 0;

  // Er aktuelt logget-in bruger approved medlem?
  const iApproved = approved.some((m) => m.user_id === userId);

  return (
    <>
      <ScrollView style={{ flex: 1, backgroundColor: "#7C8996" }}>
        {/* Topbar */}
        <View style={styles.topBar}>
          <TouchableOpacity
            onPress={() => router.back()}
            style={styles.backBtn}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Text style={styles.backBtnText}>‹</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.counter}
            onPress={() => {
              setSelectedMember(null);
              setShowMembers(true);
            }}
          >
            <Text style={styles.counterIcon}>👥</Text>
            <Text style={styles.counterNum}>{antalGodkendte}</Text>
            {pendingCount > 0 && (
              <View style={styles.topBadge}>
                <Text style={styles.topBadgeText}>{pendingCount}</Text>
              </View>
            )}
          </TouchableOpacity>
        </View>

        {/* Kort */}
        <View style={styles.card}>
          {forening.billede_url ? (
            <Image source={{ uri: forening.billede_url }} style={styles.hero} />
          ) : (
            <View style={[styles.hero, styles.heroPlaceholder]}>
              <Text style={{ color: "#6b7785", fontSize: 12 }}>Intet billede</Text>
            </View>
          )}

        <Text style={styles.title}>{forening.navn}</Text>
        <Text style={styles.place}>{forening.sted}</Text>
        {!!forening.beskrivelse && <Text style={styles.desc}>{forening.beskrivelse}</Text>}

        {iApproved ? (
          <TouchableOpacity style={[styles.bigBtn, styles.leave]} onPress={handleForlad}>
            <Text style={styles.bigBtnText}>Afslut medlemskab</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity style={[styles.bigBtn, styles.join]} onPress={handleBlivMedlem}>
            <Text style={styles.bigBtnText}>Bliv medlem</Text>
          </TouchableOpacity>
        )}

        {forening.oprettet_af === userId && (
          <TouchableOpacity
            style={styles.uploadBtn}
            onPress={handleUploadHeader}
            disabled={uploading}
          >
            <Text style={styles.uploadBtnText}>
              {uploading ? "Uploader..." : "Upload header"}
            </Text>
          </TouchableOpacity>
        )}
        </View>

        {/* Medlemmer (horisontal preview: kun approved) */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Medlemmer</Text>
          <FlatList
            data={approved}
            keyExtractor={(item) => item.user_id}
            horizontal
            renderItem={({ item }) => (
              <TouchableOpacity
                onPress={() => {
                  setSelectedMember(item);
                  setShowMembers(true);
                }}
                style={styles.memberBox}
              >
                {item.users?.avatar_url ? (
                  <Image source={{ uri: item.users.avatar_url }} style={styles.memberAvatar} />
                ) : (
                  <View style={styles.memberAvatarPlaceholder}>
                    <Text style={{ color: "#254890", fontSize: 12 }}>?</Text>
                  </View>
                )}
                <Text style={styles.memberName}>{getDisplayName(item)}</Text>
              </TouchableOpacity>
            )}
            ListEmptyComponent={
              <Text style={{ color: "#e9edf2", margin: 8, fontSize: 12 }}>
                Ingen medlemmer endnu.
              </Text>
            }
            contentContainerStyle={{ paddingVertical: 6, paddingLeft: 12 }}
            showsHorizontalScrollIndicator={false}
          />
        </View>
      </ScrollView>

      {/* Medlems-dialog */}
      <Modal
        visible={showMembers}
        transparent
        animationType="fade"
        onRequestClose={() => setShowMembers(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            {/* Header */}
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {selectedMember ? "Medlemsprofil" : "Medlemmer"}
              </Text>
              <TouchableOpacity onPress={() => setShowMembers(false)}>
                <Text style={styles.modalClose}>✕</Text>
              </TouchableOpacity>
            </View>

            {/* Indhold */}
            {selectedMember ? (
              // Profilvisning
              <View style={styles.profileWrap}>
                <Image
                  source={
                    selectedMember.users?.avatar_url
                      ? { uri: selectedMember.users.avatar_url }
                      : { uri: "https://placehold.co/200x200?text=Profil" }
                  }
                  style={styles.profileAvatar}
                />
                <Text style={styles.profileName}>{getDisplayName(selectedMember)}</Text>
                <Text style={styles.profileEmail}>
                  {selectedMember.users?.email || "Ingen email"}
                </Text>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 8 }}>
                  <Text style={styles.roleText}>
                    {isAdmin(selectedMember, forening.oprettet_af) ? "ADMIN" : "MEDLEM"}
                  </Text>
                  <StatusBadge status={selectedMember.status} />
                </View>

                <TouchableOpacity
                  onPress={() => setSelectedMember(null)}
                  style={styles.profileBackBtn}
                >
                  <Text style={styles.profileBackText}>⇠ Tilbage til liste</Text>
                </TouchableOpacity>
              </View>
            ) : (
              // Lister
              <ScrollView style={{ maxHeight: 460 }}>
                {/* Pending (kun admin/ejer) */}
                {isUserAdmin && (
                  <>
                    <Text style={styles.listHeader}>
                      Afventer godkendelse {pending.length > 0 ? `(${pending.length})` : ""}
                    </Text>
                    {pending.length === 0 ? (
                      <Text style={styles.emptyLine}>Ingen anmodninger lige nu.</Text>
                    ) : (
                      pending.map((m) => (
                        <View key={`p-${m.user_id}`} style={styles.row}>
                          {m.users?.avatar_url ? (
                            <Image source={{ uri: m.users.avatar_url }} style={styles.rowAvatar} />
                          ) : (
                            <View style={[styles.rowAvatar, styles.rowAvatarPh]}>
                              <Text>?</Text>
                            </View>
                          )}
                          <View style={{ flex: 1 }}>
                            <View style={{ flexDirection: "row", alignItems: "center" }}>
                              <Text style={styles.rowName}>{getDisplayName(m)}</Text>
                              <Text style={styles.rowTag}>
                                {isAdmin(m, forening.oprettet_af) ? "ADMIN" : "MEDLEM"}
                              </Text>
                              <StatusBadge status={m.status} />
                            </View>
                            <Text style={styles.rowEmail}>{m.users?.email || "Ingen email"}</Text>
                          </View>
                          <TouchableOpacity onPress={() => handleGodkend(m.user_id)}>
                            <Text style={styles.approve}>GODKEND</Text>
                          </TouchableOpacity>
                          <TouchableOpacity onPress={() => handleAfvis(m.user_id)}>
                            <Text style={styles.reject}>AFVIS</Text>
                          </TouchableOpacity>
                        </View>
                      ))
                    )}
                  </>
                )}

                {/* Approved */}
                <Text style={[styles.listHeader, { marginTop: 8 }]}>Administratorer</Text>
                {adminsApproved.length === 0 ? (
                  <Text style={styles.emptyLine}>Ingen administratorer.</Text>
                ) : (
                  adminsApproved.map((m) => (
                    <TouchableOpacity
                      key={`a-${m.user_id}`}
                      style={styles.row}
                      onPress={() => setSelectedMember(m)}
                    >
                      {m.users?.avatar_url ? (
                        <Image source={{ uri: m.users.avatar_url }} style={styles.rowAvatar} />
                      ) : (
                        <View style={[styles.rowAvatar, styles.rowAvatarPh]}>
                          <Text>?</Text>
                        </View>
                      )}
                      <View style={{ flex: 1 }}>
                        <View style={{ flexDirection: "row", alignItems: "center" }}>
                          <Text style={styles.rowName}>{getDisplayName(m)}</Text>
                          <Text style={styles.rowTag}>ADMIN</Text>
                          <StatusBadge status={m.status} />
                        </View>
                        <Text style={styles.rowEmail}>{m.users?.email || "Ingen email"}</Text>
                      </View>
                    </TouchableOpacity>
                  ))
                )}

                <Text style={[styles.listHeader, { marginTop: 8 }]}>Medlemmer</Text>
                {membersApproved.length === 0 ? (
                  <Text style={styles.emptyLine}>Ingen medlemmer.</Text>
                ) : (
                  membersApproved.map((m) => (
                    <TouchableOpacity
                      key={`m-${m.user_id}`}
                      style={styles.row}
                      onPress={() => setSelectedMember(m)}
                    >
                      {m.users?.avatar_url ? (
                        <Image source={{ uri: m.users.avatar_url }} style={styles.rowAvatar} />
                      ) : (
                        <View style={[styles.rowAvatar, styles.rowAvatarPh]}>
                          <Text>?</Text>
                        </View>
                      )}
                      <View style={{ flex: 1 }}>
                        <View style={{ flexDirection: "row", alignItems: "center" }}>
                          <Text style={styles.rowName}>{getDisplayName(m)}</Text>
                          <Text style={styles.rowTag}>MEDLEM</Text>
                          <StatusBadge status={m.status} />
                        </View>
                        <Text style={styles.rowEmail}>{m.users?.email || "Ingen email"}</Text>
                      </View>
                    </TouchableOpacity>
                  ))
                )}

                {/* Declined (kun admin/ejer – vises for overblik) */}
                {isUserAdmin && (
                  <>
                    <Text style={[styles.listHeader, { marginTop: 8 }]}>Afviste</Text>
                    {declined.length === 0 ? (
                      <Text style={styles.emptyLine}>Ingen afviste.</Text>
                    ) : (
                      declined.map((m) => (
                        <View key={`d-${m.user_id}`} style={styles.row}>
                          {m.users?.avatar_url ? (
                            <Image source={{ uri: m.users.avatar_url }} style={styles.rowAvatar} />
                          ) : (
                            <View style={[styles.rowAvatar, styles.rowAvatarPh]}>
                              <Text>?</Text>
                            </View>
                          )}
                          <View style={{ flex: 1 }}>
                            <View style={{ flexDirection: "row", alignItems: "center" }}>
                              <Text style={styles.rowName}>{getDisplayName(m)}</Text>
                              <Text style={styles.rowTag}>
                                {isAdmin(m, forening.oprettet_af) ? "ADMIN" : "MEDLEM"}
                              </Text>
                              <StatusBadge status={m.status} />
                            </View>
                            <Text style={styles.rowEmail}>{m.users?.email || "Ingen email"}</Text>
                          </View>
                        </View>
                      ))
                    )}
                  </>
                )}
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#7C8996",
  },

  /* Topbar */
  topBar: {
    flexDirection: "row", justifyContent: "space-between",
    paddingHorizontal: 14, paddingTop: 42, paddingBottom: 8, alignItems: "center",
  },
  backBtn: {
    width: 34, height: 34, borderRadius: 17, backgroundColor: "#131921",
    alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: "#ffffff40",
  },
  backBtnText: { color: "#fff", fontWeight: "800", fontSize: 16, lineHeight: 16 },

  counter: {
    flexDirection: "row", alignItems: "center", backgroundColor: "#e8eef7",
    paddingHorizontal: 10, paddingVertical: 6, borderRadius: 16, gap: 6,
  },
  counterIcon: { fontSize: 12 },
  counterNum: { color: "#131921", fontWeight: "800", fontSize: 13 },
  topBadge: {
    marginLeft: 6, backgroundColor: "#ef4444", borderRadius: 8, paddingHorizontal: 6, paddingVertical: 1,
  },
  topBadgeText: { color: "#fff", fontSize: 10, fontWeight: "800" },

  /* Kort */
  card: {
    marginHorizontal: 14, marginTop: 6, backgroundColor: "#fff",
    borderRadius: 14, padding: 12, shadowColor: "#000", shadowOpacity: 0.08,
    shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 3,
  },
  hero: { width: "100%", height: 180, borderRadius: 10, marginBottom: 8, resizeMode: "cover" },
  heroPlaceholder: { backgroundColor: "#e1e7ef", alignItems: "center", justifyContent: "center" },

  title: { fontSize: 22, fontWeight: "900", color: "#254890", marginTop: 4 },
  place: { fontSize: 14, fontWeight: "700", color: "#333", marginTop: 2 },
  desc: { fontSize: 13, color: "#4d5a6a", marginTop: 6, lineHeight: 18 },

  bigBtn: { marginTop: 12, borderRadius: 10, paddingVertical: 10, alignItems: "center" },
  join: { backgroundColor: "#254890" },
  leave: { backgroundColor: "#9aa0a6" },
  bigBtnText: { color: "#fff", fontSize: 14, fontWeight: "800" },

  uploadBtn: {
    marginTop: 10, borderWidth: 1.5, borderColor: "#0f1720",
    paddingVertical: 9, borderRadius: 10, alignItems: "center",
  },
  uploadBtnText: { color: "#0f1720", fontWeight: "900", fontSize: 13 },

  /* Sektion */
  section: {
    marginTop: 12, marginHorizontal: 14, backgroundColor: "#8794a1",
    borderRadius: 14, padding: 12,
  },
  sectionTitle: { fontSize: 16, fontWeight: "900", color: "#183c7a" },

  /* Medlemmer preview */
  memberBox: { alignItems: "center", marginRight: 12, minWidth: 64 },
  memberAvatar: { width: 40, height: 40, borderRadius: 20, marginBottom: 4, backgroundColor: "#e1e7ef" },
  memberAvatarPlaceholder: {
    width: 40, height: 40, borderRadius: 20, marginBottom: 4, backgroundColor: "#e1e7ef",
    alignItems: "center", justifyContent: "center",
  },
  memberName: { color: "#0b2a5a", fontSize: 11, fontWeight: "700", textAlign: "center" },

  /* Modal */
  modalBackdrop: {
    flex: 1, backgroundColor: "rgba(0,0,0,0.35)", alignItems: "center", justifyContent: "center", padding: 18,
  },
  modalCard: { width: "100%", maxWidth: 560, backgroundColor: "#fff", borderRadius: 14, padding: 12 },
  modalHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 6 },
  modalTitle: { fontSize: 16, fontWeight: "900", color: "#183c7a" },
  modalClose: { fontSize: 18, paddingHorizontal: 8, paddingVertical: 4 },

  listHeader: { fontSize: 12, fontWeight: "800", color: "#4a5a6a", marginVertical: 6 },
  emptyLine: { fontSize: 12, color: "#6b7785", paddingVertical: 6 },

  row: {
    flexDirection: "row", alignItems: "center", paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: "#e8eef2",
  },
  rowAvatar: { width: 34, height: 34, borderRadius: 17, marginRight: 10 },
  rowAvatarPh: { backgroundColor: "#e1e7ef", alignItems: "center", justifyContent: "center" },
  rowName: { fontSize: 13, fontWeight: "700", color: "#1d2b3a", marginRight: 6 },
  rowEmail: { fontSize: 11, color: "#5b6a79" },
  rowTag: { fontSize: 10, fontWeight: "800", color: "#254890", marginLeft: 4, marginRight: 4 },

  /* Badges */
  statusBadge: {
    paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6, marginLeft: 4,
  },
  statusBadgeText: { fontSize: 9, fontWeight: "900", color: "#fff" },

  /* Profilvisning i modal */
  profileWrap: { alignItems: "center", paddingVertical: 10 },
  profileAvatar: { width: 140, height: 140, borderRadius: 12, marginBottom: 10, backgroundColor: "#e1e7ef" },
  profileName: { fontSize: 16, fontWeight: "800", color: "#1d2b3a" },
  profileEmail: { fontSize: 12, color: "#5b6a79", marginTop: 2, marginBottom: 8 },
  roleText: { fontSize: 12, fontWeight: "900", color: "#254890" },
  profileBackBtn: {
    paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, borderWidth: 1, borderColor: "#d5dde6",
  },
  profileBackText: { fontSize: 12, fontWeight: "700", color: "#355" },

  approve: { color: "#16a34a", fontWeight: "900", fontSize: 11, marginHorizontal: 6 },
  reject: { color: "#ef4444", fontWeight: "900", fontSize: 11, marginLeft: 2 },
});