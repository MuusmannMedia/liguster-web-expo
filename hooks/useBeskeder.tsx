// hooks/useBeskeder.tsx
import { useCallback, useEffect, useState } from 'react';
import { Alert } from 'react-native';
import { supabase } from '../utils/supabase';

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
  const n = (u?.name || '').trim() || (u as any)?.username?.trim();
  if (n) return n;
  const email = u?.email || '';
  return email ? email.split('@')[0] : 'Ukendt';
}

export default function useBeskeder() {
  const [userId, setUserId] = useState<string | null>(null);
  const [threads, setThreads] = useState<Thread[]>([]);
  const [loading, setLoading] = useState(true);

  // Hent brugerens ID
  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      if (data?.user?.id) setUserId(data.user.id);
      else setLoading(false);
    })();
  }, []);

  const fetchThreads = useCallback(async () => {
    if (!userId) return;
    setLoading(true);

    // Hent ALLE beskeder der involverer brugeren – seneste først
    const { data, error } = await supabase
      .from('messages')
      .select(`
        id, thread_id, text, created_at, sender_id, receiver_id, post_id,
        posts (id, overskrift, omraade)
      `)
      .or(`sender_id.eq.${userId},receiver_id.eq.${userId}`)
      .order('created_at', { ascending: false });

    if (error) {
      Alert.alert('Fejl', 'Kunne ikke hente beskeder: ' + error.message);
      setThreads([]);
      setLoading(false);
      return;
    }

    // Tag kun SENESTE besked per thread_id
    const latestByThread: Record<string, Thread> = {};
    for (const row of (data || []) as Thread[]) {
      if (!latestByThread[row.thread_id]) latestByThread[row.thread_id] = row;
    }
    let latest = Object.values(latestByThread);

    // Find direkte tråde (post_id = null) og slå "anden bruger" op
    const directNeedingUser: Array<{ t: Thread; otherId: string }> = [];
    for (const t of latest) {
      if (!t.post_id) {
        const otherId = t.sender_id === userId ? t.receiver_id : t.sender_id;
        if (otherId) directNeedingUser.push({ t, otherId });
      }
    }

    if (directNeedingUser.length) {
      const uniqUserIds = Array.from(new Set(directNeedingUser.map(x => x.otherId)));
      const { data: usersData, error: usersErr } = await supabase
        .from('users')
        .select('id, name, username, email')
        .in('id', uniqUserIds);

      // Map brugere for hurtig lookup
      const usersMap = new Map<string, { id: string; name?: string | null; username?: string | null; email?: string | null }>();
      if (!usersErr) {
        (usersData || []).forEach(u => usersMap.set(u.id, u));
      }

      // Udfyld syntetisk posts-objekt, så UI kan vise titel/område som normalt
      latest = latest.map(t => {
        if (t.post_id) return t;
        const otherId = t.sender_id === userId ? t.receiver_id : t.sender_id;
        const u = usersMap.get(otherId || '');
        const title = displayNameFromUser(u) || 'Direkte besked';
        return {
          ...t,
          posts: {
            id: otherId || '',
            overskrift: title,     // ← bliver brugt som “titel” i din liste
            omraade: '',           // ← ingen område for direkte chat
          },
        };
      });
    }

    // Sørg for korrekt sortering (seneste øverst)
    latest.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

    setThreads(latest);
    setLoading(false);
  }, [userId]);

  useEffect(() => {
    if (userId) fetchThreads();
  }, [userId, fetchThreads]);

  // Slet hele samtalen (alle messages i thread_id)
  const deleteThread = (threadId: string) => {
    Alert.alert(
      'Slet samtale',
      'Er du sikker på, du vil slette denne samtale? Dette kan ikke fortrydes.',
      [
        { text: 'Annuller', style: 'cancel' },
        {
          text: 'Slet',
          style: 'destructive',
          onPress: async () => {
            const { error } = await supabase.from('messages').delete().eq('thread_id', threadId);
            if (error) {
              Alert.alert('Fejl', 'Kunne ikke slette samtalen: ' + error.message);
              return;
            }
            setThreads(prev => prev.filter(t => t.thread_id !== threadId));
          },
        },
      ],
    );
  };

  return {
    userId,
    threads,
    loading,
    deleteThread,
    refresh: fetchThreads,
  };
}