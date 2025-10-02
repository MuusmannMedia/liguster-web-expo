// hooks/useMineOpslag.tsx

import { useCallback, useEffect, useState } from 'react';
import { Alert } from 'react-native';
import { supabase } from '../utils/supabase';
import { Post } from './useNabolag'; // Genbruger Post-typen fra vores anden hook

/**
 * En custom hook, der håndterer al logik for "Mine Opslag"-skærmen.
 */
export function useMineOpslag() {
  const [userId, setUserId] = useState<string | null>(null);
  const [mineOpslag, setMineOpslag] = useState<Post[]>([]);
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

  // Funktion til at hente brugerens egne opslag
  const fetchMineOpslag = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    const { data, error } = await supabase
      .from('posts')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) {
      Alert.alert('Fejl', 'Kunne ikke hente dine opslag: ' + error.message);
    } else {
      setMineOpslag(data || []);
    }
    setLoading(false);
  }, [userId]);

  // Hent opslag, så snart vi har et bruger-ID
  useEffect(() => {
    if (userId) {
      fetchMineOpslag();
    }
  }, [userId, fetchMineOpslag]);

  // Funktion til at oprette et nyt opslag
  const createPost = async (postData) => {
    if (!userId) return false;
    // --- RETTELSE HER ---
    // Vi fjerner 'id' fra objektet, før vi sender det til databasen.
    const { id, ...insertData } = postData;
    const { error } = await supabase.from('posts').insert([{ ...insertData, user_id: userId }]);
    if (error) {
      Alert.alert('Fejl', 'Kunne ikke oprette opslag: ' + error.message);
      return false;
    }
    await fetchMineOpslag(); // Gen-hent listen for at vise det nye opslag
    return true;
  };

  // Funktion til at opdatere et eksisterende opslag
  const updatePost = async (postData: Partial<Post> & { id: string }) => {
    const { id, ...updateData } = postData;
    const { error } = await supabase.from('posts').update(updateData).eq('id', id);
    if (error) {
      Alert.alert('Fejl', 'Kunne ikke rette opslag: ' + error.message);
      return false;
    }
    await fetchMineOpslag(); // Gen-hent listen for at vise ændringerne
    return true;
  };

  // Funktion til at slette et opslag (inkl. bekræftelsesdialog)
  const deletePost = (postId: string) => {
    Alert.alert(
      'Slet opslag',
      'Er du sikker på, du vil slette dette opslag permanent?',
      [
        { text: 'Annuller', style: 'cancel' },
        {
          text: 'Slet',
          style: 'destructive',
          onPress: async () => {
            const { error } = await supabase.from('posts').delete().eq('id', postId);
            if (error) {
              Alert.alert('Fejl', 'Kunne ikke slette opslag: ' + error.message);
            } else {
              await fetchMineOpslag(); // Gen-hent listen for at fjerne det slettede opslag
            }
          },
        },
      ]
    );
  };

  return {
    userId,
    mineOpslag,
    loading,
    createPost,
    updatePost,
    deletePost,
  };
}
