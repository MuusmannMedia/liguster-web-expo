// hooks/useBeskeder.tsx
import { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, Platform } from "react-native";
import { supabase } from "@/utils/supabase"; // <- brug "@/..." alias. Alternativt: "../utils/supabase"

export type Thread = {
  id: string;
  thread_id: string;
  text: string;
  created_at: string;
  sender_id: string;
  receiver_id: string;
  post_id: string | null;
  posts: {
    id: string;
    overskrift: string;
    omraade: string;
  } | null;
};

function displayNameFromUser(u?: { name?: string | null; username?: string | null; email?: string | null }) {
  const n = (u?.name || "")?.trim() || (u as any)?.username?.trim();
  if (n) return n;
  const email = u?.email || "";
  return email ? email.split("@")[0] : "Ukendt";
}

function safeAlert(title: string, message: string) {
  if (Platform.OS === "web") {
    // Alert i RN Web kan være “no-op” i nogle setups – log i det mindste fejl
    // eslint-disable-next-line no-console
    console.error(`[${title}] ${message}`);
  } else {
    Alert.alert(title, message);
  }
}

export default function useBeskeder() {
  const [userId, setUserId] = useState<string | null>(null);
  const [threads, setThreads] = useState<Thread[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  // Init + hold øje med auth-state
  useEffect(() => {
    let mounted = true;

    (async () => {
      const { data } = await supabase.auth.getUser();
      if (!mounted) return;
      if (data?.user?.id) {
        setUserId(data.user.id);
      } else {
        setUserId(null);
        setLoading(false);
      }
    })();

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!mounted) return;
      const uid = session?.user?.id ?? null;
      setUserId(uid);
      if (!uid) setLoading(false);
    });

    return () => {
      mounted = false;
      sub?.subscription?.unsubscribe();
    };
  }, []);

  const fetchThreads = useCallback(async () => {
    if (!userId) {
      setThreads([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      // Hent ALLE beskeder der involverer brugeren – seneste først
      const { data, error } = await supabase
        .from("messages")
        .select(
          `
          id, thread_id, text, created_at, sender_id, receiver_id, post_id,
          posts (id, overskrift, omraade)
        `
        )
        .or(`sender_id.eq.${userId},receiver_id.eq.${userId}`)
        .order("created_at", { ascending: false });

      if (error) {
        safeAlert("Fejl", "Kunne ikke hente beskeder: " + error.message);
        setThreads([]);
        setLoading(false);
        return;
      }

      // Seneste besked pr. thread_id
      const latestByThread: Record<string, Thread> = {};
      for (const row of (data || []) as Thread[]) {
        if (!latestByThread[row.thread_id]) latestByThread[row.thread_id] = row;
      }
      let latest = Object.values(latestByThread);

      // Direkte tråde (post_id = null): slå “anden bruger” op og synth 'posts'
      const directUserIds = Array.from(
        new Set(
          latest
            .filter((t) => !t.post_id)
            .map((t) => (t.sender_id === userId ? t.receiver_id : t.sender_id))
            .filter(Boolean) as string[]
        )
      );

      if (directUserIds.length) {
        const { data: usersData, error: usersErr } = await supabase
          .from("users")
          .select("id, name, username, email")
          .in("id", directUserIds);

        const usersMap = new Map<
          string,
          { id: string; name?: string | null; username?: string | null; email?: string | null }
        >();

        if (!usersErr) {
          (usersData || []).forEach((u) => usersMap.set(u.id, u));
        }

        latest = latest.map((t) => {
          if (t.post_id) return t;
          const otherId = t.sender_id === userId ? t.receiver_id : t.sender_id;
          const u = otherId ? usersMap.get(otherId) : undefined;
          const title = displayNameFromUser(u) || "Direkte besked";
          return {
            ...t,
            posts: {
              id: otherId || "",
              overskrift: title,
              omraade: "",
            },
          };
        });
      }

      // Sorter seneste øverst
      latest.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

      setThreads(latest);
    } catch (e: any) {
      safeAlert("Fejl", "Uventet fejl ved hentning af beskeder: " + (e?.message || String(e)));
      setThreads([]);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  // Hent når vi har userId
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!userId) return;
      await fetchThreads();
      if (cancelled) return;
    })();
    return () => {
      cancelled = true;
    };
  }, [userId, fetchThreads]);

  // Slet hele samtalen (alle messages i thread_id)
  const deleteThread = useCallback((threadId: string) => {
    if (!threadId) return;
    Alert.alert(
      "Slet samtale",
      "Er du sikker på, du vil slette denne samtale? Dette kan ikke fortrydes.",
      [
        { text: "Annuller", style: "cancel" },
        {
          text: "Slet",
          style: "destructive",
          onPress: async () => {
            const { error } = await supabase.from("messages").delete().eq("thread_id", threadId);
            if (error) {
              safeAlert("Fejl", "Kunne ikke slette samtalen: " + error.message);
              return;
            }
            setThreads((prev) => prev.filter((t) => t.thread_id !== threadId));
          },
        },
      ]
    );
  }, []);

  return useMemo(
    () => ({
      userId,
      threads,
      loading,
      deleteThread,
      refresh: fetchThreads,
    }),
    [userId, threads, loading, deleteThread, fetchThreads]
  );
}