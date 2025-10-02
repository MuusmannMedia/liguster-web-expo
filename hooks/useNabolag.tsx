// hooks/useNabolag.tsx
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Platform } from 'react-native';
import { supabase } from '../utils/supabase';

export type Post = {
  id: string;
  created_at: string;
  overskrift: string;
  omraade: string | null;
  text: string;
  // I appen bruger vi konsekvent et array (kan være tomt)
  images: string[];
  // Beholder enkeltfelt som convenience/fallback
  image_url: string | null;
  user_id: string;
  latitude: number | null;
  longitude: number | null;
  kategori: string | null;
};

type UserLocation = { latitude: number; longitude: number };

/* ───────── helpers ───────── */
const isWeb = () => Platform.OS === 'web';

function safeAlert(title: string, msg: string) {
  if (isWeb()) console.warn(`${title}: ${msg}`);
  else Alert.alert(title, msg);
}

async function storageGet(key: string) {
  if (isWeb()) {
    try {
      if (typeof window !== 'undefined') return window.localStorage.getItem(key);
    } catch {}
    return null;
  }
  try { return await AsyncStorage.getItem(key); } catch { return null; }
}

async function storageSet(key: string, value: string) {
  if (isWeb()) {
    try { if (typeof window !== 'undefined') window.localStorage.setItem(key, value); } catch {}
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

/* ───────── konstanter ───────── */
export const KATEGORIER = [
  'Alle kategorier',
  'Værktøj',
  'Arbejde tilbydes',
  'Affald',
  'Mindre ting',
  'Større ting',
  'Hjælp søges',
  'Hjælp tilbydes',
  'Byttes',
  'Udlejning',
  'Sælges',
  'Andet',
] as const;

/* ───────── hoved-hook ───────── */
export function useNabolag() {
  const [allPosts, setAllPosts] = useState<Post[]>([]);
  const [userId, setUserId] = useState<string | null>(null);
  const [userLocation, setUserLocation] = useState<UserLocation | null>(null);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [radius, setRadius] = useState(3);
  const [kategoriFilter, setKategoriFilter] = useState<string>(KATEGORIER[0]);

  // Track user-id (til visning m.m.). Til INSERT bruger vi altid frisk getUser() igen.
  useEffect(() => {
    let mounted = true;
    supabase.auth.getUser().then(({ data, error }) => {
      if (!mounted) return;
      if (error) console.warn('Kunne ikke hente user:', error.message);
      setUserId(data?.user?.id ?? null);
    });
    return () => { mounted = false; };
  }, []);

  // Radius + lokation
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const savedRadius = await storageGet('liguster_radius');
      if (savedRadius && !cancelled) setRadius(Number(savedRadius));

      if (isWeb()) {
        try {
          if (typeof window === 'undefined' || !('geolocation' in (navigator ?? {}))) return;
          navigator.geolocation.getCurrentPosition(
            (pos) => {
              if (cancelled) return;
              setUserLocation({ latitude: pos.coords.latitude, longitude: pos.coords.longitude });
            },
            () => {},
            { enableHighAccuracy: false, maximumAge: 60_000, timeout: 10_000 }
          );
        } catch {}
        return;
      }

      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') return;
        const loc = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
          maximumAge: 60_000,
        });
        if (!cancelled) {
          setUserLocation({ latitude: loc.coords.latitude, longitude: loc.coords.longitude });
        }
      } catch {}
    })();
    return () => { cancelled = true; };
  }, []);

  // Hent opslag (normaliserer til images[])
  const fetchPosts = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('posts')
      .select(
        'id, created_at, overskrift, omraade, text, image_url, image_urls, images, user_id, latitude, longitude, kategori'
      )
      .order('created_at', { ascending: false });

    if (error) {
      safeAlert('Fejl', 'Kunne ikke hente opslag: ' + error.message);
      setAllPosts([]);
    } else {
      const rows: Post[] = (data ?? []).map((p: any) => {
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
          overskrift: p.overskrift,
          omraade: p.omraade ?? null,
          text: p.text,
          images: normalized,
          image_url: p.image_url ?? normalized[0] ?? null,
          user_id: p.user_id,
          latitude: p.latitude ?? null,
          longitude: p.longitude ?? null,
          kategori: p.kategori ?? null,
        };
      });
      setAllPosts(rows);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchPosts();
  }, [fetchPosts]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchPosts();
    setRefreshing(false);
  }, [fetchPosts]);

  // Opret opslag – henter FRISK uid for at matche RLS WITH CHECK (user_id = auth.uid())
  const createPost = useCallback(
    async (postData: Partial<Post> & { images?: string[] }) => {
      // Hent bruger ID direkte fra session lige nu (må ikke stole på state)
      const { data: userData, error: userErr } = await supabase.auth.getUser();
      const uid = userData?.user?.id ?? null;
      if (userErr || !uid) {
        safeAlert('Fejl', 'Du skal være logget ind for at oprette et opslag.');
        return false;
      }

      // Drop felter der ikke må overskrives manuelt
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { id: _a, user_id: _b, created_at: _c, image_url: _d, ...rest } = postData;

      const imgs = Array.isArray(rest.images) ? rest.images.filter(Boolean) : [];
      const payload = {
        ...rest,
        images: imgs.length ? imgs : null,      // jsonb i DB
        image_url: imgs[0] ?? null,            // convenience (forside)
        user_id: uid,                          // matcher RLS
      };

      const { error } = await supabase.from('posts').insert([payload]);
      if (error) {
        safeAlert('Fejl', 'Kunne ikke oprette opslag: ' + error.message);
        return false;
      }
      await fetchPosts();
      return true;
    },
    [fetchPosts]
  );

  const handleRadiusChange = useCallback(async (v: number) => {
    setRadius(v);
    await storageSet('liguster_radius', String(v));
  }, []);

  // Filtrering
  const filteredPosts = useMemo(() => {
    const s = searchQuery.trim().toLowerCase();

    return allPosts.filter((p) => {
      const matchesSearch =
        !s ||
        p.overskrift?.toLowerCase().includes(s) ||
        (p.omraade ?? '').toLowerCase().includes(s) ||
        p.text?.toLowerCase().includes(s);

      const matchesKategori =
        kategoriFilter === KATEGORIER[0] || p.kategori === kategoriFilter;

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
  };
}