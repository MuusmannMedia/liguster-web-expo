// app/forening/[id]/events.tsx
import DateTimePicker, { AndroidEvent } from "@react-native-community/datetimepicker";
import { useFocusEffect } from "@react-navigation/native";
import { decode } from "base64-arraybuffer";
import * as ImageManipulator from "expo-image-manipulator";
import * as ImagePicker from "expo-image-picker";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

import { useSession } from "../../../hooks/useSession";
import { supabase } from "../../../utils/supabase";

/* ---------- Typer ---------- */
type MedlemsRow = {
  user_id: string;
  rolle?: string | null;
  status?: "pending" | "approved" | "declined" | null;
};

type EventRow = {
  id: string;
  forening_id: string;
  title: string;
  description: string | null;
  location: string | null;
  start_at: string;
  end_at: string;
  price: number | null;
  capacity: number | null;
  allow_registration: boolean | null;
  image_url: string | null;
  created_by: string;
  created_at: string;
};

type RegRow = {
  user_id: string;
  created_at: string;
  users?: {
    name?: string | null;
    username?: string | null;
    email?: string | null;
    avatar_url?: string | null;
  } | null;
};

type PushStats = {
  forening_id: string;
  total_members: number;
  active_push_members: number;
};

const REG_TABLE = "forening_event_registrations";
const ALT_REG_TABLE = "forening_event_tilmeldinger";

const isAdmin = (m: MedlemsRow, ownerId?: string | null) => {
  const r = (m.rolle || "").toLowerCase();
  return r === "admin" || r === "administrator" || (!!ownerId && m.user_id === ownerId);
};

/* ---------- Dansk formatering ---------- */
const LOCALE = "da-DK";
const fmtDate = (d: Date) =>
  d.toLocaleDateString(LOCALE, { year: "numeric", month: "long", day: "numeric" });
const fmtTime = (d: Date) =>
  d.toLocaleTimeString(LOCALE, { hour: "2-digit", minute: "2-digit" });
const fmtRange = (sISO: string, eISO: string) => {
  const s = new Date(sISO);
  const e = new Date(eISO);
  const sameDay =
    s.getFullYear() === e.getFullYear() &&
    s.getMonth() === e.getMonth() &&
    s.getDate() === e.getDate();
  return sameDay
    ? `${fmtDate(s)} kl. ${fmtTime(s)}–${fmtTime(e)}`
    : `${fmtDate(s)} ${fmtTime(s)} – ${fmtDate(e)} ${fmtTime(e)}`;
};

/* ---------- Hjælpere ---------- */
const displayName = (u?: RegRow["users"]) => {
  const n = u?.name?.trim() || u?.username?.trim();
  if (n) return n;
  const email = u?.email || "";
  return email.includes("@") ? email.split("@")[0] : "Ukendt";
};

function base64Bytes(b64: string): number {
  const len = b64.length;
  const padding = (b64.endsWith("==") ? 2 : b64.endsWith("=") ? 1 : 0);
  return Math.floor((len * 3) / 4) - padding;
}

/** Komprimer og nedskaler billede til max 1600 px bredde og ~60% kvalitet. */
async function compressImage(uri: string, maxBytes = 2 * 1024 * 1024) {
  let quality = 0.6;
  let out = await ImageManipulator.manipulateAsync(
    uri,
    [{ resize: { width: 1600 } }],
    { compress: quality, format: ImageManipulator.SaveFormat.JPEG, base64: true }
  );

  let bytes = out.base64 ? base64Bytes(out.base64) : Number.MAX_SAFE_INTEGER;
  while (bytes > maxBytes && quality > 0.3) {
    quality = Math.max(0.3, quality - 0.1);
    out = await ImageManipulator.manipulateAsync(
      out.uri,
      [],
      { compress: quality, format: ImageManipulator.SaveFormat.JPEG, base64: true }
    );
    bytes = out.base64 ? base64Bytes(out.base64) : Number.MAX_SAFE_INTEGER;
  }
  return out;
}

/* ---------- Lille, hook-fri række-komponent ---------- */
const EventListRow = React.memo(function EventListRow({
  e,
  count,
  deleting,
  onOpen,
  onDelete,
  canDelete,
}: {
  e: EventRow;
  count: number;
  deleting: boolean;
  onOpen: (ev: EventRow) => void;
  onDelete: (ev: EventRow) => void;
  canDelete: boolean;
}) {
  return (
    <TouchableOpacity
      activeOpacity={0.9}
      onPress={() => onOpen(e)}
      style={[styles.section, styles.rowBg, { paddingVertical: 10 }]}
    >
      {e.image_url ? <Image source={{ uri: e.image_url }} style={styles.cardImage} /> : null}
      <View style={{ flex: 1 }}>
        <Text style={styles.rowTitle}>{e.title}</Text>
        <Text style={styles.rowMeta}>{fmtRange(e.start_at, e.end_at)}</Text>
        {!!e.location && <Text style={styles.rowMeta}>📍 {e.location}</Text>}
        {!!e.price && <Text style={styles.rowMeta}>Pris: {e.price} kr.</Text>}
        {e.allow_registration ? (
          <Text style={[styles.rowMeta, { marginTop: 2 }]}>
            {e.capacity ? `${count} / ${e.capacity} tilmeldt` : `${count} tilmeldt`}
          </Text>
        ) : null}
      </View>
      {canDelete && (
        <TouchableOpacity
          onPress={() => onDelete(e)}
          style={styles.iconDeleteBtn}
          disabled={deleting}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Text style={styles.iconDeleteText}>{deleting ? "…" : "✕"}</Text>
        </TouchableOpacity>
      )}
    </TouchableOpacity>
  );
});

