// app/forening/[id].tsx
import { decode } from "base64-arraybuffer";
import * as ImageManipulator from "expo-image-manipulator";
import * as ImagePicker from "expo-image-picker";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
// Fjernet lucide-importen og bruger PNG-ikon
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Modal,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from "react-native";

import { useSession } from "../../hooks/useSession";
import { Forening } from "../../types/forening";
import { supabase } from "../../utils/supabase";

// HVIDT MEDLEMS-IKON (PNG)
const MembersIcon = require("../../assets/icons/members_white_24.png");

/* ---------- Typer ---------- */
type MedlemsRow = {
  user_id: string;
  rolle?: string | null;
  status?: "pending" | "approved" | "declined" | null;
  users?: {
    name?: string | null;
    username?: string | null;
    avatar_url?: string | null;
    email?: string | null;
  } | null;
};

type ThreadRow = {
  id: string;
  forening_id: string;
  title: string;
  created_at: string;
  created_by: string;
};

type EventRow = {
  id: string;
  title: string | null;
  start_at: string;
  end_at: string | null;
  location: string | null;
  price: number | null;
};

type EventFull = {
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

type EventImagePreview = {
  id: number;
  image_url: string;
  event_id: string;
  created_at?: string;
};

/* ---------- Helpers ---------- */
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

const resolveAvatarUrl = (maybePath?: string | null): string | null => {
  if (!maybePath) return null;
  if (/^https?:\/\//i.test(maybePath)) return maybePath;
  const path = maybePath.replace(/^\/+/, "");
  const { data } = supabase.storage.from("avatars").getPublicUrl(path);
  return data?.publicUrl || null;
};

function formatDateRange(startISO: string, endISO?: string | null) {
  const s = new Date(startISO);
  const e = endISO ? new Date(endISO) : null;
  const dkDate = (d: Date) =>
    d.toLocaleDateString("da-DK", { day: "2-digit", month: "2-digit", year: "numeric" });
  const dkTime = (d: Date) =>
    d.toLocaleTimeString("da-DK", { hour: "2-digit", minute: "2-digit" });
  if (!e) return `${dkDate(s)} kl. ${dkTime(s)}`;
  const same =
    s.getFullYear() === e.getFullYear() &&
    s.getMonth() === e.getMonth() &&
    s.getDate() === e.getDate();
  return same
    ? `${dkDate(s)} kl. ${dkTime(s)}–${dkTime(e)}`
    : `${dkDate(s)} ${dkTime(s)} – ${dkDate(e)} ${dkTime(e)}`;
}

/* ---------- Kalender utils ---------- */
const startOfMonth = (d: Date) => new Date(d.getFullYear(), d.getMonth(), 1);
const endOfMonth = (d: Date) => new Date(d.getFullYear(), d.getMonth() + 1, 0);
const pad = (n: number) => (n < 10 ? `0${n}` : `${n}`);
const toKey = (d: Date) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

const buildMonthGrid = (base: Date) => {
  const first = startOfMonth(base);
  const last = endOfMonth(base);
  const firstWeekday = (first.getDay() + 6) % 7;
  const daysInMonth = last.getDate();
  const cells: Date[] = [];
  for (let i = 0; i < firstWeekday; i++) {
    const d = new Date(first);
    d.setDate(first.getDate() - (firstWeekday - i));
    cells.push(d);
  }
  for (let d = 1; d <= daysInMonth; d++)
    cells.push(new Date(base.getFullYear(), base.getMonth(), d));
  while (cells.length < 42) {
    const lastCell = cells[cells.length - 1];
    const next = new Date(lastCell);
    next.setDate(lastCell.getDate() + 1);
    cells.push(next);
  }
  const weeks: Date[][] = [];
  for (let i = 0; i < 6; i++) weeks.push(cells.slice(i * 7, i * 7 + 7));
  return weeks;
};

/* ---------- Component ---------- */
export default function ForeningDetaljeScreen() {
  const params = useLocalSearchParams<{ id: string }>();
  const foreningId = Array.isArray(params.id) ? params.id[0] : params.id;

  const router = useRouter();
  const { session } = useSession();
  const userId = session?.user?.id ?? null;

  const [forening, setForening] = useState<Forening | null>(null);
  const [loading, setLoading] = useState(true);

  const [medlemmer, setMedlemmer] = useState<MedlemsRow[]>([]);
  const [antalApproved, setAntalApproved] = useState(0);

  const [uploading, setUploading] = useState(false);

  // Medlems-modal
  const [showMembers, setShowMembers] = useState(false);
  const [selectedMember, setSelectedMember] = useState<MedlemsRow | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  // Redigering (ejer)
  const [editMode, setEditMode] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editNavn, setEditNavn] = useState("");
  const [editSted, setEditSted] = useState("");
  const [editBeskrivelse, setEditBeskrivelse] = useState("");

  const isOwner = useMemo(
    () => !!forening?.oprettet_af && forening.oprettet_af === userId,
    [forening?.oprettet_af, userId]
  );

  // iPad / tablet
  const { width } = useWindowDimensions();
  const isTablet = width >= 768;

  // font-size helper (mobil, tablet = mobil*1.35 hvis ikke angivet)
  const fs = (phone: number, tablet?: number) => ({
    fontSize: isTablet ? (tablet ?? Math.round(phone * 1.35)) : phone,
  });

  // lifecycle guards
  const isMounted = useRef(true);
  const navigatedAway = useRef(false);
  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
    };
  }, []);

  /* ----- Hent forening ----- */
  const fetchForening = useCallback(async () => {
    if (!foreningId || navigatedAway.current) return;
    const { data, error } = await supabase
      .from("foreninger")
      .select("*")
      .eq("id", foreningId)
      .maybeSingle();

    if (!isMounted.current || navigatedAway.current) return;

    if (error) {
      console.error("Kunne ikke hente forening:", error);
      setForening(null);
      return;
    }

    if (!data) {
      // foreningen findes ikke → gå pænt tilbage
      navigatedAway.current = true;
      try {
        router.canGoBack() ? router.back() : router.replace("/foreninger");
      } catch {
        router.replace("/foreninger");
      }
      return;
    }

    setForening(data as Forening);
  }, [foreningId, router]);

  useEffect(() => {
    if (!foreningId) return;
    (async () => {
      setLoading(true);
      await fetchForening();
      if (isMounted.current) setLoading(false);
    })();
  }, [foreningId, fetchForening]);

  // Sync redigeringsfelter
  useEffect(() => {
    if (!forening) return;
    setEditNavn(forening.navn || "");
    setEditSted(forening.sted || "");
    setEditBeskrivelse(forening.beskrivelse || "");
  }, [forening]);

  /* ----- Hent medlemmer ----- */
  const fetchMedlemmer = useCallback(async () => {
    if (!foreningId || navigatedAway.current) return;
    const { data, error } = await supabase
      .from("foreningsmedlemmer")
      .select(
        "user_id, rolle, status, users:users!foreningsmedlemmer_user_id_fkey (name, username, avatar_url, email)"
      )
      .eq("forening_id", foreningId);

    if (!isMounted.current || navigatedAway.current) return;

    if (error) {
      console.error("Kunne ikke hente medlemmer:", error?.message || error);
      setMedlemmer([]);
      setAntalApproved(0);
      return;
    }

    const mapped = (data as MedlemsRow[]).map((m) => ({
      ...m,
      users: {
        ...m.users,
        avatar_url: resolveAvatarUrl(m.users?.avatar_url ?? null),
      },
    }));

    setMedlemmer(mapped);
    setAntalApproved(mapped.filter((m) => m.status === "approved").length);
  }, [foreningId]);

  useEffect(() => {
    if (foreningId) fetchMedlemmer();
  }, [foreningId, fetchMedlemmer]);

  /* ----- Derived ----- */
  const myRow = useMemo(
    () => medlemmer.find((m) => m.user_id === userId) || null,
    [medlemmer, userId]
  );
  const isApproved = myRow?.status === "approved";
  const isPending = myRow?.status === "pending";
  const amAdmin = !!myRow && isAdmin(myRow, forening?.oprettet_af);

  const approved = medlemmer.filter((m) => m.status === "approved");
  const pending = medlemmer.filter((m) => m.status === "pending");
  const admins = approved.filter((m) => isAdmin(m, forening?.oprettet_af));
  const regulars = approved.filter((m) => !isAdmin(m, forening?.oprettet_af));

  /* ========================== SAMTALER – PREVIEW ========================== */
  const [threads, setThreads] = useState<ThreadRow[]>([]);
  const fetchThreads = useCallback(async () => {
    if (!foreningId || navigatedAway.current) return;
    const { data, error } = await supabase
      .from("forening_threads")
      .select("id, forening_id, title, created_at, created_by")
      .eq("forening_id", foreningId)
      .order("created_at", { ascending: false });
    if (!isMounted.current || navigatedAway.current) return;
    if (error) {
      console.error("Kunne ikke hente tråde:", error.message);
      setThreads([]);
      return;
    }
    setThreads((data || []) as ThreadRow[]);
  }, [foreningId]);

  useEffect(() => {
    if (foreningId) fetchThreads();
  }, [foreningId, fetchThreads]);

  /* ========================== AKTIVITETER – PREVIEW (liste) ========================== */
  const [events, setEvents] = useState<EventRow[]>([]);
  const fetchEvents = useCallback(async () => {
    if (!foreningId || navigatedAway.current) return;
    const { data, error } = await supabase
      .from("forening_events")
      .select("id, title, start_at, end_at, location, price")
      .eq("forening_id", foreningId)
      .order("start_at", { ascending: false });

    if (!isMounted.current || navigatedAway.current) return;

    if (error) {
      console.error("Kunne ikke hente aktiviteter:", error.message);
      setEvents([]);
      return;
    }
    setEvents((data || []) as EventRow[]);
  }, [foreningId]);

  useEffect(() => {
    if (foreningId) fetchEvents();
  }, [foreningId, fetchEvents]);

  /* ========================== BILLEDER – PREVIEW (3 seneste) ========================== */
  const [imagesPreview, setImagesPreview] = useState<EventImagePreview[]>([]);
  const fetchImagesPreview = useCallback(async () => {
    if (!foreningId || navigatedAway.current) return;

    const { data: latestEvents } = await supabase
      .from("forening_events")
      .select("id")
      .eq("forening_id", foreningId)
      .order("start_at", { ascending: false })
      .limit(12);

    if (!isMounted.current || navigatedAway.current) return;

    const ids = (latestEvents || []).map((e: any) => e.id);
    if (ids.length === 0) {
      setImagesPreview([]);
      return;
    }

    const { data: imgs, error } = await supabase
      .from("event_images")
      .select("id, image_url, event_id, created_at")
      .in("event_id", ids)
      .order("created_at", { ascending: false })
      .limit(3);

    if (!isMounted.current || navigatedAway.current) return;

    if (error) {
      console.warn("Kunne ikke hente billede-preview:", error.message);
      setImagesPreview([]);
      return;
    }
    setImagesPreview((imgs || []) as EventImagePreview[]);
  }, [foreningId]);

  /* ---------- KALENDER ---------- */
  const [monthCursor, setMonthCursor] = useState(new Date());
  const [calEvents, setCalEvents] = useState<EventRow[]>([]);
  const [dayModalVisible, setDayModalVisible] = useState(false);
  const [dayModalDate, setDayModalDate] = useState<string | null>(null);

  const [calWidth, setCalWidth] = useState(0);
  const cellSize = calWidth > 0 ? Math.floor(calWidth / 7) : 0;
  const calGridHeight = cellSize * 6;

  const scrollRef = useRef<ScrollView>(null);
  const lastY = useRef(0);
  const onScroll = (e: any) => {
    lastY.current = e.nativeEvent.contentOffset?.y ?? 0;
  };

  const changeMonth = (delta: -1 | 1) => {
    scrollRef.current?.scrollTo({ y: lastY.current, animated: false });
    setMonthCursor((d) => new Date(d.getFullYear(), d.getMonth() + delta, 1));
    requestAnimationFrame(() => {
      scrollRef.current?.scrollTo({ y: lastY.current, animated: false });
    });
  };

  const fetchCalendarEvents = useCallback(
    async (base: Date) => {
      if (!foreningId || navigatedAway.current) return;
      const first = startOfMonth(base);
      const last = endOfMonth(base);
      const lastEnd = new Date(last);
      lastEnd.setHours(23, 59, 59, 999);

      const { data, error } = await supabase
        .from("forening_events")
        .select("id, title, start_at, end_at, location, price")
        .eq("forening_id", foreningId)
        .gte("start_at", first.toISOString())
        .lte("start_at", lastEnd.toISOString())
        .order("start_at", { ascending: true });

      if (!isMounted.current || navigatedAway.current) return;

      if (error) {
        console.warn("Kunne ikke hente kalender-events:", error.message);
        setCalEvents([]);
        return;
      }
      setCalEvents((data || []) as EventRow[]);
    },
    [foreningId]
  );

  useEffect(() => {
    if (foreningId) fetchCalendarEvents(monthCursor);
  }, [foreningId, monthCursor, fetchCalendarEvents]);

  const dayToEvents = useMemo(() => {
    const m = new Map<string, EventRow[]>();
    calEvents.forEach((a) => {
      const d = new Date(a.start_at);
      const key = toKey(new Date(d.getFullYear(), d.getMonth(), d.getDate()));
      const arr = m.get(key) ?? [];
      arr.push(a);
      m.set(key, arr);
    });
    return m;
  }, [calEvents]);

  /* ---------- Aktivitets-detaljer fra kalender ---------- */
  const [showEventModal, setShowEventModal] = useState(false);
  const [activeEvent, setActiveEvent] = useState<EventFull | null>(null);
  const [loadingEvent, setLoadingEvent] = useState(false);

  const openEventFromCalendar = async (eventId: string) => {
    try {
      setLoadingEvent(true);
      const { data, error } = await supabase
        .from("forening_events")
        .select(
          "id, forening_id, title, description, location, start_at, end_at, price, capacity, allow_registration, image_url, created_by, created_at"
        )
        .eq("id", eventId)
        .maybeSingle();
      if (!isMounted.current) return;
      if (error) throw error;
      setActiveEvent((data || null) as EventFull | null);
      setShowEventModal(true);
    } catch (e: any) {
      Alert.alert("Fejl", e?.message ?? "Kunne ikke indlæse aktiviteten.");
    } finally {
      if (isMounted.current) setLoadingEvent(false);
    }
  };

  /* ---------- FOKUS-REFRESH + PULL-TO-REFRESH ---------- */
  const [refreshing, setRefreshing] = useState(false);
  const refreshAll = useCallback(async () => {
    if (navigatedAway.current) return;
    setRefreshing(true);
    await Promise.all([
      fetchForening(),
      fetchMedlemmer(),
      fetchThreads(),
      fetchEvents(),
      fetchCalendarEvents(monthCursor),
      fetchImagesPreview(),
    ]);
    if (isMounted.current) setRefreshing(false);
  }, [
    fetchForening,
    fetchMedlemmer,
    fetchThreads,
    fetchEvents,
    fetchCalendarEvents,
    monthCursor,
    fetchImagesPreview,
  ]);

  useFocusEffect(
    useCallback(() => {
      refreshAll();
      return () => {};
    }, [refreshAll])
  );

  /* ----- Upload foreningsbillede (header) ----- */
  const handleUploadHeader = async () => {
    if (!isOwner || !foreningId) return;
    try {
      const pick = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 1,
      });
      if (pick.canceled) return;

      const asset = pick.assets?.[0];
      if (!asset?.uri) return;

      // Nedskalér & komprimér (1200px bredde, JPEG ~50%)
      const img = await ImageManipulator.manipulateAsync(
        asset.uri,
        [{ resize: { width: 1200 } }],
        { compress: 0.5, format: ImageManipulator.SaveFormat.JPEG, base64: true }
      );
      if (!img.base64) {
        Alert.alert("Fejl", "Kunne ikke læse billedet.");
        return;
      }

      setUploading(true);

      const fileName = `${foreningId}_${Date.now()}.jpg`;
      const { error: uploadError } = await supabase.storage
        .from("foreningsbilleder")
        .upload(fileName, decode(img.base64), {
          contentType: "image/jpeg",
          upsert: true,
        });

      if (uploadError) throw uploadError;

      const { data } = supabase.storage
        .from("foreningsbilleder")
        .getPublicUrl(fileName);
      const publicUrl = data.publicUrl;

      const { error: updateErr } = await supabase
        .from("foreninger")
        .update({ billede_url: publicUrl })
        .eq("id", foreningId);

      if (updateErr) throw updateErr;

      await refreshAll();
    } catch (err: any) {
      Alert.alert("Fejl", err?.message ?? "Kunne ikke uploade billedet.");
    } finally {
      if (isMounted.current) setUploading(false);
    }
  };

  /* ----- Gem/Annuller redigering ----- */
  const handleSaveEdit = async () => {
    if (!isOwner || !foreningId) return;
    if (!editNavn.trim() || !editSted.trim() || !editBeskrivelse.trim()) {
      Alert.alert("Udfyld venligst alle felter.");
      return;
    }
    setSaving(true);
    const { error } = await supabase
      .from("foreninger")
      .update({
        navn: editNavn.trim(),
        sted: editSted.trim(),
        beskrivelse: editBeskrivelse.trim(),
      })
      .eq("id", foreningId);
    setSaving(false);
    if (error) {
      Alert.alert("Fejl", "Kunne ikke gemme ændringer: " + error.message);
      return;
    }
    await refreshAll();
    setEditMode(false);
  };

  /* ----- Medlemsrettigheder (admin) ----- */
  const canRemove = (target: MedlemsRow) => {
    if (!amAdmin) return false;
    if (target.user_id === forening?.oprettet_af) return false;
    const targetIsAdmin = isAdmin(target, forening?.oprettet_af);
    if (!isOwner && targetIsAdmin) return false;
    return true;
  };

  const removeMember = async (target: MedlemsRow) => {
    if (!foreningId || !canRemove(target)) return;
    const name = getDisplayName(target);
    Alert.alert("Fjern medlem", `Vil du fjerne ${name} fra foreningen?`, [
      { text: "Annuller", style: "cancel" },
      {
        text: "Fjern",
        style: "destructive",
        onPress: async () => {
          try {
            setBusyId(target.user_id);
            const { error } = await supabase
              .from("foreningsmedlemmer")
              .delete()
              .eq("forening_id", foreningId)
              .eq("user_id", target.user_id);
            if (error) throw error;
            await refreshAll();
            if (selectedMember?.user_id === target.user_id)
              setSelectedMember(null);
          } catch (e: any) {
            Alert.alert("Fejl", e?.message ?? "Kunne ikke fjerne medlemmet.");
          } finally {
            setBusyId(null);
          }
        },
      },
    ]);
  };

  const approveMember = async (target: MedlemsRow) => {
    if (!amAdmin || !foreningId) return;
    try {
      setBusyId(target.user_id);
      const { error } = await supabase
        .from("foreningsmedlemmer")
        .update({ status: "approved" })
        .eq("forening_id", foreningId)
        .eq("user_id", target.user_id);
      if (error) throw error;
      await refreshAll();
    } catch (e: any) {
      Alert.alert("Fejl", e?.message ?? "Kunne ikke godkende.");
    } finally {
      setBusyId(null);
    }
  };

  const declineMember = async (target: MedlemsRow) => {
    if (!amAdmin || !foreningId) return;
    try {
      setBusyId(target.user_id);
      const { error } = await supabase
        .from("foreningsmedlemmer")
        .update({ status: "declined" })
        .eq("forening_id", foreningId)
        .eq("user_id", target.user_id);
      if (error) throw error;
      await refreshAll();
    } catch (e: any) {
      Alert.alert("Fejl", e?.message ?? "Kunne ikke afvise.");
    } finally {
      setBusyId(null);
    }
  };

  /* ----- Bliv medlem / Forlad / Slet forening ----- */
  const handleBlivMedlem = async () => {
    if (!userId || !foreningId) return;
    const { error } = await supabase
      .from("foreningsmedlemmer")
      .insert([
        { forening_id: foreningId, user_id: userId, rolle: "medlem", status: "pending" },
      ]);
    if (error) {
      Alert.alert("Fejl", "Kunne ikke sende anmodning: " + error.message);
      return;
    }
    Alert.alert("Din anmodning er sendt og afventer godkendelse.");
    await refreshAll();
  };

  const confirmForlad = () => {
    Alert.alert("Afslut medlemskab", "Er du sikker på, at du vil fortsætte?", [
      { text: "Annuller", style: "cancel" },
      {
        text: "Ja, afslut",
        style: "destructive",
        onPress: async () => {
          if (!userId || !foreningId) return;
          const { error } = await supabase
            .from("foreningsmedlemmer")
            .delete()
            .eq("forening_id", foreningId)
            .eq("user_id", userId);
          if (error) {
            Alert.alert("Fejl", "Kunne ikke forlade foreningen: " + error.message);
            return;
          }
          await refreshAll();
        },
      },
    ]);
  };

  const handleDeleteForening = async () => {
    if (!isOwner || !foreningId) return;
    Alert.alert(
      "Slet forening",
      "Er du sikker på, at du vil slette foreningen? Denne handling kan ikke fortrydes.",
      [
        { text: "Annuller", style: "cancel" },
        {
          text: "Slet",
          style: "destructive",
          onPress: async () => {
            const { error } = await supabase
              .from("foreninger")
              .delete()
              .eq("id", foreningId);
            if (error) {
              Alert.alert(
                "Fejl",
                "Kunne ikke slette foreningen: " + error.message
              );
              return;
            }
            // undgå efterfølgende fetch på en slettet id
            navigatedAway.current = true;
            try {
              router.canGoBack() ? router.back() : router.replace("/foreninger");
            } catch {
              router.replace("/foreninger");
            }
          },
        },
      ]
    );
  };

  /* ----- UI ----- */
  if (!foreningId) {
    return (
      <View style={styles.center}>
        <Text style={fs(14, 18)}>Forening ikke fundet.</Text>
      </View>
    );
  }
  if (loading || !forening) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#131921" />
      </View>
    );
  }

  const top3Threads = threads.slice(0, 3);
  const top3Events = events.slice(0, 3);
  const monthLabel = monthCursor.toLocaleDateString("da-DK", {
    month: "long",
    year: "numeric",
  });

  return (
    <>
      <ScrollView
        ref={scrollRef}
        onScroll={onScroll}
        scrollEventThrottle={16}
        style={{ flex: 1, backgroundColor: "#7C8996" }}
        contentContainerStyle={{ paddingBottom: 120 }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={refreshAll}
            tintColor="#131921"
          />
        }
      >
        {/* Topbar */}
        <View style={styles.topBar}>
          <TouchableOpacity
            onPress={() => router.back()}
            style={styles.backBtn}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Text style={[styles.backBtnText, fs(16, 22)]}>‹</Text>
          </TouchableOpacity>
          {/* Tæller fjernet fra topbaren */}
          <View style={{ width: 34 }} />
        </View>

        {/* Kort (Forening info) */}
        <View style={styles.card}>
          {forening.billede_url ? (
            <Image
              source={{ uri: forening.billede_url }}
              style={[styles.hero, isTablet && styles.heroTablet]}
            />
          ) : (
            <View
              style={[styles.hero, styles.heroPlaceholder, isTablet && styles.heroTablet]}
            >
              <Text style={[{ color: "#222" }, fs(12, 16)]}>Intet billede</Text>
            </View>
          )}

          {isOwner && editMode ? (
            <TextInput
              style={[styles.input, styles.titleInput, fs(16, 26)]}
              value={editNavn}
              onChangeText={setEditNavn}
              placeholder="Foreningens navn"
              placeholderTextColor="#7a7a7a"
            />
          ) : (
            <Text style={[styles.title, fs(15, 26)]}>{forening.navn}</Text>
          )}

          {isOwner && editMode ? (
            <TextInput
              style={[styles.input, fs(12, 18)]}
              value={editSted}
              onChangeText={setEditSted}
              placeholder="Sted"
              placeholderTextColor="#7a7a7a"
            />
          ) : (
            <Text style={[styles.place, fs(12, 18)]}>{forening.sted}</Text>
          )}

          {isOwner && editMode ? (
            <TextInput
              style={[styles.input, styles.descInput, fs(13, 19)]}
              value={editBeskrivelse}
              onChangeText={setEditBeskrivelse}
              placeholder="Beskrivelse"
              placeholderTextColor="#7a7a7a"
              multiline
            />
          ) : !!forening.beskrivelse ? (
            <Text style={[styles.desc, fs(13, 19)]}>{forening.beskrivelse}</Text>
          ) : null}

          {isOwner && (
            <View style={styles.editRow}>
              {!editMode ? (
                <TouchableOpacity
                  style={[styles.smallActionBtn, styles.editBtn]}
                  onPress={() => setEditMode(true)}
                >
                  <Text style={[styles.smallActionText, fs(12, 15)]}>Rediger</Text>
                </TouchableOpacity>
              ) : (
                <>
                  <TouchableOpacity
                    style={[styles.smallActionBtn, styles.saveBtn]}
                    onPress={handleSaveEdit}
                    disabled={saving}
                  >
                    <Text style={[styles.smallActionText, fs(12, 15)]}>
                      {saving ? "Gemmer…" : "Gem"}
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.smallActionBtn, styles.cancelBtn]}
                    onPress={() => setEditMode(false)}
                    disabled={saving}
                  >
                    <Text style={[styles.smallActionText, fs(12, 15)]}>Annullér</Text>
                  </TouchableOpacity>
                </>
              )}
            </View>
          )}

          {!isApproved ? (
            isPending ? (
              <View style={[styles.bigBtn, { backgroundColor: "#9aa0a6" }]}>
                <Text style={[styles.bigBtnText, fs(14, 18)]}>Afventer godkendelse…</Text>
              </View>
            ) : (
              <TouchableOpacity
                style={[styles.bigBtn, styles.join]}
                onPress={handleBlivMedlem}
              >
                <Text style={[styles.bigBtnText, fs(14, 18)]}>Bliv medlem</Text>
              </TouchableOpacity>
            )
          ) : null}
        </View>

        {/* Medlemmer (preview) */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={[styles.sectionHeaderText, fs(15, 20)]}>MEDLEMMER</Text>

            <TouchableOpacity
              style={styles.counterSmall}
              onPress={() => {
                setSelectedMember(null);
                setShowMembers(true);
              }}
            >
              <Image
                source={MembersIcon}
                style={{ width: 22, height: 22, marginRight: 6, tintColor: "#fff" }}
                resizeMode="contain"
              />
              <Text style={[styles.counterNum, fs(13, 16)]}>{antalApproved}</Text>
            </TouchableOpacity>
          </View>

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
                  <Image
                    source={{ uri: item.users.avatar_url }}
                    style={styles.memberAvatar}
                  />
                ) : (
                  <View style={styles.memberAvatarPlaceholder}>
                    <Text style={[{ color: "#131921" }, fs(12, 16)]}>?</Text>
                  </View>
                )}
                <Text style={[styles.memberName, fs(12, 16)]}>
                  {getDisplayName(item)}
                </Text>
              </TouchableOpacity>
            )}
            ListEmptyComponent={
              <Text style={[{ color: "#000", margin: 8 }, fs(12, 15)]}>
                Ingen medlemmer endnu.
              </Text>
            }
            contentContainerStyle={{ paddingVertical: 6, paddingLeft: 12 }}
            showsHorizontalScrollIndicator={false}
          />
        </View>

        {/* Samtaler – PREVIEW */}
        <TouchableOpacity
          style={styles.section}
          activeOpacity={0.9}
          onPress={() => router.push(`/forening/${foreningId}/threads`)}
        >
          <View style={styles.sectionHeader}>
            <Text style={[styles.sectionHeaderText, fs(15, 20)]}>SAMTALER</Text>
          </View>
          {top3Threads.length === 0 ? (
            <Text style={[styles.sectionMuted, fs(12, 15)]}>Ingen tråde endnu.</Text>
          ) : (
            top3Threads.map((t, idx) => (
              <View
                key={t.id}
                style={[styles.threadItemRow, idx === 0 && styles.noTopBorder]}
              >
                <View style={styles.threadItemLeft}>
                  <Text style={[styles.threadTitle, fs(17, 24)]}>{t.title}</Text>
                  <Text style={[styles.threadMeta, fs(9, 12)]}>
                    Oprettet af{" "}
                    {approved.find((m) => m.user_id === t.created_by)
                      ? getDisplayName(
                          approved.find((m) => m.user_id === t.created_by)!
                        )
                      : "Ukendt"}{" "}
                    · {new Date(t.created_at).toLocaleDateString("da-DK")}
                  </Text>
                </View>
              </View>
            ))
          )}
          {threads.length > 3 && (
            <Text style={[styles.sectionMuted, fs(12, 15), { marginTop: 4 }]}>
              Viser de 3 seneste – tryk for at se alle ({threads.length}).
            </Text>
          )}
        </TouchableOpacity>

        {/* Aktiviteter – PREVIEW (liste) */}
        <TouchableOpacity
          style={styles.section}
          activeOpacity={0.9}
          onPress={() => router.push(`/forening/${foreningId}/events`)}
        >
          <View style={styles.sectionHeader}>
            <Text style={[styles.sectionHeaderText, fs(15, 20)]}>AKTIVITETER</Text>
          </View>
          {top3Events.length === 0 ? (
            <Text style={[styles.sectionMuted, fs(12, 15)]}>Ingen aktiviteter endnu.</Text>
          ) : (
            top3Events.map((ev, idx) => (
              <View
                key={ev.id}
                style={[styles.eventRow, idx === 0 && styles.noTopBorder]}
              >
                <View style={{ flex: 1 }}>
                  <Text style={[styles.eventTitle, fs(17, 24)]}>
                    {ev.title || "Aktivitet"}
                  </Text>
                  <Text style={[styles.eventMeta, fs(12, 16)]}>
                    {formatDateRange(ev.start_at, ev.end_at)}
                  </Text>
                  {!!ev.location && (
                    <Text style={[styles.eventMeta, fs(12, 16)]}>📍 {ev.location}</Text>
                  )}
                  {!!ev.price && (
                    <Text style={[styles.eventMeta, fs(12, 16)]}>Pris: {ev.price} kr.</Text>
                  )}
                </View>
              </View>
            ))
          )}
          {events.length > 3 && (
            <Text style={[styles.sectionMuted, fs(12, 15), { marginTop: 4 }]}>
              Viser de 3 seneste – tryk for at se alle ({events.length}).
            </Text>
          )}
        </TouchableOpacity>

        {/* ---------- AKTIVITETER – KALENDER ---------- */}
        <View
          style={styles.section}
          onLayout={(e) =>
            setCalWidth(Math.max(0, Math.floor(e.nativeEvent.layout.width)))
          }
        >
          <View style={styles.sectionHeader}>
            <Text style={[styles.sectionHeaderText, fs(15, 20)]}>AKTIVITETER (KALENDER)</Text>
          </View>

          <View style={styles.calHeader}>
            <TouchableOpacity onPress={() => changeMonth(-1)} style={styles.calNavBtn}>
              <Text style={[styles.calNavText, fs(16, 20)]}>‹</Text>
            </TouchableOpacity>
            <Text style={[styles.calMonthLabel, fs(14, 18)]}>
              {monthLabel.charAt(0).toUpperCase() + monthLabel.slice(1)}
            </Text>
            <TouchableOpacity onPress={() => changeMonth(1)} style={styles.calNavBtn}>
              <Text style={[styles.calNavText, fs(16, 20)]}>›</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.calWeekdays}>
            {["Man", "Tir", "Ons", "Tor", "Fre", "Lør", "Søn"].map((w) => (
              <Text key={w} style={[styles.calWeekdayText, fs(11, 14)]}>
                {w}
              </Text>
            ))}
          </View>
          <View style={[styles.calGrid, { height: calGridHeight }]}>
            {buildMonthGrid(monthCursor).map((week, wi) => (
              <View key={wi} style={[styles.calRow, { height: cellSize }]}>
                {week.map((d, di) => {
                  const key = toKey(
                    new Date(d.getFullYear(), d.getMonth(), d.getDate())
                  );
                  const inThisMonth = d.getMonth() === monthCursor.getMonth();
                  const list = dayToEvents.get(key) || [];
                  const hasActs = list.length > 0;
                  return (
                    <TouchableOpacity
                      key={`${wi}-${di}`}
                      onPress={() => {
                        if (!hasActs) return;
                        setDayModalDate(key);
                        setDayModalVisible(true);
                      }}
                      activeOpacity={hasActs ? 0.8 : 1}
                      style={[
                        styles.calCell,
                        { width: cellSize, height: cellSize },
                        !inThisMonth && styles.calCellDim,
                        hasActs && styles.calCellActive,
                      ]}
                    >
                      <Text
                        style={[
                          styles.calDayNum,
                          fs(13, 16),
                          !inThisMonth && { opacity: 0.45 },
                          hasActs && { color: "#fff", fontWeight: "800" },
                        ]}
                      >
                        {d.getDate()}
                      </Text>
                      {hasActs && <View style={styles.calDot} />}
                    </TouchableOpacity>
                  );
                })}
              </View>
            ))}
          </View>
        </View>

        {/* ---------- BILLEDER – PREVIEW + LINK ---------- */}
        <TouchableOpacity
          style={styles.section}
          activeOpacity={0.9}
          onPress={() => router.push(`/forening/${foreningId}/images`)}
        >
          <View style={styles.sectionHeader}>
            <Text style={[styles.sectionHeaderText, fs(15, 20)]}>BILLEDER</Text>
          </View>
          {imagesPreview.length === 0 ? (
            <Text style={[styles.sectionMuted, fs(12, 15)]}>
              Ingen billeder endnu. Tryk for at åbne billeder.
            </Text>
          ) : (
            <View style={styles.imagesPreviewRow}>
              {imagesPreview.map((img) => (
                <Image
                  key={img.id}
                  source={{ uri: img.image_url }}
                  style={styles.imagesPreviewThumb}
                />
              ))}
            </View>
          )}
          <Text style={[styles.sectionMuted, fs(12, 15), { marginTop: 6 }]}>
            Tryk for at se alle billeder.
          </Text>
        </TouchableOpacity>

        {/* Bund-handlinger */}
        <View style={styles.bottomActions}>
          {isApproved && (
            <TouchableOpacity
              style={[styles.actionBtn, styles.leaveAction]}
              onPress={confirmForlad}
            >
              <Text style={[styles.actionBtnText, fs(14, 18)]}>Afslut medlemskab</Text>
            </TouchableOpacity>
          )}
          {isOwner && (
            <>
              <TouchableOpacity
                style={[styles.actionBtn, styles.uploadAction]}
                onPress={handleUploadHeader}
                disabled={uploading}
              >
                <Text style={[styles.actionBtnText, fs(14, 18)]}>
                  {uploading ? "Uploader..." : "Upload foreningsbillede"}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.actionBtn, styles.deleteAction]}
                onPress={handleDeleteForening}
              >
                <Text style={[styles.deleteActionText, fs(12, 15)]}>Slet forening</Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      </ScrollView>

      {/* Medlemmer - modal */}
      <Modal
        visible={showMembers}
        transparent
        animationType="fade"
        onRequestClose={() => setShowMembers(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            {selectedMember ? (
              <View style={styles.profileWrap}>
                <Image
                  source={
                    selectedMember.users?.avatar_url
                      ? { uri: selectedMember.users.avatar_url }
                      : { uri: "https://placehold.co/200x200?text=Profil" }
                  }
                  style={styles.profileAvatar}
                />
                <Text style={[styles.profileName, fs(12, 16)]}>
                  {getDisplayName(selectedMember)}
                </Text>
                <Text style={[styles.roleBadge, fs(10, 13)]}>
                  {isAdmin(selectedMember, forening?.oprettet_af)
                    ? "ADMIN"
                    : "MEDLEM"}
                </Text>
                {canRemove(selectedMember) && (
                  <TouchableOpacity
                    onPress={() => removeMember(selectedMember)}
                    style={[
                      styles.smallActionBtn,
                      { backgroundColor: "#C62828", marginTop: 6 },
                    ]}
                    disabled={busyId === selectedMember.user_id}
                  >
                    <Text style={[styles.smallActionText, fs(12, 15)]}>
                      {busyId === selectedMember.user_id
                        ? "Fjerner…"
                        : "Fjern medlem"}
                    </Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity
                  onPress={() => setShowMembers(false)}
                  style={styles.modalCloseBottom}
                >
                  <Text style={[styles.modalCloseText, fs(16, 20)]}>✕</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <View style={{ maxHeight: 520 }}>
                <ScrollView>
                  <Text style={[styles.listHeader, fs(10, 12)]}>AFVENTER GODKENDELSE</Text>
                  {pending.length === 0 ? (
                    <Text style={[styles.emptyLine, fs(10, 12)]}>Ingen afventer.</Text>
                  ) : null}
                  {pending.length > 0 &&
                    pending.map((m) => (
                      <TouchableOpacity
                        key={`p-${m.user_id}`}
                        onPress={() => setSelectedMember(m)}
                        activeOpacity={0.9}
                        style={styles.row}
                      >
                        {m.users?.avatar_url ? (
                          <Image
                            source={{ uri: m.users.avatar_url }}
                            style={styles.rowAvatar}
                          />
                        ) : (
                          <View style={[styles.rowAvatar, styles.rowAvatarPh]}>
                            <Text style={[{ color: "#131921", fontWeight: "900" }, fs(12, 15)]}>
                              {(getDisplayName(m)[0] || "U").toUpperCase()}
                            </Text>
                          </View>
                        )}
                        <View style={{ flex: 1 }}>
                          <Text style={[styles.rowName, fs(13, 16)]}>{getDisplayName(m)}</Text>
                          {!!m.users?.email && (
                            <Text style={[styles.rowEmail, fs(11, 14)]}>{m.users.email}</Text>
                          )}
                          <Text style={[styles.roleUnderName, fs(10, 12)]}>PENDING</Text>
                        </View>
                        {amAdmin && (
                          <View style={{ flexDirection: "row" }}>
                            <TouchableOpacity
                              onPress={() => approveMember(m)}
                              style={[
                                styles.smallBtn,
                                styles.approveBtn,
                                busyId === m.user_id && styles.btnDisabled,
                              ]}
                              disabled={busyId === m.user_id}
                            >
                              <Text style={[styles.smallBtnText, fs(11, 14)]}>
                                {busyId === m.user_id ? "…" : "Godkend"}
                              </Text>
                            </TouchableOpacity>
                            <View style={{ width: 8 }} />
                            <TouchableOpacity
                              onPress={() => declineMember(m)}
                              style={[
                                styles.smallBtn,
                                styles.rejectBtn,
                                busyId === m.user_id && styles.btnDisabled,
                              ]}
                              disabled={busyId === m.user_id}
                            >
                              <Text style={[styles.smallBtnText, fs(11, 14)]}>Afvis</Text>
                            </TouchableOpacity>
                          </View>
                        )}
                      </TouchableOpacity>
                    ))}

                  <Text style={[styles.listHeader, fs(10, 12)]}>ADMINISTRATORER</Text>
                  {admins.length === 0 ? (
                    <Text style={[styles.emptyLine, fs(10, 12)]}>Ingen administratorer.</Text>
                  ) : (
                    admins.map((m) => (
                      <TouchableOpacity
                        key={`a-${m.user_id}`}
                        onPress={() => setSelectedMember(m)}
                        activeOpacity={0.9}
                        style={styles.row}
                      >
                        {m.users?.avatar_url ? (
                          <Image
                            source={{ uri: m.users.avatar_url }}
                            style={styles.rowAvatar}
                          />
                        ) : (
                          <View style={[styles.rowAvatar, styles.rowAvatarPh]}>
                            <Text style={[{ color: "#131921", fontWeight: "900" }, fs(12, 15)]}>
                              {(getDisplayName(m)[0] || "U").toUpperCase()}
                            </Text>
                          </View>
                        )}
                        <View style={{ flex: 1 }}>
                          <Text style={[styles.rowName, fs(13, 16)]}>{getDisplayName(m)}</Text>
                          {!!m.users?.email && (
                            <Text style={[styles.rowEmail, fs(11, 14)]}>{m.users.email}</Text>
                          )}
                          <Text style={[styles.roleUnderName, fs(10, 12)]}>ADMIN</Text>
                        </View>
                        {canRemove(m) && (
                          <TouchableOpacity
                            onPress={() => removeMember(m)}
                            style={[styles.smallBtn, styles.deleteMiniBtn]}
                            disabled={busyId === m.user_id}
                          >
                            <Text style={[styles.smallBtnText, fs(11, 14)]}>
                              {busyId === m.user_id ? "…" : "Fjern"}
                            </Text>
                          </TouchableOpacity>
                        )}
                      </TouchableOpacity>
                    ))
                  )}

                  <Text style={[styles.listHeader, fs(10, 12)]}>MEDLEMMER</Text>
                  {regulars.length === 0 ? (
                    <Text style={[styles.emptyLine, fs(10, 12)]}>Ingen medlemmer.</Text>
                  ) : (
                    regulars.map((m) => (
                      <TouchableOpacity
                        key={`m-${m.user_id}`}
                        onPress={() => setSelectedMember(m)}
                        activeOpacity={0.9}
                        style={styles.row}
                      >
                        {m.users?.avatar_url ? (
                          <Image
                            source={{ uri: m.users.avatar_url }}
                            style={styles.rowAvatar}
                          />
                        ) : (
                          <View style={[styles.rowAvatar, styles.rowAvatarPh]}>
                            <Text style={[{ color: "#131921", fontWeight: "900" }, fs(12, 15)]}>
                              {(getDisplayName(m)[0] || "U").toUpperCase()}
                            </Text>
                          </View>
                        )}
                        <View style={{ flex: 1 }}>
                          <Text style={[styles.rowName, fs(13, 16)]}>{getDisplayName(m)}</Text>
                          {!!m.users?.email && (
                            <Text style={[styles.rowEmail, fs(11, 14)]}>{m.users.email}</Text>
                          )}
                          <Text style={[styles.roleUnderName, fs(10, 12)]}>MEDLEM</Text>
                        </View>
                        {canRemove(m) && (
                          <TouchableOpacity
                            onPress={() => removeMember(m)}
                            style={[styles.smallBtn, styles.deleteMiniBtn]}
                            disabled={busyId === m.user_id}
                          >
                            <Text style={[styles.smallBtnText, fs(11, 14)]}>
                              {busyId === m.user_id ? "…" : "Fjern"}
                            </Text>
                          </TouchableOpacity>
                        )}
                      </TouchableOpacity>
                    ))
                  )}
                </ScrollView>
                <TouchableOpacity
                  onPress={() => setShowMembers(false)}
                  style={styles.modalCloseBottom}
                >
                  <Text style={[styles.modalCloseText, fs(16, 20)]}>✕</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        </View>
      </Modal>

      {/* Dagens aktiviteter (fra kalender) */}
      <Modal
        visible={dayModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setDayModalVisible(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalCard, { maxWidth: 480, position: "relative" }]}>
            <TouchableOpacity
              onPress={() => setDayModalVisible(false)}
              style={styles.blackCloseSquare}
              hitSlop={{ top: 10, right: 10, bottom: 10, left: 10 }}
            >
              <Text style={[styles.blackCloseSquareText, fs(18, 22)]}>✕</Text>
            </TouchableOpacity>
            <View style={[styles.calHeader, { marginTop: 0 }]}>
              <Text style={[styles.sectionTitle, fs(15, 20)]}>
                {dayModalDate
                  ? new Date(dayModalDate).toLocaleDateString("da-DK", {
                      weekday: "long",
                      day: "numeric",
                      month: "long",
                    })
                  : "Aktiviteter"}
              </Text>
            </View>
            {dayModalDate ? (
              (() => {
                const list = dayToEvents.get(dayModalDate) || [];
                if (list.length === 0) {
                  return (
                    <Text style={[{ color: "#000", opacity: 0.7, paddingVertical: 6 }, fs(12, 15)]}>
                      Ingen aktiviteter denne dag.
                    </Text>
                  );
                }
                return (
                  <View>
                    {list.map((a) => (
                      <View
                        key={a.id}
                        style={{
                          paddingVertical: 8,
                          borderBottomWidth: StyleSheet.hairlineWidth,
                          borderBottomColor: "#e8eef2",
                          flexDirection: "row",
                          alignItems: "center",
                        }}
                      >
                        <View style={{ flex: 1 }}>
                          <Text style={[styles.eventTitle, fs(17, 24)]}>{a.title || "Aktivitet"}</Text>
                          <Text style={[styles.eventMeta, fs(12, 16)]}>
                            {formatDateRange(a.start_at, a.end_at)}
                          </Text>
                          {!!a.location && (
                            <Text style={[styles.eventMeta, fs(12, 16)]}>📍 {a.location}</Text>
                          )}
                        </View>
                        <TouchableOpacity
                          onPress={() => {
                            setDayModalVisible(false);
                            openEventFromCalendar(a.id);
                          }}
                          style={[styles.smallBtn, styles.uploadAction]}
                        >
                          <Text style={[styles.smallBtnText, fs(11, 14)]}>ÅBN KORT</Text>
                        </TouchableOpacity>
                      </View>
                    ))}
                  </View>
                );
              })()
            ) : null}
          </View>
        </View>
      </Modal>

      {/* Aktivitet – detaljer */}
      <Modal
        visible={showEventModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowEventModal(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalCard, { maxWidth: 560, position: "relative" }]}>
            <TouchableOpacity
              onPress={() => setShowEventModal(false)}
              style={styles.blackCloseSquare}
              hitSlop={{ top: 10, right: 10, bottom: 10, left: 10 }}
            >
              <Text style={[styles.blackCloseSquareText, fs(18, 22)]}>✕</Text>
            </TouchableOpacity>
            {loadingEvent ? (
              <Text style={[styles.sectionMuted, fs(12, 15)]}>Indlæser…</Text>
            ) : activeEvent ? (
              <View>
                {activeEvent.image_url ? (
                  <Image
                    source={{ uri: activeEvent.image_url }}
                    style={styles.detailImage}
                  />
                ) : null}
                <Text style={[styles.detailTitle, fs(14, 22)]}>{activeEvent.title}</Text>
                <Text style={[styles.detailRange, fs(11, 15)]}>
                  {formatDateRange(activeEvent.start_at, activeEvent.end_at)}
                </Text>
                {!!activeEvent.location && (
                  <Text style={[styles.detailMeta, fs(11, 15)]}>📍 {activeEvent.location}</Text>
                )}
                {!!activeEvent.price && (
                  <Text style={[styles.detailMeta, fs(11, 15)]}>Pris: {activeEvent.price} kr.</Text>
                )}
                {!!activeEvent.capacity && (
                  <Text style={[styles.detailMeta, fs(11, 15)]}>
                    Kapacitet: {activeEvent.capacity}
                  </Text>
                )}
                {!!activeEvent.description && (
                  <Text style={[styles.detailMeta, fs(11, 15), { marginTop: 6 }]}>
                    {activeEvent.description}
                  </Text>
                )}
              </View>
            ) : (
              <Text style={[styles.sectionMuted, fs(12, 15)]}>Kunne ikke indlæse aktiviteten.</Text>
            )}
          </View>
        </View>
      </Modal>
    </>
  );
}

/* ---------- Styles ---------- */
const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#7C8996",
  },

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
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: "#131921",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 3,
    borderColor: "#ffffff",
  },
  backBtnText: { color: "#fff", fontWeight: "800", fontSize: 16, lineHeight: 16 },

  /* Counter (stor – tidligere i topbar) */
  counter: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#131921",
    paddingHorizontal: 10,
    paddingVertical: 1,
    borderRadius: 8,
    borderWidth: 3,
    borderColor: "#fff",
  },
  counterNum: { color: "#fff", fontWeight: "800", fontSize: 13 },

  /* Counter (lille – i sektion header) */
  counterSmall: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#000",
    paddingHorizontal: 10,
    paddingVertical: 2,
    borderRadius: 8,
    borderWidth: 3,
    borderColor: "#fff",
  },

  /* Kort */
  card: {
    marginHorizontal: 14,
    marginTop: 6,
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    padding: 12,
    shadowColor: "#000",
    shadowOpacity: 0.06,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
    borderWidth: 1,
    borderColor: "#eef1f4",
  },
  hero: {
    width: "100%",
    height: 300,
    borderRadius: 10,
    marginBottom: 8,
    resizeMode: "cover",
    backgroundColor: "#f0f0f0",
  },
  heroTablet: { height: 900 },
  heroPlaceholder: {
    backgroundColor: "#f0f0f0",
    alignItems: "center",
    justifyContent: "center",
  },
  title: { fontSize: 15, fontWeight: "800", color: "#131921", marginTop: 4 },
  place: { fontSize: 12, fontWeight: "500", color: "#000", marginTop: 2 },
  desc: { fontSize: 13, color: "#000", marginTop: 6, lineHeight: 18 },

  input: {
    backgroundColor: "#fff",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#e5e8ec",
    paddingHorizontal: 10,
    paddingVertical: 8,
    color: "#000",
    marginTop: 6,
  },
  titleInput: { fontSize: 16, fontWeight: "900", color: "#131921" },
  descInput: { minHeight: 76, textAlignVertical: "top" },
  editRow: { flexDirection: "row", marginTop: 10 },
  smallActionBtn: { paddingVertical: 8, paddingHorizontal: 12, borderRadius: 8 },
  smallActionText: { color: "#fff", fontWeight: "800" },
  editBtn: { backgroundColor: "#131921" },
  saveBtn: { backgroundColor: "#1f7a33" },
  cancelBtn: { backgroundColor: "#9aa0a6" },

  bigBtn: { marginTop: 12, borderRadius: 10, paddingVertical: 10, alignItems: "center" },
  join: { backgroundColor: "#131921" },
  bigBtnText: { color: "#fff", fontSize: 14, fontWeight: "800" },

  /* Sektioner (kort) */
  section: {
    marginTop: 12,
    marginHorizontal: 14,
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: "#eef1f4",
    shadowColor: "#000",
    shadowOpacity: 0.04,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },

  /* Gør headeren til en række med plads til tæller til højre */
  sectionHeader: {
    backgroundColor: "#131921",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 0, // ingen vertikal padding
    height: 50,        // fast højde for alle
    marginBottom: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  sectionHeaderText: { color: "#fff", fontWeight: "900", fontSize: 15 },

  sectionTitle: { fontSize: 15, fontWeight: "900", color: "#131921" },
  sectionMuted: { marginTop: 4, color: "#000", fontSize: 12, opacity: 0.7 },

  /* Medlemmer */
  memberBox: { alignItems: "center", marginRight: 12, minWidth: 64 },
  memberAvatar: {
    width: 60,
    height: 60,
    borderRadius: 8,
    marginBottom: 4,
    backgroundColor: "#f0f0f0",
  },
  memberAvatarPlaceholder: {
    width: 60,
    height: 60,
    borderRadius: 8,
    marginBottom: 4,
    backgroundColor: "#f0f0f0",
    alignItems: "center",
    justifyContent: "center",
  },
  memberName: {
    color: "#000",
    fontSize: 12,
    fontWeight: "700",
    textAlign: "center",
  },

  /* Tråde */
  threadItemRow: {
    flexDirection: "row",
    alignItems: "center",
    borderTopWidth: 2,              // tykkere streg
    borderTopColor: "#cfd6de",      // lidt mørkere
    paddingVertical: 12,
  },
  threadItemLeft: { flex: 1 },
  threadTitle: { fontSize: 17, fontWeight: "800", color: "#131921" },
  threadMeta: { fontSize: 9, color: "#000", opacity: 0.6, marginTop: 2 },

  /* Aktiviteter */
  eventRow: {
    flexDirection: "row",
    alignItems: "center",
    borderTopWidth: 2,             // tykkere streg
    borderTopColor: "#cfd6de",
    paddingVertical: 12,
  },
  eventTitle: { fontSize: 17, fontWeight: "800", color: "#131921" },
  eventMeta: { fontSize: 12, color: "#000", opacity: 0.7, marginTop: 2 },

  /* Første række skal ikke have topstreg */
  noTopBorder: { borderTopWidth: 0 },

  /* Bunden */
  bottomActions: {
    marginTop: 12,
    marginHorizontal: 14,
    marginBottom: 12,
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    padding: 12,
    gap: 10,
    shadowColor: "#000",
    shadowOpacity: 0.06,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
    borderWidth: 1,
    borderColor: "#eef1f4",
  },
  actionBtn: { borderRadius: 8, paddingVertical: 12, alignItems: "center" },
  leaveAction: { backgroundColor: "#9aa0a6" },
  uploadAction: { backgroundColor: "#131921" },
  deleteAction: { backgroundColor: "#C62828" },
  actionBtnText: { color: "#fff", fontSize: 14, fontWeight: "800" },
  deleteActionText: { color: "#fff", fontSize: 12, fontWeight: "800" },

  /* Modal */
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.90)",
    alignItems: "center",
    justifyContent: "center",
    padding: 18,
  },
  modalCard: {
    width: "100%",
    maxWidth: 520,
    backgroundColor: "#FFFFFF",
    borderRadius: 8,
    padding: 12,
    borderWidth: 1,
    borderColor: "#eef1f4",
  },

  listHeader: { fontSize: 10, fontWeight: "800", color: "#131921", marginVertical: 6 },
  emptyLine: { fontSize: 10, color: "#000", paddingVertical: 6, opacity: 0.7 },

  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#e8eef2",
  },
  rowAvatar: { width: 34, height: 34, borderRadius: 17, marginRight: 10, backgroundColor: "#f0f0f0" },
  rowAvatarPh: { backgroundColor: "#f0f0f0", alignItems: "center", justifyContent: "center" },
  rowName: { fontSize: 13, fontWeight: "700", color: "#000" },
  rowEmail: { fontSize: 11, color: "#000", opacity: 0.7 },
  roleUnderName: { fontSize: 10, fontWeight: "800", color: "#131921", marginTop: 2 },

  profileWrap: { alignItems: "center", paddingVertical: 8 },
  profileAvatar: { width: 310, height: 400, borderRadius: 12, marginBottom: 10, backgroundColor: "#f0f0f0" },
  profileName: { fontSize: 12, fontWeight: "800", color: "#000" },
  roleBadge: { fontSize: 10, fontWeight: "900", color: "#131921", marginVertical: 8 },

  modalCloseBottom: {
    alignSelf: "flex-end",
    marginTop: 10,
    backgroundColor: "#131921",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  modalCloseText: { color: "#fff", fontWeight: "900", fontSize: 16 },

  /* Mini-knapper */
  smallBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  smallBtnText: { color: "#fff", fontWeight: "800", fontSize: 11 },
  approveBtn: { backgroundColor: "#1f7a33" },
  rejectBtn: { backgroundColor: "#9aa0a6" },
  deleteMiniBtn: { backgroundColor: "#C62828" },
  btnDisabled: { opacity: 0.6 },

  /* Kalender */
  calHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 6,
    marginBottom: 6,
  },
  calNavBtn: {
    width: 34,
    height: 30,
    borderRadius: 8,
    backgroundColor: "#f3f5f7",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#e2e8f0",
  },
  calNavText: { color: "#131921", fontWeight: "900", fontSize: 16 },
  calMonthLabel: { color: "#131921", fontWeight: "900", fontSize: 14 },
  calWeekdays: { flexDirection: "row", justifyContent: "space-between", marginBottom: 4 },
  calWeekdayText: {
    width: "14.2857%",
    textAlign: "center",
    color: "#131921",
    fontWeight: "800",
    fontSize: 11,
    opacity: 0.75,
  },
  calGrid: { borderRadius: 10, overflow: "hidden", backgroundColor: "#f8fafc" },
  calRow: { flexDirection: "row" },
  calCell: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#e2e8f0",
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
  },
  calCellDim: { backgroundColor: "#f1f5f9" },
  calCellActive: { backgroundColor: "#131921" },
  calDayNum: { color: "#1d2b3a", fontWeight: "700", fontSize: 13 },
  calDot: { position: "absolute", bottom: 6, width: 6, height: 6, borderRadius: 3, backgroundColor: "#fff" },

  /* Luk-knap */
  blackCloseSquare: {
    position: "absolute",
    top: 10,
    right: 8,
    width: 30,
    height: 30,
    borderRadius: 8,
    backgroundColor: "#000",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 10,
  },
  blackCloseSquareText: { color: "#fff", fontSize: 18, fontWeight: "900" },

  /* Event-detaljer */
  detailImage: { width: "100%", height: 220, borderRadius: 12, backgroundColor: "#f1f1f1", marginBottom: 8 },
  detailTitle: { fontSize: 14, fontWeight: "900", color: "#131921" },
  detailRange: { fontSize: 11, color: "#000", opacity: 0.85, marginTop: 2 },
  detailMeta: { fontSize: 11, color: "#000", opacity: 0.85, marginTop: 2 },

  /* Billeder – preview række */
  imagesPreviewRow: { flexDirection: "row", gap: 8, marginTop: 8 },
  imagesPreviewThumb: {
    width: 100,
    height: 100,
    borderRadius: 8,
    backgroundColor: "#f0f0f0",
  },
});