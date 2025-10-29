// hooks/useOpslag.tsx
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Location from "expo-location";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Alert, Linking, Platform } from "react-native";
import { supabase } from "../utils/supabase";

export type Post = {
  id: string;
  created_at: string;
  expires_at?: string | null;   // ⬅️ NYT: bruges til udløb
  overskrift: string;
  omraade: string | null;
  text: string;
  images: string[];
  image_url: string | null;
  image_urls?: string[] | null;
  user_id: string;
  latitude: number | null;
  longitude: number | null;
  kategori: string | null;
};

type UserLocation = { latitude: number; longitude: number };

/* ───────── helpers/konstanter ───────── */
const isWeb = () => Platform.OS === "web";

async function storageGet(key: string) {
  if (isWeb()) {
    try { if (typeof window !== "undefined") return window.localStorage.getItem(key); } catch {}
    return null;
  }
  try { return await AsyncStorage.getItem(key); } catch { return null; }
}

async function storageSet(key: string, value: string) {
  if (isWeb()) {
    try { if (typeof window !== "undefined") window.localStorage.setItem(key, value); } catch {}
    return;
  }
  try { await AsyncStorage.setItem(key, value); } catch {}
}

export function distanceInKm(lat1: number, lon1: number, lat2: number, lon2: number) {
  const toRad = (v: number) => (v * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export const KATEGORIER = [
  "Alle kategorier",
  "Værktøj",
  "Arbejde tilbydes",
  "Affald",
  "Mindre ting",
  "Større ting",
  "Hjælp søges",
  "Hjælp tilbydes",
  "Byttes",
  "Udlejning",
  "Sælges",
  "Andet",
] as const;

const K_RADIUS = "liguster_radius";
const K_LOC_ASKED_AT = "lig:locAskedAt";
const LOC_SNOOZE_MS = 14 * 24 * 60 * 60 * 1000;

/* Udløbsregler (matcher UI) */
const EXPIRES_DAYS = 14;
const MS_DAY = 24 * 60 * 60 * 1000;

/* ───────── hoved-hook ───────── */
export function useOpslag() {
  const [allPosts, setAllPosts] = useState<Post[]>([]);
  const [userId, setUserId] = useState<string | null>(null);
  const [userLocation, setUserLocation] = useState<UserLocation | null>(null);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [radius, setRadius] = useState(3);
  const [kategoriFilter, setKategoriFilter] = useState<string>(KATEGORIER[0]);

  useEffect(() => {
    let mounted = true;
    supabase.auth.getUser().then(({ data, error }) => {
      if (!mounted) return;
      if (error) console.warn("Kunne ikke hente user:", error.message);
      setUserId(data?.user?.id ?? null);
    });
    return () => { mounted = false; };
  }, []);

  // Indlæs radius + forsøg stille lokation (kun hvis allerede GRANTED)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const savedRadius = await storageGet(K_RADIUS);
      if (!cancelled && savedRadius) setRadius(Number(savedRadius));

      if (isWeb()) {
        try {
          if (typeof navigator !== "undefined" && "geolocation" in navigator) {
            navigator.geolocation.getCurrentPosition(
              (pos) => !cancelled && setUserLocation({ latitude: pos.coords.latitude, longitude: pos.coords.longitude }),
              () => {},
              { enableHighAccuracy: false, maximumAge: 60_000, timeout: 8_000 }
            );
          }
        } catch {}
        return;
      }

      try {
        const perm = await Location.getForegroundPermissionsAsync();
        if (perm.status === "granted") {
          const loc = await Location.getCurrentPositionAsync({
            accuracy: Location.Accuracy.Balanced,
            maximumAge: 60_000,
          });
          if (!cancelled) setUserLocation({ latitude: loc.coords.latitude, longitude: loc.coords.longitude });
        }
      } catch (e) {
        console.warn("Silent location fetch failed:", (e as any)?.message);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Hent opslag (inkl. expires_at) og filtrér udløbne
  const fetchPosts = useCallback(async () => {
    setLoading(true);

    const { data, error } = await supabase
      .from("posts")
      .select(`
        id, created_at, expires_at,
        overskrift, omraade, text, kategori,
        image_url, image_urls, images,
        user_id, latitude, longitude
      `)
      .order("created_at", { ascending: false });

    if (error) {
      console.warn("Kunne ikke hente opslag:", error.message);
      setAllPosts([]);
      setLoading(false);
      return;
    }

    const now = Date.now();

    const rows: Post[] = (data ?? [])
      .map((p: any) => {
        const arr = Array.isArray(p.images)
          ? p.images
          : Array.isArray(p.image_urls)
          ? p.image_urls
          : p.image_url
          ? [p.image_url]
          : [];
        const normalized = (arr || []).filter(Boolean);

        return {
          id: p.id,
          created_at: p.created_at,
          expires_at: p.expires_at ?? null, // ⬅️ behold
          overskrift: p.overskrift,
          omraade: p.omraade ?? null,
          text: p.text,
          images: normalized,
          image_url: p.image_url ?? normalized[0] ?? null,
          image_urls: Array.isArray(p.image_urls) ? p.image_urls : normalized,
          user_id: p.user_id,
          latitude: p.latitude ?? null,
          longitude: p.longitude ?? null,
          kategori: p.kategori ?? null,
        } as Post;
      })
      // filtrér udløbne: brug expires_at; fallback = created_at + 14 dage
      .filter((p) => {
        const exp = p.expires_at ? Date.parse(p.expires_at) : Number.NaN;
        const created = Date.parse(p.created_at);
        const fallbackExp = Number.isFinite(created) ? created + EXPIRES_DAYS * MS_DAY : Number.NaN;
        const effective = Number.isFinite(exp) ? exp : fallbackExp;
        return Number.isFinite(effective) ? effective > now : true;
      });

    setAllPosts(rows);
    setLoading(false);
  }, []);

  // Første load
  useEffect(() => { fetchPosts(); }, [fetchPosts]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchPosts();
    setRefreshing(false);
  }, [fetchPosts]);

  // Opret opslag – sæt expires_at 14 dage frem, så alt er konsistent
  const createPost = useCallback(
    async (postData: Partial<Post> & { images?: string[] }) => {
      const { data: userData, error: userErr } = await supabase.auth.getUser();
      const uid = userData?.user?.id ?? null;
      if (userErr || !uid) {
        console.warn("Du skal være logget ind for at oprette et opslag.");
        return false;
      }

      const { id: _a, user_id: _b, created_at: _c, image_url: _d, image_urls: _e, expires_at: _f, ...rest } = postData;
      const imgs = Array.isArray(rest.images) ? rest.images.filter(Boolean) : [];

      const payload = {
        overskrift: (rest.overskrift ?? "").trim(),
        text: (rest.text ?? "").trim(),
        omraade: rest.omraade ?? null,
        kategori: rest.kategori ?? null,
        latitude: rest.latitude ?? null,
        longitude: rest.longitude ?? null,

        images: imgs.length ? imgs : null,
        image_urls: imgs.length ? imgs : null,
        image_url: imgs[0] ?? null,

        user_id: uid,

        // ⬅️ nyt: sæt udløb
        expires_at: new Date(Date.now() + EXPIRES_DAYS * MS_DAY).toISOString(),
      };

      const { error } = await supabase.from("posts").insert([payload]);
      if (error) {
        console.warn("Kunne ikke oprette opslag:", error.message);
        return false;
      }
      await fetchPosts();
      return true;
    },
    [fetchPosts]
  );

  const handleRadiusChange = useCallback(async (v: number) => {
    setRadius(v);
    await storageSet(K_RADIUS, String(v));
  }, []);

  /* ───────── Manuel lokations-anmodning ───────── */
  const canAskLocationRef = useRef(true);

  const requestLocationOnce = useCallback(async (): Promise<UserLocation | null> => {
    try {
      if (isWeb()) {
        return new Promise<UserLocation | null>((resolve) => {
          try {
            if (typeof navigator === "undefined" || !("geolocation" in navigator)) {
              resolve(null);
              return;
            }
            navigator.geolocation.getCurrentPosition(
              (pos) => {
                const loc = { latitude: pos.coords.latitude, longitude: pos.coords.longitude };
                setUserLocation(loc);
                resolve(loc);
              },
              () => {
                Alert.alert("Lokation ikke tilladt", "Vi kunne ikke få adgang til din lokation.");
                resolve(null);
              },
              { enableHighAccuracy: true, maximumAge: 0, timeout: 10_000 }
            );
          } catch {
            resolve(null);
          }
        });
      }

      const lastAskedRaw = await storageGet(K_LOC_ASKED_AT);
      const lastAsked = Number(lastAskedRaw);
      const snoozed = Number.isFinite(lastAsked) && Date.now() - lastAsked < LOC_SNOOZE_MS;

      if (!canAskLocationRef.current) return null;
      canAskLocationRef.current = false;

      const before = await Location.getForegroundPermissionsAsync();
      let status = before.status;
      let askedNow = false;

      if (status !== "granted" && !snoozed) {
        const res = await Location.requestForegroundPermissionsAsync();
        status = res.status;
        askedNow = true;

        if (status !== "granted" && res.canAskAgain === false) {
          Alert.alert(
            "Lokation er blokeret",
            "Tillad lokation under Indstillinger → Liguster → Lokation.",
            [{ text: "Åbn indstillinger", onPress: () => Linking.openSettings() }]
          );
        }
      }

      if (askedNow) await storageSet(K_LOC_ASKED_AT, String(Date.now()));

      if (status !== "granted") {
        Alert.alert("Lokation ikke tilladt", "Vi kunne ikke få adgang til din lokation.");
        return null;
      }

      const loc = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
        maximumAge: 0,
      });

      const ret = { latitude: loc.coords.latitude, longitude: loc.coords.longitude };
      setUserLocation(ret);
      return ret;
    } catch (e) {
      console.warn("requestLocationOnce error:", (e as any)?.message);
      Alert.alert("Fejl", "Kunne ikke hente din lokation.");
      return null;
    } finally {
      canAskLocationRef.current = true;
    }
  }, []);

  // Filtrering
  const filteredPosts = useMemo(() => {
    const s = searchQuery.trim().toLowerCase();

    return allPosts.filter((p) => {
      const matchesSearch =
        !s ||
        p.overskrift?.toLowerCase().includes(s) ||
        (p.omraade ?? "").toLowerCase().includes(s) ||
        p.text?.toLowerCase().includes(s);

      const matchesKategori = kategoriFilter === KATEGORIER[0] || p.kategori === kategoriFilter;

      if (userLocation && p.latitude != null && p.longitude != null) {
        const dist = distanceInKm(
          userLocation.latitude,
          userLocation.longitude,
          p.latitude,
          p.longitude
        );
        return matchesSearch && matchesKategori && dist <= radius;
      }
      return matchesSearch && matchesKategori;
    });
  }, [allPosts, searchQuery, kategoriFilter, radius, userLocation]);

  return {
    // data
    userId,
    userLocation,
    loading,
    refreshing,
    filteredPosts,
    // søgning/filtre
    searchQuery,
    setSearchQuery,
    radius,
    handleRadiusChange,
    kategoriFilter,
    setKategoriFilter,
    // actions
    onRefresh,
    createPost,
    // utils
    distanceInKm,
    // manuel lokations-anmodning
    requestLocationOnce,
  };
}