export default function EventsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { session } = useSession();
  const userId = session?.user?.id ?? null;

  const [loading, setLoading] = useState(true);
  const [ownerId, setOwnerId] = useState<string | null>(null);
  const [members, setMembers] = useState<MedlemsRow[]>([]);
  const [events, setEvents] = useState<EventRow[]>([]);
  const [regCounts, setRegCounts] = useState<Record<string, number>>({});

  // Opret felter
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [location, setLocation] = useState("");

  // Dato/tid felter
  const [startDate, setStartDate] = useState<Date | null>(null);
  const [endDate, setEndDate] = useState<Date | null>(null);

  const [price, setPrice] = useState("");
  const [capacity, setCapacity] = useState("");
  const [allowRegistration, setAllowRegistration] = useState(false);
  const [saving, setSaving] = useState(false);

  // Skjult opret-aktivitet kort
  const [showCreateForm, setShowCreateForm] = useState(false);

  // Billede til event
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [imageBase64, setImageBase64] = useState<string | null>(null);

  // Modal for detaljer
  const [showEventModal, setShowEventModal] = useState(false);
  const [activeEvent, setActiveEvent] = useState<EventRow | null>(null);

  // Redigering (for aktivt event)
  const [editMode, setEditMode] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editLocation, setEditLocation] = useState("");
  const [editStart, setEditStart] = useState<Date | null>(null);
  const [editEnd, setEditEnd] = useState<Date | null>(null);
  const [editPrice, setEditPrice] = useState("");
  const [editCapacity, setEditCapacity] = useState("");
  const [editAllowRegistration, setEditAllowRegistration] = useState(false);
  const [editSaving, setEditSaving] = useState(false);

  // Deltagere (for aktivt event)
  const [attendees, setAttendees] = useState<RegRow[]>([]);
  const [loadingAtt, setLoadingAtt] = useState(false);
  const [joining, setJoining] = useState(false);
  const [leaving, setLeaving] = useState(false);

  // Push-udsendelse status (én gang pr. event)
  const [hasPushed, setHasPushed] = useState(false);
  const [sendingPush, setSendingPush] = useState(false);
  const [pushStats, setPushStats] = useState<PushStats | null>(null);

  // Medlemsstatus
  const myRow = useMemo(
    () => members.find((m) => m.user_id === userId) || null,
    [members, userId]
  );
  const amAdmin = !!myRow && isAdmin(myRow, ownerId);
  const isApprovedMember = (myRow?.status ?? null) === "approved";

  /* ---------- Én fælles dato/tid picker ---------- */
  type PickerCtx = "create" | "edit";
  type Which = "start" | "end";
  type Mode = "date" | "time";
  const [pickerVisible, setPickerVisible] = useState(false);
  const [pickerContext, setPickerContext] = useState<PickerCtx>("create");
  const [pickerWhich, setPickerWhich] = useState<Which>("start");
  const [pickerMode, setPickerMode] = useState<Mode>("date");
  const [pickerTemp, setPickerTemp] = useState<Date>(new Date());

  const openPicker = (ctx: PickerCtx, which: Which, mode: Mode) => {
    setPickerContext(ctx);
    setPickerWhich(which);
    setPickerMode(mode);
    const current =
      ctx === "create"
        ? (which === "start" ? startDate : endDate)
        : (which === "start" ? editStart : editEnd);
    setPickerTemp(current ?? new Date());
    setPickerVisible(true);
  };

  const applyPicker = () => {
    const temp = new Date(pickerTemp);
    const apply = (prev: Date | null) =>
      pickerMode === "date" && prev
        ? new Date(temp.getFullYear(), temp.getMonth(), temp.getDate(), prev.getHours(), prev.getMinutes())
        : temp;

    if (pickerContext === "create") {
      pickerWhich === "start" ? setStartDate((p) => apply(p)) : setEndDate((p) => apply(p));
    } else {
      pickerWhich === "start" ? setEditStart((p) => apply(p)) : setEditEnd((p) => apply(p));
    }
    setPickerVisible(false);
  };
  const cancelPicker = () => setPickerVisible(false);
  const onNativePick = (_e: AndroidEvent, sel?: Date) => { if (sel) setPickerTemp(sel); };

  /* ----- Init & fetch ----- */
  useEffect(() => {
    (async () => {
      setLoading(true);
      const { data: f } = await supabase.from("foreninger").select("oprettet_af").eq("id", id).single();
      if (f) setOwnerId(f.oprettet_af ?? null);

      const { data: mem } = await supabase
        .from("foreningsmedlemmer")
        .select("user_id, rolle, status")
        .eq("forening_id", id);
      if (mem) setMembers(mem as MedlemsRow[]);

      setLoading(false);
    })();
  }, [id]);

  const fetchEvents = async () => {
    const { data, error } = await supabase
      .from("forening_events")
      .select(
        "id, forening_id, title, description, location, start_at, end_at, price, capacity, allow_registration, image_url, created_by, created_at"
      )
      .eq("forening_id", id)
      .order("start_at", { ascending: false });

    if (error) {
      console.error("Kunne ikke hente aktiviteter:", error.message);
      setEvents([]);
      return;
    }
    setEvents((data || []) as EventRow[]);
  };

  // Første load
  useEffect(() => {
    fetchEvents();
  }, [id]);

  // Hent igen når skærmen bliver fokuseret
  useFocusEffect(
    React.useCallback(() => {
      (async () => {
        await fetchEvents();
        await fetchCountsForEvents(events.map((e) => e.id));
      })();
      return () => {};
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [id])
  );

  /* ---------- Antal tilmeldte pr. event ---------- */
  const fetchCountsForEvents = async (eventIds: string[]) => {
    if (!eventIds.length) return;

    const next: Record<string, number> = { ...regCounts };

    const countVia = async (table: string, evId: string) => {
      const { data, count, error } = await supabase
        .from(table)
        .select("event_id", { count: "exact" })
        .eq("event_id", evId);
      if (error) throw error;
      return typeof count === "number" ? count : (data?.length ?? 0);
    };

    for (const evId of eventIds) {
      let total = 0;
      try { total += await countVia(REG_TABLE, evId); } catch {}
      try { total += await countVia(ALT_REG_TABLE, evId); } catch {}
      next[evId] = total;
    }

    setRegCounts(next);
  };

  // Hent counts når events ændrer sig
  useEffect(() => {
    fetchCountsForEvents(events.map((e) => e.id));
  }, [events]);

  /* ---------- Hent deltagere til modal ---------- */
  const fetchAttendees = async (eventId: string) => {
    try {
      setLoadingAtt(true);

      let regsRes = await supabase
        .from(REG_TABLE)
        .select("user_id, created_at")
        .eq("event_id", eventId)
        .order("created_at", { ascending: true });

      if (regsRes.error) {
        regsRes = await supabase
          .from(ALT_REG_TABLE)
          .select("user_id, created_at")
          .eq("event_id", eventId)
          .order("created_at", { ascending: true });
      }
      if (regsRes.error) throw regsRes.error;

      const regs = (regsRes.data || []) as { user_id: string; created_at: string }[];

      const ids = Array.from(new Set(regs.map((r) => r.user_id)));
      if (ids.length === 0) {
        setAttendees([]);
        return;
      }

      const { data: users, error: uErr } = await supabase
        .from("users")
        .select("id, name, username, email, avatar_url")
        .in("id", ids);

      if (uErr) throw uErr;
      const byId = new Map(users.map((u: any) => [u.id, u]));

      const withUsers: RegRow[] = regs.map((r) => ({
        user_id: r.user_id,
        created_at: r.created_at,
        users: byId.get(r.user_id) || null,
      }));

      setAttendees(withUsers);
    } catch (e: any) {
      console.error("Kunne ikke hente tilmeldinger:", e?.message || e);
      setAttendees([]);
    } finally {
      setLoadingAtt(false);
    }
  };

  /* ----- Realtime: lyt på inserts/deletes i tilmeldinger ----- */
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  useEffect(() => {
    const handleChangeFor = async (payload: any) => {
      const evId = payload.new?.event_id ?? payload.old?.event_id;
      if (!evId) return;
      await fetchCountsForEvents([evId]);
      if (activeEvent && activeEvent.id === evId) {
        await fetchAttendees(evId);
      }
    };

    const ch = supabase
      .channel("event-registrations")
      .on("postgres_changes", { event: "*", schema: "public", table: REG_TABLE }, handleChangeFor)
      .on("postgres_changes", { event: "*", schema: "public", table: ALT_REG_TABLE }, handleChangeFor)
      .subscribe();

    channelRef.current = ch;
    return () => {
      if (channelRef.current) supabase.removeChannel(channelRef.current);
      channelRef.current = null;
    };
  }, [activeEvent?.id]);

  /* ---------- PUSH: status, statistik og afsendelse ---------- */
  const refreshHasPushed = async (ev: EventRow | null) => {
    if (!ev) { setHasPushed(false); return; }
    const { data, error } = await supabase
      .from("event_push_broadcasts")
      .select("id")
      .eq("event_id", ev.id)
      .maybeSingle();
    if (error && String(error.message || "").includes("permission")) {
      setHasPushed(false);
      return;
    }
    setHasPushed(!!data);
  };

  const fetchPushStats = async (foreningId: string) => {
    try {
      const { data, error } = await supabase
        .from("v_forening_push_stats")
        .select("forening_id, total_members, active_push_members")
        .eq("forening_id", foreningId)
        .maybeSingle();
      if (error) throw error;
      setPushStats(data as PushStats);
    } catch {
      setPushStats(null);
    }
  };

  const handleSendPush = async () => {
    if (!activeEvent || !userId) return;
    if (!(amAdmin || activeEvent.created_by === userId)) {
      return Alert.alert("Adgang nægtet", "Kun skaberen eller en administrator kan udsende push.");
    }

    Alert.alert(
      "Send push til medlemmer?",
      "Denne besked kan kun sendes én gang for denne aktivitet.",
      [
        { text: "Annullér", style: "cancel" },
        {
          text: "Send",
          style: "default",
          onPress: async () => {
            try {
              setSendingPush(true);
              const title = activeEvent.title || "Ny aktivitet";
              const body =
                activeEvent.location
                  ? `${fmtRange(activeEvent.start_at, activeEvent.end_at)} • ${activeEvent.location}`
                  : `${fmtRange(activeEvent.start_at, activeEvent.end_at)}`;

              const { data, error } = await supabase.rpc("send_event_push", {
                p_forening_id: activeEvent.forening_id,
                p_event_id: activeEvent.id,
                p_sender_id: userId,
                p_title: title,
                p_body: body,
              });

              if (error) {
                const msg = String(error.message || "").toLowerCase();
                if (msg.includes("already_sent")) {
                  setHasPushed(true);
                  Alert.alert("Allerede sendt", "Push er allerede udsendt for denne aktivitet.");
                } else {
                  throw error;
                }
              } else {
                setHasPushed(true);
                const count = typeof data === "number" ? data : 0;
                Alert.alert("Besked på vej ✅", `Udsendt til ${count} medlem(mer).`);
              }
            } catch (e: any) {
              Alert.alert("Fejl", e?.message ?? "Kunne ikke sende push.");
            } finally {
              setSendingPush(false);
            }
          },
        },
      ]
    );
  };

  /* ----- Image Picker ----- */
  const ensureMediaPermission = async () => {
    const perm = await ImagePicker.getMediaLibraryPermissionsAsync();
    if (perm.granted) return true;
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    return status === "granted";
  };

  const pickImage = async () => {
    try {
      const ok = await ensureMediaPermission();
      if (!ok) {
        Alert.alert("Adgang nægtet", "Giv adgang til billeder for at kunne uploade.");
        return;
      }

      const res = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 1,
      });

      if ((res as any)?.canceled) return;
      const asset = (res as any)?.assets?.[0];
      if (!asset?.uri) return;

      const manipulated = await compressImage(asset.uri, 2 * 1024 * 1024);
      if (!manipulated.base64) {
        Alert.alert("Fejl", "Kunne ikke læse billedet.");
        return;
      }

      setImagePreview(manipulated.uri);
      setImageBase64(manipulated.base64);
    } catch (e: any) {
      Alert.alert("Fejl", e?.message ?? "Kunne ikke åbne billedvælger.");
    }
  };

  /* ----- Opret event ----- */
  const createEvent = async () => {
    if (!userId || !id) return;
    if (!title.trim()) return Alert.alert("Manglende titel", "Skriv venligst en overskrift.");
    if (!startDate || !endDate) return Alert.alert("Dato/tid mangler", "Vælg både start og slut (dato og tid).");

    try {
      Keyboard.dismiss();
      setSaving(true);

      // Upload billede hvis valgt
      let image_url: string | null = null;
      if (imageBase64) {
        const BUCKET = "foreningsbilleder";
        const filePath = `events/${id}/ev_${Date.now()}.jpg`;

        const { error: upErr } = await supabase.storage
          .from(BUCKET)
          .upload(filePath, decode(imageBase64), {
            contentType: "image/jpeg",
            upsert: true,
          });

        if (upErr) throw upErr;

        const { data } = supabase.storage.from(BUCKET).getPublicUrl(filePath);
        image_url = data?.publicUrl ?? null;
      }

      const payload = {
        forening_id: String(id),
        title: title.trim(),
        description: description.trim() || null,
        location: location.trim() || null,
        start_at: startDate.toISOString(),
        end_at: endDate.toISOString(),
        price: price ? Number(price) : null,
        capacity: capacity ? Number(capacity) : null,
        allow_registration: allowRegistration,
        image_url,
        created_by: userId!,
      };

      const { error } = await supabase.from("forening_events").insert([payload]);
      if (error) throw error;

      await fetchEvents();
      await new Promise((res) => requestAnimationFrame(res));

      setTitle("");
      setDescription("");
      setLocation("");
      setStartDate(null);
      setEndDate(null);
      setPrice("");
      setCapacity("");
      setAllowRegistration(false);
      setImagePreview(null);
      setImageBase64(null);
      setShowCreateForm(false);
    } catch (err: any) {
      Alert.alert("Fejl", err?.message ?? "Kunne ikke oprette aktiviteten.");
    } finally {
      setSaving(false);
    }
  };

  /* ----- Slet event ----- */
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const canDeleteEvent = (e: EventRow) => amAdmin || e.created_by === userId;

  const deleteEvent = (e: EventRow) => {
    if (!canDeleteEvent(e)) return;
    Alert.alert("Slet aktivitet", `Vil du slette "${e.title}"?`, [
      { text: "Annuller", style: "cancel" },
      {
        text: "Slet",
        style: "destructive",
        onPress: async () => {
          try {
            setDeletingId(e.id);
            const { error } = await supabase.from("forening_events").delete().eq("id", e.id);
            if (error) throw error;
            setEvents((prev) => prev.filter((x) => x.id !== e.id));
            if (activeEvent?.id === e.id) setShowEventModal(false);
          } catch (err: any) {
            Alert.alert("Fejl", err?.message ?? "Kunne ikke slette aktiviteten.");
          } finally {
            setDeletingId(null);
          }
        },
      },
    ]);
  };

  /* ----- Rediger event ----- */
  const canEditEvent = (e: EventRow) => amAdmin || e.created_by === userId;

  const openEdit = (e: EventRow) => {
    setEditMode(true);
    setEditTitle(e.title);
    setEditDescription(e.description || "");
    setEditLocation(e.location || "");
    setEditStart(new Date(e.start_at));
    setEditEnd(new Date(e.end_at));
    setEditPrice(e.price ? String(e.price) : "");
    setEditCapacity(e.capacity ? String(e.capacity) : "");
    setEditAllowRegistration(!!e.allow_registration);
  };

  const saveEdit = async () => {
    if (!activeEvent) return;
    if (!editTitle.trim()) return Alert.alert("Manglende titel", "Skriv venligst en overskrift.");
    if (!editStart || !editEnd) return Alert.alert("Dato/tid mangler", "Vælg både start og slut (dato og tid).");

    try {
      setEditSaving(true);
      const { data, error } = await supabase
        .from("forening_events")
        .update({
          title: editTitle.trim(),
          description: editDescription.trim() || null,
          location: editLocation.trim() || null,
          start_at: editStart.toISOString(),
          end_at: editEnd.toISOString(),
          price: editPrice ? Number(editPrice) : null,
          capacity: editCapacity ? Number(editCapacity) : null,
          allow_registration: editAllowRegistration,
        })
        .eq("id", activeEvent.id)
        .select()
        .single();

      if (error) throw error;

      setEvents((prev) => prev.map((x) => (x.id === activeEvent.id ? (data as EventRow) : x)));
      setActiveEvent(data as EventRow);
      setEditMode(false);
    } catch (e: any) {
      Alert.alert("Fejl", e?.message ?? "Kunne ikke gemme ændringerne.");
    } finally {
      setEditSaving(false);
    }
  };

  /* ----- Tilmeld/frameld ----- */
  const isRegistered = useMemo(
    () => !!userId && attendees.some((a) => a.user_id === userId),
    [attendees, userId]
  );

  const atCapacity = useMemo(() => {
    if (!activeEvent?.capacity) return false;
    return attendees.length >= activeEvent.capacity;
  }, [attendees.length, activeEvent?.capacity]);

  const canRegisterHere = useMemo(() => {
    if (!activeEvent?.allow_registration) return false;
    if (!isApprovedMember) return false;
    if (atCapacity && !isRegistered) return false;
    return true;
  }, [activeEvent?.allow_registration, isApprovedMember, atCapacity, isRegistered]);

  const joinEvent = async () => {
    if (!activeEvent || !userId) return;
    try {
      setJoining(true);
      let ins = await supabase.from(REG_TABLE).insert([{ event_id: activeEvent.id, user_id: userId }]);
      if (ins.error) {
        if (!String(ins.error.message).toLowerCase().includes("duplicate")) {
          ins = await supabase.from(ALT_REG_TABLE).insert([{ event_id: activeEvent.id, user_id: userId }]);
          if (ins.error && !String(ins.error.message).toLowerCase().includes("duplicate")) {
            throw ins.error;
          }
        }
      }
      await fetchAttendees(activeEvent.id);
      await fetchCountsForEvents([activeEvent.id]);
    } catch (e: any) {
      Alert.alert("Fejl", e?.message ?? "Kunne ikke tilmelde dig.");
    } finally {
      setJoining(false);
    }
  };

  const leaveEvent = async () => {
    if (!activeEvent || !userId) return;
    try {
      setLeaving(true);
      let del = await supabase
        .from(REG_TABLE)
        .delete()
        .eq("event_id", activeEvent.id)
        .eq("user_id", userId);
      if (del.error) {
        del = await supabase
          .from(ALT_REG_TABLE)
          .delete()
          .eq("event_id", activeEvent.id)
          .eq("user_id", userId);
        if (del.error) throw del.error;
      }
      await fetchAttendees(activeEvent.id);
      await fetchCountsForEvents([activeEvent.id]);
    } catch (e: any) {
      Alert.alert("Fejl", e?.message ?? "Kunne ikke framelde dig.");
    } finally {
      setLeaving(false);
    }
  };

  /* ---------- Afledte lister ---------- */
  const now = new Date();
  const upcomingEvents = useMemo(() => {
    return events
      .filter((e) => new Date(e.end_at).getTime() >= now.getTime())
      .sort((a, b) => new Date(a.start_at).getTime() - new Date(b.start_at).getTime());
  }, [events, now]);

  const pastEvents = useMemo(() => {
    return events
      .filter((e) => new Date(e.end_at).getTime() < now.getTime())
      .sort((a, b) => new Date(b.end_at).getTime() - new Date(a.end_at).getTime());
  }, [events, now]);

  /* ---------- Header ---------- */
  const Header = (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <View style={styles.topBar}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backBtnText}>‹</Text>
        </TouchableOpacity>
        <View style={{ width: 34 }} />
      </View>

      <View style={[styles.section, { marginBottom: 0 }]}>
        <TouchableOpacity
          onPress={() => setShowCreateForm((s) => !s)}
          style={[styles.createToggleBtn, showCreateForm ? styles.toggleOn : styles.toggleOff]}
          activeOpacity={0.9}
        >
          <Text style={styles.createToggleText}>
            {showCreateForm ? "Skjul opret aktivitet" : "Opret aktivitet"}
          </Text>
          <Text style={styles.createToggleIcon}>{showCreateForm ? "▴" : "▾"}</Text>
        </TouchableOpacity>

        {showCreateForm && (
          <View style={{ marginTop: 10 }}>
            <TextInput
              style={styles.input}
              value={title}
              onChangeText={setTitle}
              placeholder="Overskrift *"
              placeholderTextColor="#9aa0a6"
            />

            <TextInput
              style={[styles.input, styles.inputMultiline]}
              value={description}
              onChangeText={setDescription}
              placeholder="Beskrivelse"
              placeholderTextColor="#9aa0a6"
              multiline
            />

            <TextInput
              style={styles.input}
              value={location}
              onChangeText={setLocation}
              placeholder="Sted (adresse/område)"
              placeholderTextColor="#9aa0a6"
            />

            {/* Start */}
            <TouchableOpacity onPress={() => openPicker("create", "start", "date")} style={styles.pickerBtn}>
              <Text style={styles.pickerLabel}>Startdato *</Text>
              <Text style={styles.pickerValue}>{startDate ? fmtDate(startDate) : "Vælg dato"}</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => openPicker("create", "start", "time")} style={[styles.smallBtn, styles.blackBtn, { marginTop: 6 }]}>
              <Text style={styles.smallBtnText}>
                {startDate ? `Vælg starttid (nu: ${fmtTime(startDate)})` : "Vælg starttid"}
              </Text>
            </TouchableOpacity>

            {/* Slut */}
            <TouchableOpacity onPress={() => openPicker("create", "end", "date")} style={styles.pickerBtn}>
              <Text style={styles.pickerLabel}>Slutdato *</Text>
              <Text style={styles.pickerValue}>{endDate ? fmtDate(endDate) : "Vælg dato"}</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => openPicker("create", "end", "time")} style={[styles.smallBtn, styles.blackBtn, { marginTop: 6 }]}>
              <Text style={styles.smallBtnText}>
                {endDate ? `Vælg sluttid (nu: ${fmtTime(endDate)})` : "Vælg sluttid"}
              </Text>
            </TouchableOpacity>

            <View style={{ flexDirection: "row", gap: 8, marginTop: 8 }}>
              <TextInput
                style={[styles.input, { flex: 1 }]}
                value={price}
                onChangeText={setPrice}
                placeholder="Pris (DKK)"
                placeholderTextColor="#9aa0a6"
                keyboardType="numeric"
              />
              <TextInput
                style={[styles.input, { flex: 1 }]}
                value={capacity}
                onChangeText={setCapacity}
                placeholder="Kapacitet (antal)"
                placeholderTextColor="#9aa0a6"
                keyboardType="numeric"
              />
            </View>

            {/* Billede */}
            {imagePreview ? (
              <View style={{ marginTop: 8 }}>
                <Image source={{ uri: imagePreview }} style={styles.imagePreview} />
                <TouchableOpacity
                  onPress={() => { setImagePreview(null); setImageBase64(null); }}
                  style={[styles.smallBtn, styles.grayBtn]}
                >
                  <Text style={styles.smallBtnText}>Fjern billede</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <TouchableOpacity
                onPress={pickImage}
                style={[styles.smallBtn, styles.blackBtn, { alignSelf: "flex-start", marginTop: 8 }]}
              >
                <Text style={styles.smallBtnText}>Vælg billede</Text>
              </TouchableOpacity>
            )}

            {/* Toggle for tilmelding */}
            <View style={styles.toggleRow}>
              <Text style={styles.toggleLabel}>Tillad tilmelding</Text>
              <Switch value={allowRegistration} onValueChange={setAllowRegistration} />
            </View>

            <TouchableOpacity
              style={[styles.createBtn, saving && { opacity: 0.7 }]}
              onPress={createEvent}
              disabled={saving}
            >
              {saving ? (
                <View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
                  <ActivityIndicator size="small" color="#fff" />
                  <Text style={styles.createBtnText}>Opretter…</Text>
                </View>
              ) : (
                <Text style={styles.createBtnText}>Opret aktivitet</Text>
              )}
            </TouchableOpacity>
          </View>
        )}
      </View>
    </KeyboardAvoidingView>
  );

  /* ---------- Render ---------- */
  return (
    <View style={styles.mainContainer}>
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#131921" />
        </View>
      ) : (
        <FlatList
          data={[{ key: "content" }]}
          keyExtractor={(i) => i.key}
          ListHeaderComponent={Header}
          renderItem={null as any}
          ListFooterComponent={
            <View>
              {/* KOMMENDE */}
              <View className="groupCard" style={styles.groupCard}>
                <View style={styles.groupHeader}>
                  <Text style={styles.groupHeaderText}>KOMMENDE AKTIVITETER</Text>
                </View>
                {upcomingEvents.length === 0 ? (
                  <Text style={[styles.sectionMuted, { margin: 12 }]}>Ingen kommende aktiviteter.</Text>
                ) : (
                  upcomingEvents.map((e) => {
                    const deleting = deletingId === e.id;
                    const count = regCounts[e.id] ?? 0;
                    return (
                      <EventListRow
                        key={e.id}
                        e={e}
                        count={count}
                        deleting={deleting}
                        canDelete={canDeleteEvent(e)}
                        onOpen={async (ev) => {
                          setActiveEvent(ev);
                          setEditMode(false);
                          setShowEventModal(true);
                          await fetchAttendees(ev.id);
                          await refreshHasPushed(ev);
                          await fetchPushStats(ev.forening_id);
                        }}
                        onDelete={deleteEvent}
                      />
                    );
                  })
                )}
              </View>

              {/* AFSLUTTEDE */}
              <View style={styles.groupCard}>
                <View style={styles.groupHeader}>
                  <Text style={styles.groupHeaderText}>AFSLUTTEDE AKTIVITETER</Text>
                </View>
                {pastEvents.length === 0 ? (
                  <Text style={[styles.sectionMuted, { margin: 12 }]}>Ingen afsluttede aktiviteter.</Text>
                ) : (
                  pastEvents.map((e) => {
                    const deleting = deletingId === e.id;
                    const count = regCounts[e.id] ?? 0;
                    return (
                      <EventListRow
                        key={e.id}
                        e={e}
                        count={count}
                        deleting={deleting}
                        canDelete={canDeleteEvent(e)}
                        onOpen={async (ev) => {
                          setActiveEvent(ev);
                          setEditMode(false);
                          setShowEventModal(true);
                          await fetchAttendees(ev.id);
                          await refreshHasPushed(ev);
                          await fetchPushStats(ev.forening_id);
                        }}
                        onDelete={deleteEvent}
                      />
                    );
                  })
                )}
              </View>
            </View>
          }
          ItemSeparatorComponent={() => (
            <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: "#e9edf1" }} />
          )}
          contentContainerStyle={{ paddingBottom: 24 }}
          keyboardShouldPersistTaps="handled"
          removeClippedSubviews
          windowSize={10}
          maxToRenderPerBatch={6}
          initialNumToRender={6}
        />
      )}

      {/* Detalje-/rediger-modal */}
      <Modal
        visible={showEventModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowEventModal(false)}
      >
        <KeyboardAvoidingView
          style={styles.modalBackdrop}
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          keyboardVerticalOffset={Platform.OS === "ios" ? 64 : 0}
        >
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{editMode ? "Rediger aktivitet" : "Aktivitet"}</Text>
              <TouchableOpacity
                onPress={() => { setEditMode(false); setShowEventModal(false); }}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <Text style={styles.modalClose}>✕</Text>
              </TouchableOpacity>
            </View>

            {activeEvent ? (
              !editMode ? (
                <ScrollView>
                  {activeEvent.image_url ? (
                    <Image source={{ uri: activeEvent.image_url }} style={styles.detailImage} />
                  ) : null}
                  <Text style={styles.detailTitle}>{activeEvent.title}</Text>
                  <Text style={styles.detailRange}>{fmtRange(activeEvent.start_at, activeEvent.end_at)}</Text>
                  {!!activeEvent.location && <Text style={styles.detailMeta}>📍 {activeEvent.location}</Text>}
                  {!!activeEvent.price && <Text style={styles.detailMeta}>Pris: {activeEvent.price} kr.</Text>}
                  {!!activeEvent.capacity && (
                    <Text style={styles.detailMeta}>Kapacitet: {activeEvent.capacity}</Text>
                  )}
                  {!!activeEvent.description && (
                    <Text style={[styles.detailMeta, { marginTop: 6 }]}>{activeEvent.description}</Text>
                  )}

                  {/* Tilmelding */}
                  {activeEvent.allow_registration ? (
                    <View style={[styles.sectionBox, { marginTop: 10 }]}>
                      <View style={styles.regHeaderRow}>
                        <Text style={styles.sectionTitle}>TILMELDINGER</Text>
                        <Text style={styles.sectionMuted}>
                          {attendees.length}
                          {activeEvent.capacity ? ` / ${activeEvent.capacity}` : ""} tilmeldt
                        </Text>
                      </View>

                      {isApprovedMember ? (
                        <View style={{ flexDirection: "row", gap: 8, marginTop: 6 }}>
                          {!isRegistered ? (
                            <TouchableOpacity
                              style={[styles.actionBtn, styles.blackBtn]}
                              onPress={joinEvent}
                              disabled={joining || atCapacity}
                            >
                              <Text numberOfLines={1} style={styles.actionText}>
                                {joining ? "Tilmeld..." : atCapacity ? "Fuldt" : "Tilmeld"}
                              </Text>
                            </TouchableOpacity>
                          ) : (
                            <TouchableOpacity
                              style={[styles.actionBtn, styles.grayBtn]}
                              onPress={leaveEvent}
                              disabled={leaving}
                            >
                              <Text numberOfLines={1} style={styles.actionText}>
                                {leaving ? "Afmelder..." : "Afmeld"}
                              </Text>
                            </TouchableOpacity>
                          )}
                        </View>
                      ) : (
                        <Text style={[styles.sectionMuted, { marginTop: 6 }]}>
                          Du skal være godkendt medlem for at kunne tilmelde dig.
                        </Text>
                      )}

                      {/* Liste over deltagere */}
                      <View style={{ marginTop: 8 }}>
                        {loadingAtt ? (
                          <Text style={styles.sectionMuted}>Indlæser deltagere…</Text>
                        ) : attendees.length === 0 ? (
                          <Text style={styles.sectionMuted}>Ingen tilmeldinger endnu.</Text>
                        ) : (
                          attendees.map((a) => (
                            <View key={a.user_id} style={styles.attRow}>
                              {a.users?.avatar_url ? (
                                <Image source={{ uri: a.users.avatar_url }} style={styles.attAvatar} />
                              ) : (
                                <View style={[styles.attAvatar, { backgroundColor: "#e9edf1", alignItems: "center", justifyContent: "center" }]}>
                                  <Text style={{ color: "#131921", fontWeight: "900" }}>
                                    {(displayName(a.users) || "U").slice(0, 1).toUpperCase()}
                                  </Text>
                                </View>
                              )}
                              <View style={{ flex: 1 }}>
                                <Text style={styles.attName}>{displayName(a.users)}</Text>
                                {!!a.users?.email && (
                                  <Text style={styles.attEmail}>{a.users.email}</Text>
                                )}
                              </View>
                            </View>
                          ))
                        )}
                      </View>
                    </View>
                  ) : null}

                  {/* KNAPPER I BUNDEN – ÉN KOLONNE */}
                  <View style={styles.buttonsRow}>
                    <TouchableOpacity
                      style={[styles.actionBtn, styles.blackBtn]}
                      onPress={() => {
                        setShowEventModal(false);
                        router.push({
                          pathname: "/forening/[id]/images",
                          params: { id: String(id), eventId: activeEvent.id },
                        });
                      }}
                    >
                      <Text numberOfLines={1} ellipsizeMode="tail" style={styles.actionText}>
                        Billeder
                      </Text>
                    </TouchableOpacity>

                    {(amAdmin || activeEvent.created_by === userId) && (
                      <TouchableOpacity
                        style={[styles.actionBtn, hasPushed ? styles.grayBtn : styles.blackBtn]}
                        onPress={handleSendPush}
                        disabled={sendingPush || hasPushed}
                      >
                        <Text numberOfLines={1} ellipsizeMode="tail" style={styles.actionText}>
                          {sendingPush ? "Sender…" : hasPushed ? "Push sendt" : "Send push"}
                        </Text>
                      </TouchableOpacity>
                    )}

                    {canEditEvent(activeEvent) && (
                      <TouchableOpacity
                        style={[styles.actionBtn, styles.blackBtn]}
                        onPress={() => openEdit(activeEvent)}
                      >
                        <Text numberOfLines={1} ellipsizeMode="tail" style={styles.actionText}>
                          Rediger
                        </Text>
                      </TouchableOpacity>
                    )}

                    {canDeleteEvent(activeEvent) && (
                      <TouchableOpacity
                        style={[styles.actionBtn, styles.deleteBtn]}
                        onPress={() => deleteEvent(activeEvent)}
                      >
                        <Text numberOfLines={1} ellipsizeMode="tail" style={styles.actionText}>
                          Slet
                        </Text>
                      </TouchableOpacity>
                    )}
                  </View>

                  {/* Lille push-statistik under knapperne */}
                  {pushStats && (
                    <Text style={[styles.sectionMuted, { marginBottom: 10 }]}>
                      🔔 Push sendes til {pushStats.active_push_members} ud af {pushStats.total_members} medlemmer
                    </Text>
                  )}
                </ScrollView>
              ) : (
                <ScrollView>
                  <TextInput
                    style={styles.input}
                    value={editTitle}
                    onChangeText={setEditTitle}
                    placeholder="Overskrift *"
                    placeholderTextColor="#9aa0a6"
                  />
                  <TextInput
                    style={[styles.input, styles.inputMultiline]}
                    value={editDescription}
                    onChangeText={setEditDescription}
                    placeholder="Beskrivelse"
                    placeholderTextColor="#9aa0a6"
                    multiline
                  />
                  <TextInput
                    style={styles.input}
                    value={editLocation}
                    onChangeText={setEditLocation}
                    placeholder="Sted"
                    placeholderTextColor="#9aa0a6"
                  />

                  <TouchableOpacity onPress={() => openPicker("edit", "start", "date")} style={styles.pickerBtn}>
                    <Text style={styles.pickerLabel}>Startdato *</Text>
                    <Text style={styles.pickerValue}>{editStart ? fmtDate(editStart) : "Vælg dato"}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => openPicker("edit", "start", "time")} style={[styles.smallBtn, styles.blackBtn, { marginTop: 6 }]}>
                    <Text style={styles.smallBtnText}>
                      {editStart ? `Vælg starttid (nu: ${fmtTime(editStart)})` : "Vælg starttid"}
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity onPress={() => openPicker("edit", "end", "date")} style={styles.pickerBtn}>
                    <Text style={styles.pickerLabel}>Slutdato *</Text>
                    <Text style={styles.pickerValue}>{editEnd ? fmtDate(editEnd) : "Vælg dato"}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => openPicker("edit", "end", "time")} style={[styles.smallBtn, styles.blackBtn, { marginTop: 6 }]}>
                    <Text style={styles.smallBtnText}>
                      {editEnd ? `Vælg sluttid (nu: ${fmtTime(editEnd)})` : "Vælg sluttid"}
                    </Text>
                  </TouchableOpacity>

                  <View style={{ flexDirection: "row", gap: 8, marginTop: 8 }}>
                    <TextInput
                      style={[styles.input, { flex: 1 }]}
                      value={editPrice}
                      onChangeText={setEditPrice}
                      placeholder="Pris (DKK)"
                      placeholderTextColor="#9aa0a6"
                      keyboardType="numeric"
                    />
                    <TextInput
                      style={[styles.input, { flex: 1 }]}
                      value={editCapacity}
                      onChangeText={setEditCapacity}
                      placeholder="Kapacitet (antal)"
                      placeholderTextColor="#9aa0a6"
                      keyboardType="numeric"
                    />
                  </View>

                  <View style={styles.toggleRow}>
                    <Text style={styles.toggleLabel}>Tillad tilmelding</Text>
                    <Switch value={editAllowRegistration} onValueChange={setEditAllowRegistration} />
                  </View>

                  {/* Ens brede knapper i én kolonne */}
                  <View style={styles.buttonsRow}>
                    <TouchableOpacity
                      style={[styles.actionBtn, styles.blackBtn, editSaving && { opacity: 0.7 }]}
                      onPress={saveEdit}
                      disabled={editSaving}
                    >
                      <Text numberOfLines={1} style={styles.actionText}>
                        {editSaving ? "Gemmer…" : "Gem"}
                      </Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={[styles.actionBtn, styles.grayBtn]}
                      onPress={() => setEditMode(false)}
                      disabled={editSaving}
                    >
                      <Text numberOfLines={1} style={styles.actionText}>
                        Annullér
                      </Text>
                    </TouchableOpacity>
                  </View>
                </ScrollView>
              )
            ) : (
              <Text style={styles.sectionMuted}>Indlæser…</Text>
            )}
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Fælles picker-modal */}
      <Modal visible={pickerVisible} transparent animationType="fade" onRequestClose={cancelPicker}>
        <View style={styles.pickerBackdrop}>
          <View style={styles.pickerCard}>
            <Text style={styles.pickerTitle}>
              {pickerMode === "date" ? "Vælg dato" : "Vælg tidspunkt"}
            </Text>

            <View style={styles.pickerInner}>
              <DateTimePicker
                value={pickerTemp}
                mode={pickerMode}
                display={
                  Platform.OS === "ios"
                    ? (pickerMode === "date" ? "inline" : "spinner")
                    : (pickerMode === "date" ? "calendar" : "spinner")
                }
                onChange={onNativePick}
                locale={Platform.OS === "ios" ? LOCALE : undefined}
                themeVariant="light"
              />
            </View>

            <View style={styles.pickerActions}>
              <TouchableOpacity onPress={cancelPicker} style={[styles.pActionBtn, styles.grayBtn]}>
                <Text style={styles.pActionText}>Annullér</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={applyPicker} style={[styles.pActionBtn, styles.blackBtn]}>
                <Text style={styles.pActionText}>OK</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

