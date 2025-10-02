// hooks/useBeskeder.tsx

import { useCallback, useEffect, useState } from 'react';
import { Alert } from 'react-native';
import { supabase } from '../utils/supabase';

// Definerer en type for en besked-tråd for at gøre koden mere robust
export type Thread = {
  id: string;
  thread_id: string;
  text: string;
  created_at: string;
  sender_id: string;
  receiver_id: string;
  post_id: string;
  posts: {
    id: string;
    overskrift: string;
    omraade: string;
  } | null;
};

/**
 * En custom hook, der håndterer al logik for Beskeder-skærmen.
 */
export default function useBeskeder() {
  const [userId, setUserId] = useState<string | null>(null);
  const [threads, setThreads] = useState<Thread[]>([]);
  const [loading, setLoading] = useState(true);

  // Hent brugerens ID, når hook'en initialiseres
  useEffect(() => {
    const getUser = async () => {
      const { data } = await supabase.auth.getUser();
      if (data.user) {
        setUserId(data.user.id);
      } else {
        setLoading(false); // Stop loading hvis ingen bruger er logget ind
      }
    };
    getUser();
  }, []);

  // Funktion til at hente og gruppere besked-tråde
  const fetchThreads = useCallback(async () => {
    if (!userId) return;
    setLoading(true);

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
    } else {
      // Grupper beskeder for at vise kun den seneste fra hver tråd
      const threadsMap: { [key: string]: Thread } = {};
      (data || []).forEach((msg) => {
        if (!threadsMap[msg.thread_id]) {
          threadsMap[msg.thread_id] = msg as Thread;
        }
      });
      setThreads(Object.values(threadsMap));
    }
    setLoading(false);
  }, [userId]);

  // Hent tråde, så snart vi har et bruger-ID
  useEffect(() => {
    if (userId) {
      fetchThreads();
    }
  }, [userId, fetchThreads]);

  // Funktion til at slette en hel besked-tråd
  const deleteThread = (threadId: string) => {
    Alert.alert(
      "Slet samtale",
      "Er du sikker på, du vil slette denne samtale? Dette kan ikke fortrydes.",
      [
        { text: "Annuller", style: "cancel" },
        {
          text: "Slet",
          style: "destructive",
          onPress: async () => {
            const { error } = await supabase.from('messages').delete().eq('thread_id', threadId);
            if (error) {
              Alert.alert('Fejl', 'Kunne ikke slette samtalen: ' + error.message);
            } else {
              // Opdater UI ved at fjerne den slettede tråd fra den lokale state
              setThreads(prevThreads => prevThreads.filter(t => t.thread_id !== threadId));
            }
          }
        }
      ]
    );
  };

  return {
    userId,
    threads,
    loading,
    deleteThread,
    refresh: fetchThreads, // Eksporter en funktion til at gen-hente
  };
}
