// hooks/useMineOpslag.tsx
import { useCallback, useEffect, useState } from "react";
import { Alert } from "react-native";
import { supabase } from "../utils/supabase";
import type { Post } from "./useOpslag";

/** Konsistent billede-setup fra DB-rækker */
function normalizeImages(row: any): { images: string[]; image_url: string | null } {
  const arr = Array.isArray(row?.images)
    ? row.images
    : Array.isArray(row?.image_urls)
    ? row.image_urls
    : row?.image_url
    ? [row.image_url]
    : [];
  const images = (arr || []).filter(Boolean);
  const image_url = row?.image_url ?? images[0] ?? null;
  return { images, image_url };
}

export function useMineOpslag() {
  const [userId, setUserId] = useState<string | null>(null);
  const [mineOpslag, setMineOpslag] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);

  // Hent aktuel bruger ved mount + hold øje med auth-ændringer
  useEffect(() => {
    let mounted = true;

    (async () => {
      const { data } = await supabase.auth.getUser();
      if (!mounted) return;
      setUserId(data?.user?.id ?? null);
      setLoading(false);
    })();

    const { data: auth } = supabase.auth.onAuthStateChange((_e, sess) => {
      setUserId(sess?.user?.id ?? null);
    });

    return () => {
      mounted = false;
      auth.subscription?.unsubscribe();
    };
  }, []);

  // Hent brugerens egne opslag (med normalisering)
  const fetchMineOpslag = useCallback(async () => {
    if (!userId) {
      setMineOpslag([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    const { data, error } = await supabase
      .from("posts")
      .select(`
        id, created_at, expires_at,
        overskrift, omraade, text, kategori,
        image_url, image_urls, images, image_paths,
        user_id, latitude, longitude
      `)
      .eq("user_id", userId)
      .order("created_at", { ascending: false });

    if (error) {
      Alert.alert("Fejl", "Kunne ikke hente dine opslag: " + error.message);
      setMineOpslag([]);
      setLoading(false);
      return;
    }

    const rows: Post[] = (data ?? []).map((p: any) => {
      const { images, image_url } = normalizeImages(p);
      return {
        id: p.id,
        created_at: p.created_at,
        expires_at: p.expires_at ?? null, // ⬅️ vigtig
        overskrift: p.overskrift,
        omraade: p.omraade ?? null,
        text: p.text,
        images,
        image_url,
        user_id: p.user_id,
        latitude: p.latitude ?? null,
        longitude: p.longitude ?? null,
        kategori: p.kategori ?? null,
      } as Post;
    });

    setMineOpslag(rows);
    setLoading(false);
  }, [userId]);

  useEffect(() => {
    if (userId) fetchMineOpslag();
  }, [userId, fetchMineOpslag]);

  /** Helper til write: normalisér images/image_url før INSERT/UPDATE */
  function normalizeForWrite(
    data: Partial<Post> & { images?: string[]; image_url?: string | null; image_paths?: string[] }
  ) {
    const imgs = Array.isArray(data.images) ? data.images.filter(Boolean) : [];
    const paths = Array.isArray((data as any).image_paths)
      ? (data as any).image_paths.filter(Boolean)
      : undefined;

    const base: any = {
      ...data,
      images: imgs.length ? imgs : null,              // jsonb i DB
      image_url: data.image_url ?? (imgs[0] ?? null), // convenience
    };
    if (paths) base.image_paths = paths.length ? paths : null;
    return base;
  }

  // Opret opslag
  const createPost = async (postData: Partial<Post> & { images?: string[]; image_paths?: string[] }) => {
    const { data: userData, error: userErr } = await supabase.auth.getUser();
    const uid = userData?.user?.id ?? null;
    if (userErr || !uid) {
      Alert.alert("Fejl", "Du skal være logget ind for at oprette et opslag.");
      return false;
    }

    const { id: _drop, user_id: _drop2, created_at: _drop3, ...rest } = postData;
    const payload = normalizeForWrite(rest);

    const { error } = await supabase.from("posts").insert([{ ...payload, user_id: uid }]);
    if (error) {
      Alert.alert("Fejl", "Kunne ikke oprette opslag: " + error.message);
      return false;
    }
    await fetchMineOpslag();
    return true;
  };

  // Opdatér opslag
  const updatePost = async (postData: Partial<Post> & { id: string; image_paths?: string[] }) => {
    const { id, ...rest } = postData;
    const payload = normalizeForWrite(rest as any);

    const { error } = await supabase.from("posts").update(payload).eq("id", id);
    if (error) {
      Alert.alert("Fejl", "Kunne ikke rette opslag: " + error.message);
      return false;
    }
    await fetchMineOpslag();
    return true;
  };

  // Forlæng et opslag med N dage (default 7)
  const extendPostByDays = async (post: Post, days: number = 7) => {
    try {
      const base = Date.parse(post.expires_at ?? post.created_at);
      const fromMs = Number.isFinite(base) ? base : Date.now();
      const newExpires = new Date(fromMs + days * 24 * 60 * 60 * 1000).toISOString();

      const { error } = await supabase
        .from("posts")
        .update({ expires_at: newExpires })
        .eq("id", post.id);

      if (error) throw error;

      await fetchMineOpslag(); // hent friske data
      return true;
    } catch (e: any) {
      Alert.alert("Fejl", e?.message ?? "Kunne ikke forlænge opslag.");
      return false;
    }
  };

  // Slet opslag (Storage-oprydning klares af Edge Function)
  const deletePost = (postId: string) => {
    Alert.alert("Slet opslag", "Er du sikker på, du vil slette dette opslag permanent?", [
      { text: "Annuller", style: "cancel" },
      {
        text: "Slet",
        style: "destructive",
        onPress: async () => {
          const { error } = await supabase.from("posts").delete().eq("id", postId);
          if (error) {
            Alert.alert("Fejl", "Kunne ikke slette opslag: " + error.message);
          } else {
            await fetchMineOpslag();
          }
        },
      },
    ]);
  };

  return {
    userId,
    mineOpslag,
    loading,
    createPost,
    updatePost,
    deletePost,
    extendPostByDays,        // ⬅️ NY – brug i UI til “FORLÆNG 1 UGE”
    refetchMineOpslag: fetchMineOpslag,
  };
}