/* ---------- Styles ---------- */
const styles = StyleSheet.create({
  mainContainer: { flex: 1, backgroundColor: "#7C8996" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#7C8996" },

  topBar: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 14,
    paddingTop: 42,
    paddingBottom: 8,
    alignItems: "center",
  },
  backBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#131921",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 3,
    borderColor: "#ffffff",
  },
  backBtnText: { color: "#fff", fontWeight: "800", fontSize: 15, lineHeight: 15 },

  section: {
    marginTop: 12,
    marginHorizontal: 14,
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: "#eef1f4",
  },
  rowBg: {
    backgroundColor: "#7c89961a",
    borderWidth: 1,
    borderColor: "#7c89968a",
  },

  sectionBox: {
    backgroundColor: "#FFFFFF",
    borderRadius: 10,
    padding: 10,
    borderWidth: 1,
    borderColor: "#eef1f4",
  },
  sectionTitle: { fontSize: 11, fontWeight: "900", color: "#131921" },
  sectionMuted: { marginTop: 4, color: "#000", fontSize: 11, opacity: 0.7 },

  createToggleBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  toggleOn: { backgroundColor: "#e9edf1" },
  toggleOff: { backgroundColor: "#131921" },
  createToggleText: { color: "#fff", fontWeight: "800", fontSize: 13 },
  createToggleIcon: { color: "#fff", fontSize: 14, fontWeight: "900" },

  input: {
    backgroundColor: "#fff",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#e5e8ec",
    paddingHorizontal: 10,
    paddingVertical: 8,
    color: "#000",
    marginTop: 6,
    fontSize: 13,
  },
  inputMultiline: { minHeight: 68, textAlignVertical: "top" },

  pickerBtn: {
    marginTop: 6,
    borderWidth: 1,
    borderColor: "#e5e8ec",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 10,
    backgroundColor: "#fff",
  },
  pickerLabel: { fontSize: 10, fontWeight: "800", color: "#131921", marginBottom: 2 },
  pickerValue: { fontSize: 13, color: "#000" },

  toggleRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 8 },
  toggleLabel: { fontSize: 12, color: "#000", fontWeight: "700" },

  smallBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    alignSelf: "flex-start",
  },
  smallBtnText: { color: "#fff", fontWeight: "800", fontSize: 12 },
  blackBtn: { backgroundColor: "#131921" },
  grayBtn: { backgroundColor: "#9aa0a6" },

  createBtn: {
    marginTop: 10,
    backgroundColor: "#131921",
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: "center",
  },
  createBtnText: { color: "#fff", fontSize: 13, fontWeight: "800" },

  rowTitle: { fontSize: 11.5, fontWeight: "800", color: "#131921" },
  rowMeta: { fontSize: 10, color: "#000", opacity: 0.85, marginTop: 2 },

  iconDeleteBtn: {
    position: "absolute",
    right: 22,
    top: 18,
    backgroundColor: "#000",
    borderRadius: 8,
    width: 30,
    height: 26,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#000",
  },
  iconDeleteText: { color: "#fff", fontWeight: "900", fontSize: 13, lineHeight: 13 },

  cardImage: { width: "100%", height: 140, borderRadius: 10, marginBottom: 8, backgroundColor: "#f1f1f1" },
  imagePreview: { width: "100%", height: 160, borderRadius: 10, backgroundColor: "#f1f1f1", marginTop: 6 },

  modalBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.90)", alignItems: "center", justifyContent: "center", padding: 18 },
  modalCard: { height: "90%", width: "100%", maxWidth: 560, backgroundColor: "#FFFFFF", borderRadius: 12, padding: 12, borderWidth: 1, borderColor: "#eef1f4" },
  modalHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 4 },
  modalTitle: { fontSize: 12, fontWeight: "900", color: "#131921" },
  modalClose: { fontSize: 18, fontWeight: "900", color: "#131921" },

  detailImage: { width: "100%", height: 220, borderRadius: 12, backgroundColor: "#f1f1f1", marginBottom: 8 },
  detailTitle: { fontSize: 14, fontWeight: "900", color: "#131921" },
  detailRange: { fontSize: 11, color: "#000", opacity: 0.85, marginTop: 2 },
  detailMeta: { fontSize: 11, color: "#000", opacity: 0.85, marginTop: 2 },

  // Ens brede knapper i én kolonne
  buttonsRow: {
    flexDirection: "column",
    alignItems: "stretch",
    gap: 8,
    marginTop: 12,
    marginBottom: 6,
  },
  actionBtn: {
    width: "100%",
    height: 52,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 12,
  },
  actionText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "800",
  },
  deleteBtn: { backgroundColor: "#C62828" },

  regHeaderRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  attRow: {
    flexDirection: "row", alignItems: "center", paddingVertical: 6,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: "#e9edf1",
  },
  attAvatar: { width: 34, height: 34, borderRadius: 17, marginRight: 10 },
  attName: { fontSize: 12, fontWeight: "800", color: "#131921" },
  attEmail: { fontSize: 11, color: "#000", opacity: 0.75 },

  groupCard: {
    marginTop: 12, marginHorizontal: 14, backgroundColor: "#FFFFFF",
    borderRadius: 14, paddingBottom: 6, borderWidth: 1, borderColor: "#eef1f4",
  },
  groupHeader: {
    backgroundColor: "#131921", borderTopLeftRadius: 14, borderTopRightRadius: 14,
    paddingVertical: 8, paddingHorizontal: 12,
  },
  groupHeaderText: { color: "#fff", fontWeight: "900", fontSize: 12 },

  /* Picker-modal */
  pickerBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    alignItems: "center",
    justifyContent: "center",
    padding: 18,
  },
  pickerCard: {
    width: "100%",
    maxWidth: 520,
    borderRadius: 14,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#e9edf1",
    padding: 12,
  },
  pickerTitle: { fontSize: 14, fontWeight: "900", color: "#131921", marginBottom: 8, textAlign: "center" },
  pickerInner: { alignItems: "center", justifyContent: "center", paddingVertical: 8 },
  pickerActions: { marginTop: 8, flexDirection: "row", justifyContent: "flex-end", gap: 8 },
  pActionBtn: { borderRadius: 8, paddingVertical: 10, paddingHorizontal: 14 },
  pActionText: { color: "#fff", fontWeight: "800" },
});