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
  RefreshControl,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from "react-native";
import { useSession } from "../../../hooks/useSession";
import { supabase } from "../../../utils/supabase";

/* ---------- Tema (matcher de andre sider) ---------- */
const COLORS = {
  bg: "#869FB9",
  text: "#131921",
  white: "#fff",
  gray: "#9aa0a6",
  line: "#eef1f4",
  cardBg: "#FFFFFF",
  dark: "#131921",
};
const RADII = { sm: 10, md: 14, lg: 18, xl: 22 };

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
    : `${fmtDate(s)} kl. ${fmtTime(s)} – ${fmtDate(e)} kl. ${fmtTime(e)}`;
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

/** Komprimer og nedskaler billede til max 1200 px bredde og ~50% kvalitet. */
async function compressImage(uri: string, maxBytes = 2 * 1024 * 1024) {
  let quality = 0.5;
  let out = await ImageManipulator.manipulateAsync(
    uri,
    [{ resize: { width: 1200 } }],
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

/* ---------- Række-komponent ---------- */
const EventListRow = React.memo(function EventListRow({
  e,
  count,
  deleting,
  onOpen,
  onDelete,
  canDelete,
  grid = false,
}: {
  e: EventRow;
  count: number;
  deleting: boolean;
  onOpen: (ev: EventRow) => void;
  onDelete: (ev: EventRow) => void;
  canDelete: boolean;
  grid?: boolean; // tablet grid
}) {
  return (
    <TouchableOpacity
      activeOpacity={0.9}
      onPress={() => onOpen(e)}
      style={[styles.card, styles.rowCard, grid && styles.rowCardGrid]}
    >
      {e.image_url ? (
        <Image
          source={{ uri: e.image_url }}
          style={[styles.cardImage, grid && styles.cardImageGrid]}
        />
      ) : null}

      <Text style={styles.rowTitle} numberOfLines={2}>{e.title}</Text>

      <View style={styles.rowDivider} />

      <View style={styles.rowChipsWrap}>
        <Text style={styles.metaChip}>{fmtRange(e.start_at, e.end_at)}</Text>
        {!!e.location && <Text style={styles.metaChip}>📍 {e.location}</Text>}
        {!!e.price && <Text style={styles.metaChip}>Pris: {e.price} kr.</Text>}
        {e.allow_registration ? (
          <Text style={styles.metaChip}>
            {e.capacity ? `${count} / ${e.capacity} tilmeldt` : `${count} tilmeldt`}
          </Text>
        ) : null}
      </View>

      {canDelete && (
        <TouchableOpacity
          onPress={() => onDelete(e)}
          style={styles.iconDeleteBtn}
          disabled={deleting}
          hitSlop={{ top: 2, bottom: 12, left: 12, right: 2 }}
        >
          <Text style={styles.iconDeleteText}>{deleting ? "…" : "✕"}</Text>
        </TouchableOpacity>
      )}
    </TouchableOpacity>
  );
});

/* ======================================================================= */

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

  // Søgning
  const [query, setQuery] = useState("");

  // Pull-to-refresh
  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = async () => {
    setRefreshing(true);
    await fetchEvents();
    await fetchCountsForEvents(events.map((e) => e.id));
    setRefreshing(false);
  };

  // Medlemsstatus
  const myRow = useMemo(
    () => members.find((m) => m.user_id === userId) || null,
    [members, userId]
  );
  const amAdmin = !!myRow && isAdmin(myRow, ownerId);
  const isApprovedMember = (myRow?.status ?? null) === "approved";

  /* ---------- Tablet vs. mobil ---------- */
  const { width, height } = useWindowDimensions();
  const isTablet =
    (Platform.OS === "ios" && (Platform as any)?.isPad) || Math.min(width, height) >= 768;

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

/* ---------- Antal tilmeldte pr. event (enkeltkilde) ---------- */
const fetchCountsForEvents = async (eventIds: string[]) => {
  if (!eventIds.length) return;

  const next: Record<string, number> = { ...regCounts };

  for (const evId of eventIds) {
    const { count, error } = await supabase
      .from(REG_TABLE)
      .select("event_id", { count: "exact", head: true })
      .eq("event_id", evId);

    if (error) {
      console.error("Count failed for", evId, error.message);
      continue;
    }
    next[evId] = count ?? 0;
  }

  setRegCounts(next);
};

  // Hent counts når events ændrer sig
  useEffect(() => {
    fetchCountsForEvents(events.map((e) => e.id));
  }, [events]);

/* ---------- Hent deltagere til modal (kun den rigtige tabel) ---------- */
const fetchAttendees = async (eventId: string) => {
  try {
    setLoadingAtt(true);

    const { data: regs, error } = await supabase
      .from(REG_TABLE)
      .select("user_id, created_at")
      .eq("event_id", eventId)
      .order("created_at", { ascending: true });

    if (error) throw error;

    const ids = [...new Set((regs ?? []).map(r => r.user_id))];
    if (ids.length === 0) {
      setAttendees([]);
      return;
    }

    const { data: users, error: uErr } = await supabase
      .from("users")
      .select("id, name, username, email, avatar_url")
      .in("id", ids);

    if (uErr) throw uErr;

    const byId = new Map((users ?? []).map((u: any) => [u.id, u]));
    const withUsers: RegRow[] = (regs ?? []).map(r => ({
      user_id: r.user_id,
      created_at: r.created_at,
      users: byId.get(r.user_id) ?? null,
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
  if (sendingPush) return; // ekstra guard
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
        onPress: async () => {
          try {
            setSendingPush(true);

            const title = activeEvent.title || "Ny aktivitet";
            const body = activeEvent.location
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
              const code = (error as any)?.code?.toString().toLowerCase?.() ?? "";
              const msg = (error.message || "").toLowerCase();
              if (code.includes("already_sent") || msg.includes("already_sent")) {
                setHasPushed(true);
                Alert.alert("Allerede sendt", "Push er allerede udsendt for denne aktivitet.");
                return;
              }
              throw error;
            }

            setHasPushed(true);
            const count = typeof data === "number" ? data : 0;
            Alert.alert("Besked på vej ✅", `Udsendt til ${count} medlem(mer).`);

            await refreshHasPushed(activeEvent);
            await fetchPushStats(activeEvent.forening_id);
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

    const { error } = await supabase
      .from(REG_TABLE) // "forening_event_registrations"
      .insert([{ event_id: activeEvent.id, user_id: userId }]);

    if (error && !/duplicate|23505/i.test(String(error.message))) {
      throw error;
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

    const { error } = await supabase
      .from(REG_TABLE)
      .delete()
      .eq("event_id", activeEvent.id)
      .eq("user_id", userId);

    if (error) throw error;

    await fetchAttendees(activeEvent.id);
    await fetchCountsForEvents([activeEvent.id]);
  } catch (e: any) {
    Alert.alert("Fejl", e?.message ?? "Kunne ikke framelde dig.");
  } finally {
    setLeaving(false);
  }
};

  /* ---------- Afledte lister + filtrering ---------- */
  const now = new Date();
  const upcomingEvents = useMemo(() => {
    const list = events
      .filter((e) => new Date(e.end_at).getTime() >= now.getTime())
      .sort((a, b) => new Date(a.start_at).getTime() - new Date(b.start_at).getTime());
    if (!query.trim()) return list;
    const q = query.trim().toLowerCase();
    return list.filter((e) =>
      (e.title || "").toLowerCase().includes(q) ||
      (e.description || "").toLowerCase().includes(q) ||
      (e.location || "").toLowerCase().includes(q)
    );
  }, [events, now, query]);

  const pastEvents = useMemo(() => {
    const list = events
      .filter((e) => new Date(e.end_at).getTime() < now.getTime())
      .sort((a, b) => new Date(b.end_at).getTime() - new Date(a.end_at).getTime());
    if (!query.trim()) return list;
    const q = query.trim().toLowerCase();
    return list.filter((e) =>
      (e.title || "").toLowerCase().includes(q) ||
      (e.description || "").toLowerCase().includes(q) ||
      (e.location || "").toLowerCase().includes(q)
    );
  }, [events, now, query]);

  /* ---------- Header (topbar + søg + opret) ---------- */
  const Header = (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined}>
      {/* Topbar */}
      <View style={styles.topBar}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backBtnText}>‹</Text>
        </TouchableOpacity>
        <View style={{ width: 34 }} />
      </View>

      {/* Kontrolkort: søg + opret */}
      <View style={[styles.card, { marginTop: 6 }]}>
        <View style={styles.searchRow}>
          <View style={{ flex: 1 }}>
            <TextInput
              style={styles.searchInput}
              value={query}
              onChangeText={setQuery}
              placeholder="Søg i aktiviteter…"
              placeholderTextColor="#a1a9b6"
              returnKeyType="search"
            />
          </View>
          <TouchableOpacity
            onPress={() => setShowCreateForm((s) => !s)}
            activeOpacity={0.9}
            style={[styles.addBtn, showCreateForm && { backgroundColor: COLORS.gray }]}
          >
            <Text style={styles.addBtnText}>{showCreateForm ? "–" : "+"}</Text>
          </TouchableOpacity>
        </View>

        {showCreateForm && (
          <View style={{ marginTop: 12 }}>
            <Text style={styles.formTitle}>OPRET AKTIVITET</Text>

            <TextInput
              style={styles.input}
              value={title}
              onChangeText={setTitle}
              placeholder="Overskrift *"
              placeholderTextColor={COLORS.gray}
            />
            <TextInput
              style={[styles.input, styles.inputMultiline]}
              value={description}
              onChangeText={setDescription}
              placeholder="Beskrivelse"
              placeholderTextColor={COLORS.gray}
              multiline
            />
            <TextInput
              style={styles.input}
              value={location}
              onChangeText={setLocation}
              placeholder="Sted (adresse/område)"
              placeholderTextColor={COLORS.gray}
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

            <View style={{ flexDirection: "row", gap: 10, marginTop: 10 }}>
              <TextInput
                style={[styles.input, { flex: 1 }]}
                value={price}
                onChangeText={setPrice}
                placeholder="Pris (DKK)"
                placeholderTextColor={COLORS.gray}
                keyboardType="numeric"
              />
              <TextInput
                style={[styles.input, { flex: 1 }]}
                value={capacity}
                onChangeText={setCapacity}
                placeholder="Kapacitet (antal)"
                placeholderTextColor={COLORS.gray}
                keyboardType="numeric"
              />
            </View>

            {/* Billede */}
            {imagePreview ? (
              <View style={{ marginTop: 10 }}>
                <Image source={{ uri: imagePreview }} style={styles.imagePreview} />
                <TouchableOpacity
                  onPress={() => { setImagePreview(null); setImageBase64(null); }}
                  style={[styles.smallBtn, styles.grayBtn, { marginTop: 8 }]}
                >
                  <Text style={styles.smallBtnText}>Fjern billede</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <TouchableOpacity
                onPress={pickImage}
                style={[styles.smallBtn, styles.blackBtn, { alignSelf: "flex-start", marginTop: 10 }]}
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
  const renderEventCard = (e: EventRow, grid: boolean) => {
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
        grid={grid}
      />
    );
  };

  // TABLET: Sektioner under hinanden (ikke side-om-side)
  const TabletSections = (
    <View style={{ paddingBottom: 24 }}>
      {/* KOMMENDE */}
      <View style={styles.groupCard}>
        <View style={styles.groupHeader}>
          <Text style={styles.groupHeaderText}>KOMMENDE AKTIVITETER</Text>
        </View>
        {upcomingEvents.length === 0 ? (
          <Text style={[styles.sectionMuted, { margin: 14 }]}>
            Ingen kommende aktiviteter.
          </Text>
        ) : (
          <View style={styles.gridWrap}>
            {upcomingEvents.map((e) => renderEventCard(e, true))}
          </View>
        )}
      </View>

      {/* AFSLUTTEDE */}
      <View style={styles.groupCard}>
        <View style={styles.groupHeader}>
          <Text style={styles.groupHeaderText}>AFSLUTTEDE AKTIVITETER</Text>
        </View>
        {pastEvents.length === 0 ? (
          <Text style={[styles.sectionMuted, { margin: 14 }]}>
            Ingen afsluttede aktiviteter.
          </Text>
        ) : (
          <View style={styles.gridWrap}>
            {pastEvents.map((e) => renderEventCard(e, true))}
          </View>
        )}
      </View>
    </View>
  );

  const MobileSections = (
    <View>
      {/* KOMMENDE */}
      <View style={styles.groupCard}>
        <View style={styles.groupHeader}>
          <Text style={styles.groupHeaderText}>KOMMENDE AKTIVITETER</Text>
        </View>
        {upcomingEvents.length === 0 ? (
          <Text style={[styles.sectionMuted, { margin: 14 }]}>Ingen kommende aktiviteter.</Text>
        ) : (
          upcomingEvents.map((e) => renderEventCard(e, false))
        )}
      </View>

      {/* AFSLUTTEDE */}
      <View style={styles.groupCard}>
        <View style={styles.groupHeader}>
          <Text style={styles.groupHeaderText}>AFSLUTTEDE AKTIVITETER</Text>
        </View>
        {pastEvents.length === 0 ? (
          <Text style={[styles.sectionMuted, { margin: 14 }]}>Ingen afsluttede aktiviteter.</Text>
        ) : (
          pastEvents.map((e) => renderEventCard(e, false))
        )}
      </View>
    </View>
  );

  return (
    <View style={styles.mainContainer}>
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={COLORS.text} />
        </View>
      ) : isTablet ? (
        // TABLET: ScrollView + grid-kort inden for hver sektion
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ paddingBottom: 24 }}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.text} />
          }
        >
          {Header}
          {TabletSections}
        </ScrollView>
      ) : (
        // MOBIL: FlatList én kolonne
        <FlatList
          data={[{ key: "content" }]}
          keyExtractor={(i) => i.key}
          ListHeaderComponent={Header}
          renderItem={null as any}
          ListFooterComponent={MobileSections}
          ItemSeparatorComponent={() => (
            <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: "#e9edf1" }} />
          )}
          contentContainerStyle={{ paddingBottom: 24 }}
          keyboardShouldPersistTaps="handled"
          removeClippedSubviews
          windowSize={10}
          maxToRenderPerBatch={6}
          initialNumToRender={6}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.text} />
          }
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
          style={[
            styles.modalBackdropCommon,
            isTablet ? styles.modalBackdropTablet : styles.modalBackdropMobile,
          ]}
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          keyboardVerticalOffset={Platform.OS === "ios" ? 64 : 0}
        >
          <View
            style={[
              styles.modalCardCommon,
              isTablet ? styles.modalCardTablet : styles.modalCardMobile,
            ]}
          >
            {/* Header med afrundede nederste hjørner */}
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{editMode ? "Rediger aktivitet" : "Aktivitet"}</Text>
              <TouchableOpacity
                onPress={() => { setEditMode(false); setShowEventModal(false); }}
                style={styles.modalCloseBtn}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <Text style={styles.modalCloseText}>✕</Text>
              </TouchableOpacity>
            </View>

            {activeEvent ? (
              !editMode ? (
                <ScrollView>
                  {activeEvent.image_url ? (
                    <Image
                      source={{ uri: activeEvent.image_url }}
                      style={[
                        styles.detailImageCommon,
                        isTablet ? styles.detailImageTablet : styles.detailImageMobile,
                      ]}
                    />
                  ) : null}

                  <Text style={styles.detailTitle}>{activeEvent.title}</Text>

                  {/* Chips-række med luft ned til brødtekst */}
                  <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 1, marginBottom: 12 }}>
                    <Text style={styles.detailRange}>{fmtRange(activeEvent.start_at, activeEvent.end_at)}</Text>
                    {!!activeEvent.location && <Text style={styles.detailMeta}>📍 {activeEvent.location}</Text>}
                    {!!activeEvent.capacity && <Text style={styles.detailMeta}>Kapacitet: {activeEvent.capacity}</Text>}
                    {!!activeEvent.price && <Text style={styles.detailMeta}>Pris: {activeEvent.price} kr.</Text>}
                  </View>

                  {!!activeEvent.description && (
                    <Text style={styles.detailBody}>{activeEvent.description}</Text>
                  )}

                  {/* Tilmelding */}
                  {activeEvent.allow_registration ? (
                    <View style={[styles.sectionBox, styles.regBox, { marginTop: 12 }]}>
                      <View style={styles.regHeaderRow}>
                        <Text style={styles.sectionTitle}>TILMELDINGER</Text>
                        <Text style={styles.sectionMuted}>
                          {attendees.length}
                          {activeEvent.capacity ? ` / ${activeEvent.capacity}` : ""} tilmeldt
                        </Text>
                      </View>

                      {isApprovedMember ? (
                        <View style={{ flexDirection: "row", gap: 8, marginTop: 8 }}>
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
                        <Text style={[styles.sectionMuted, { marginTop: 8 }]}>
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
                                  <Text style={{ color: COLORS.text, fontWeight: "900" }}>
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

                  {/* Ens brede knapper i én kolonne */}
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
                  <Text style={styles.formTitle}>REDIGÉR</Text>

                  <TextInput
                    style={styles.input}
                    value={editTitle}
                    onChangeText={setEditTitle}
                    placeholder="Overskrift *"
                    placeholderTextColor={COLORS.gray}
                  />
                  <TextInput
                    style={[styles.input, styles.inputMultiline]}
                    value={editDescription}
                    onChangeText={setEditDescription}
                    placeholder="Beskrivelse"
                    placeholderTextColor={COLORS.gray}
                    multiline
                  />
                  <TextInput
                    style={styles.input}
                    value={editLocation}
                    onChangeText={setEditLocation}
                    placeholder="Sted"
                    placeholderTextColor={COLORS.gray}
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

                  <View style={{ flexDirection: "row", gap: 10, marginTop: 10 }}>
                    <TextInput
                      style={[styles.input, { flex: 1 }]}
                      value={editPrice}
                      onChangeText={setEditPrice}
                      placeholder="Pris (DKK)"
                      placeholderTextColor={COLORS.gray}
                      keyboardType="numeric"
                    />
                    <TextInput
                      style={[styles.input, { flex: 1 }]}
                      value={editCapacity}
                      onChangeText={setEditCapacity}
                      placeholder="Kapacitet (antal)"
                      placeholderTextColor={COLORS.gray}
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
        <View
          style={[
            styles.pickerBackdropCommon,
            isTablet ? styles.pickerBackdropTablet : styles.pickerBackdropMobile,
          ]}
        >
          <View
            style={[
              styles.pickerCardCommon,
              isTablet ? styles.pickerCardTablet : styles.pickerCardMobile,
            ]}
          >
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
  mainContainer: { flex: 1, backgroundColor: COLORS.bg },
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: COLORS.bg },

  /* Topbar */
  topBar: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingTop: 42,
    paddingBottom: 8,
    alignItems: "center",
  },
  backBtn: {
    width: 38, height: 38, borderRadius: 999, backgroundColor: COLORS.text,
    alignItems: "center", justifyContent: "center",
  },
  backBtnText: { color: "#fff", fontWeight: "900", fontSize: 30, lineHeight: 30 },

  /* Generiske kort */
  card: {
    marginHorizontal: 16,
    backgroundColor: COLORS.cardBg,
    borderRadius: RADII.xl,
    paddingHorizontal: 14,
    paddingTop: 14,
    paddingBottom: 16,
    borderWidth: 0,
    borderColor: COLORS.line,
  },

  /* Søg + opret */
  searchRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  searchInput: {
    height: 48,
    backgroundColor: COLORS.white,
    borderRadius: RADII.xl,
    paddingHorizontal: 14,
    fontSize: 16,
    color: "#222",
    borderWidth: 6,
    borderColor: "#e5e8ec",
  },
  addBtn: {
    height: 48, width: 48, borderRadius: RADII.xl, backgroundColor: COLORS.text,
    alignItems: "center", justifyContent: "center",
  },
  addBtnText: { color: "#fff", fontSize: 26, fontWeight: "900", lineHeight: 26 },

  formTitle: {
    alignSelf: "flex-start",
    backgroundColor: COLORS.dark,
    color: "#fff",
    fontSize: 14, fontWeight: "900",
    paddingVertical: 6, paddingHorizontal: 12,
    borderRadius: 16, letterSpacing: 0.2, marginBottom: 6,
  },

  /* Input felter */
  input: {
    backgroundColor: "#fff",
    borderRadius: RADII.xl,
    borderWidth: 1, borderColor: "#e5e8ec",
    paddingHorizontal: 12, paddingVertical: 10,
    color: "#000", marginTop: 8, fontSize: 14,
  },
  inputMultiline: { minHeight: 84, textAlignVertical: "top" },

  pickerBtn: {
    marginTop: 8, borderWidth: 1, borderColor: "#e5e8ec",
    borderRadius: RADII.xl, paddingHorizontal: 12, paddingVertical: 12,
    backgroundColor: "#fff",
  },
  pickerLabel: { fontSize: 12, fontWeight: "800", color: COLORS.text, marginBottom: 4 },
  pickerValue: { fontSize: 14, color: "#000" },

  toggleRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 10 },
  toggleLabel: { fontSize: 14, color: "#000", fontWeight: "700" },

  smallBtn: {
    paddingHorizontal: 14, paddingVertical: 9, borderRadius: RADII.xl, alignSelf: "flex-start",
  },
  smallBtnText: { color: "#fff", fontWeight: "800", fontSize: 13 },
  blackBtn: { backgroundColor: COLORS.text },
  grayBtn: { backgroundColor: COLORS.gray },

  createBtn: {
    marginTop: 12, backgroundColor: COLORS.text, borderRadius: 999,
    paddingVertical: 14, alignItems: "center",
  },
  createBtnText: { color: "#fff", fontSize: 15, fontWeight: "900" },

  /* Række-kort (event-kort i lister) */
  rowCard: {
    marginHorizontal: 16,
    marginTop: 14,
    backgroundColor: "#7c899614",
    borderWidth: 6, borderColor: "#7c899631",
    position: "relative", borderRadius: RADII.xl,
    paddingHorizontal: 14, paddingTop: 14, paddingBottom: 14,
  },

  // Tablet-grid: lidt bredere kort så højre side matcher venstre
  rowCardGrid: {
    flexBasis: "49%",
    maxWidth: "49%",
    marginHorizontal: 0,
    marginTop: 0,
    minWidth: 0,
  },

  /* Titel */
  rowTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: COLORS.text,
    marginTop: 10,
    marginBottom: 10,
    marginLeft: 4,
  },

  rowDivider: { height: StyleSheet.hairlineWidth, backgroundColor: "#e9edf1", marginBottom: 10 },

  /* Info-bokse */
  rowChipsWrap: { flexDirection: "row", flexWrap: "wrap", gap: 1 },
  metaChip: {
    fontSize: 14, color: "#000000ff", backgroundColor: "#7c899631",
    borderRadius: 999, paddingHorizontal: 12, paddingVertical: 8, borderWidth: 0,
    overflow: "hidden", alignSelf: "flex-start",
  },

  rowMeta: {
    fontSize: 14, color: "#fff", backgroundColor: "#7c89968a",
    borderRadius: 999, paddingHorizontal: 12, paddingVertical: 8,
    overflow: "hidden", alignSelf: "flex-start", marginTop: 6,
  },

  iconDeleteBtn: {
    position: "absolute", right: 0, top: 0, backgroundColor: "#000",
    borderRadius: 999, width: 40, height: 40, alignItems: "center", justifyContent: "center",
    borderWidth: 1, borderColor: "#000",
  },
  iconDeleteText: { color: "#fff", fontWeight: "900", fontSize: 15, lineHeight: 15 },

  cardImage: {
    width: "100%", height: 250, borderRadius: RADII.xl,
    marginBottom: 12, backgroundColor: "#f1f1f1",
  },
  cardImageGrid: { height: 400 },

  imagePreview: {
    width: "100%", height: 170, borderRadius: RADII.xl,
    backgroundColor: "#f1f1f1", marginTop: 6,
  },

  /* Sektioner (grupper) */
  groupCard: {
    marginTop: 10,
    marginHorizontal: 16,
    backgroundColor: COLORS.cardBg,
    borderRadius: RADII.xl,
    paddingBottom: 16,
    borderWidth: 1,
    borderColor: COLORS.line,
  },

  groupHeader: {
    paddingTop: 16,
    paddingBottom: 6,
    paddingHorizontal: 14,
  },
  groupHeaderText: {
    alignSelf: "flex-start",
    backgroundColor: COLORS.dark,
    color: "#fff",
    fontWeight: "900",
    fontSize: 16,
    paddingVertical: 6,
    paddingHorizontal: 14,
    borderRadius: 999,
    letterSpacing: 0.2,
  },

  // Grid-container (tablet): sidepadding = 14, mellemrum = 14
  gridWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    paddingHorizontal: 14,
    gap: 14,
    paddingTop: 10,
    justifyContent: "flex-start",
    alignItems: "stretch",
  },

  twoColWrap: { flexDirection: "row", alignItems: "flex-start", gap: 16, paddingHorizontal: 16 },

  col: { flex: 1, marginHorizontal: 0, minWidth: 0 },

  sectionBox: {
    backgroundColor: COLORS.cardBg, borderRadius: RADII.xl, padding: 12,
    borderWidth: 1, borderColor: COLORS.line,
  },

  // 🔲 SÆR-RAMME til "Tilmeldinger"
  regBox: {
    borderWidth: 3,
    borderStyle: "dashed",
    borderColor: "#000",
  },

  sectionTitle: { fontSize: 13, fontWeight: "900", color: COLORS.text },
  sectionMuted: { marginTop: 4, color: "#000", fontSize: 12, opacity: 0.7 },

  /* =================== MODAL =================== */
  modalBackdropCommon: {
    flex: 1, backgroundColor: "rgba(0, 0, 0, 1)", alignItems: "center", justifyContent: "center",
  },
  modalBackdropTablet: { padding: 24 },
  modalBackdropMobile: { padding: 12 },

  modalCardCommon: {
    height: "90%", width: "100%", backgroundColor: COLORS.cardBg,
    borderRadius: RADII.xl, padding: 14, borderWidth: 1, borderColor: COLORS.line,
  },
  modalCardTablet: { maxWidth: 640 },
  modalCardMobile: { maxWidth: undefined },

  modalHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 14, borderBottomLeftRadius: 40,
    borderBottomRightRadius: 40 },
  modalTitle: {
    fontSize: 16, fontWeight: "900", color: "#fff", backgroundColor: COLORS.dark,
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, overflow: "hidden",
    alignSelf: "flex-start",
  },
  modalCloseBtn: {
    width: 36, height: 36, borderRadius: 18, backgroundColor: "#000",
    alignItems: "center", justifyContent: "center",
  },
  modalCloseText: { color: "#fff", fontSize: 18, fontWeight: "900", lineHeight: 18 },

  detailImageCommon: {
    width: "100%", borderRadius: RADII.xl, backgroundColor: "#f1f1f1", marginBottom: 10, marginTop: 10
  },
  detailImageTablet: { height: 500 },
  detailImageMobile: { height: 350 },

  /* ⭐ TITEL UDEN SORT KASSE ⭐ */
  detailTitle: {
    fontSize: 18,
    fontWeight: "900",
    color: COLORS.text,
    backgroundColor: "transparent",
    paddingHorizontal: 0,
    paddingVertical: 0,
    borderRadius: 0,
    overflow: "visible",
    marginBottom: 30,
    marginTop: 10,
    alignSelf: "auto",
  },

  detailRange: {
    fontSize: 14, color: "#fff", backgroundColor: COLORS.dark,
    paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999,
    overflow: "hidden", alignSelf: "flex-start", marginBottom: 2,
  },
  detailMeta: {
    fontSize: 14, color: "#fff", backgroundColor: COLORS.dark,
    paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999,
    overflow: "hidden", alignSelf: "flex-start", marginTop: 6,
  },
  detailBody: { fontSize: 14, color: "#111", lineHeight: 20, marginTop: 14, marginBottom: 20, },

  buttonsRow: { flexDirection: "column", alignItems: "stretch", gap: 10, marginTop: 14, marginBottom: 8 },
  actionBtn: {
    width: "100%", height: 56, borderRadius: 999, alignItems: "center",
    justifyContent: "center", paddingHorizontal: 12,
  },
  actionText: { color: "#fff", fontSize: 16, fontWeight: "900" },
  deleteBtn: { backgroundColor: "#C62828" },

  regHeaderRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  attRow: {
    flexDirection: "row", alignItems: "center", paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: "#e9edf1",
  },
  attAvatar: { width: 36, height: 36, borderRadius: 999, marginRight: 12 },
  attName: { fontSize: 13, fontWeight: "900", color: COLORS.text },
  attEmail: { fontSize: 12, color: "#000", opacity: 0.75 },

  /* Picker-modal */
  pickerBackdropCommon: {
    flex: 1, backgroundColor: "rgba(0,0,0,0.45)", alignItems: "center", justifyContent: "center",
  },
  pickerBackdropTablet: { padding: 24 },
  pickerBackdropMobile: { padding: 12 },

  pickerCardCommon: {
    width: "100%", borderRadius: RADII.xl, backgroundColor: COLORS.white,
    borderWidth: 1, borderColor: "#e9edf1", padding: 12,
  },
  pickerCardTablet: { maxWidth: 520 },
  pickerCardMobile: { maxWidth: 420 },

  pickerTitle: {
    fontSize: 16, fontWeight: "900", color: "#fff", backgroundColor: COLORS.dark,
    paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999,
    overflow: "hidden", alignSelf: "center", marginBottom: 10,
  },
  pickerInner: { alignItems: "center", justifyContent: "center", paddingVertical: 8 },
  pickerActions: { marginTop: 8, flexDirection: "row", justifyContent: "flex-end", gap: 8 },
  pActionBtn: { borderRadius: RADII.xl, paddingVertical: 10, paddingHorizontal: 14 },
  pActionText: { color: "#fff", fontWeight: "900" },
});