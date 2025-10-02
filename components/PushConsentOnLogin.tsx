// components/PushConsentOnLogin.tsx
import React, { useEffect } from 'react';
import { Alert, Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import { supabase } from '../utils/supabase';

type Props = { userId: string };

const ASKED_KEY = 'pushConsentAsked_v1';

export default function PushConsentOnLogin({ userId }: Props) {
  useEffect(() => {
    let cancelled = false;

    (async () => {
      // web = no-op
      if (Platform.OS === 'web') return;

      // Har vi spurgt før?
      const asked = await AsyncStorage.getItem(ASKED_KEY);
      if (asked === '1') return;

      // Tjek eksisterende tilladelse først
      const perms = await Notifications.getPermissionsAsync();
      let status = perms.status;

      if (status !== 'granted') {
        // venlig forklaring (valgfrit)
        Alert.alert(
          'Push-notifikationer',
          'Må vi sende dig beskeder om vigtige ting i dit nabolag og dine foreninger?',
          [
            { text: 'Nej tak', style: 'cancel', onPress: async () => {
              await AsyncStorage.setItem(ASKED_KEY, '1');
            }},
            { text: 'Ja', onPress: async () => {
              const req = await Notifications.requestPermissionsAsync();
              status = req.status;
              await AsyncStorage.setItem(ASKED_KEY, '1');
              if (status === 'granted') await registerToken(userId);
            }},
          ],
        );
      } else {
        await AsyncStorage.setItem(ASKED_KEY, '1');
        if (!cancelled) await registerToken(userId);
      }
    })();

    return () => { cancelled = true; };
  }, [userId]);

  return null;
}

async function registerToken(userId: string) {
  try {
    // EAS/Classic håndtering af projectId
    const projectId =
      Constants?.expoConfig?.extra?.eas?.projectId ||
      Constants?.easConfig?.projectId ||
      process.env.EXPO_PUBLIC_PROJECT_ID;

    const tokenData = await Notifications.getExpoPushTokenAsync(
      projectId ? { projectId } : undefined
    );

    const token = tokenData.data;

    // Gem i push_tokens (upsert på user_id)
    const { error } = await supabase
      .from('push_tokens')
      .upsert({ user_id: userId, token }, { onConflict: 'user_id' });

    if (error) throw error;

    // (Valgfrit) marker at brugeren har sagt ja i user_push_prefs
    // await supabase.from('user_push_prefs').upsert({ user_id: userId, allow_push: true }, { onConflict: 'user_id' });
  } catch (e) {
    // Stilfærdig fejl – vi kan altid prøve igen senere fra en “Aktivér notifikationer”-knap
    console.warn('registerToken failed:', e);
  }
}