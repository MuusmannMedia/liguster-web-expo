// hooks/useRegisterPushToken.ts
import Constants from "expo-constants";
import * as Notifications from "expo-notifications";
import { useEffect, useRef } from "react";
import { Platform } from "react-native";
import { supabase } from "../utils/supabase";

/**
 * Registrerer/afregistrer Expo push-token for en bruger.
 * - Viser IKKE system-prompt automatisk; kald requestAndRegister() fra dit UI.
 * - Opretter standard notifikationskanal på Android.
 */
export default function useRegisterPushToken(userId?: string | null) {
  const hasSetHandler = useRef(false);
  const hasInitAndroidChannel = useRef(false);

  // Én gang pr. session: vis notifikationer i forgrunden
  useEffect(() => {
    if (hasSetHandler.current) return;
    hasSetHandler.current = true;

    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowAlert: true,
        shouldPlaySound: false,
        shouldSetBadge: false,
      }),
    });
  }, []);

  // Android: sikre en default-kanal
  useEffect(() => {
    if (Platform.OS !== "android") return;
    if (hasInitAndroidChannel.current) return;
    hasInitAndroidChannel.current = true;

    (async () => {
      try {
        await Notifications.setNotificationChannelAsync("default", {
          name: "Default",
          importance: Notifications.AndroidImportance.DEFAULT,
          vibrationPattern: [100, 100],
          lockscreenVisibility: Notifications.AndroidNotificationVisibility.PRIVATE,
        });
      } catch (e) {
        console.warn("Kunne ikke oprette Android notifikationskanal:", e);
      }
    })();
  }, []);

  /** Bed om tilladelse og registrér token i Supabase. */
  const requestAndRegister = async () => {
    try {
      if (!userId) return { ok: false as const, reason: "no-user" };
      if (Platform.OS === "web") return { ok: false as const, reason: "web-unsupported" };
      if (!Constants.isDevice) return { ok: false as const, reason: "simulator" };

      // 1) Tilladelse (iOS + Android 13+)
      let { status } = await Notifications.getPermissionsAsync();
      if (status !== "granted") {
        const req = await Notifications.requestPermissionsAsync();
        status = req.status;
      }
      if (status !== "granted") return { ok: false as const, reason: "denied" };

      // 2) Hent Expo push-token
      const projectId =
        (Constants as any)?.expoConfig?.extra?.eas?.projectId ??
        (Constants as any)?.easConfig?.projectId ??
        (Constants as any)?.expoConfig?.extra?.projectId ??
        undefined;

      const tokenRes = await Notifications.getExpoPushTokenAsync(
        projectId ? { projectId } : undefined
      );
      const token = tokenRes?.data;
      if (!token) return { ok: false as const, reason: "no-token" };

      // 3) Upsert token i Supabase
      const { error: upsertErr } = await supabase
        .from("push_tokens")
        .upsert({ user_id: userId, token }, { onConflict: "user_id,token", ignoreDuplicates: false });

      if (upsertErr) return { ok: false as const, reason: "db-upsert-failed", error: upsertErr.message };

      // 4) Markér samtykke (valgfrit)
      const { error: prefErr } = await supabase
        .from("user_push_prefs")
        .upsert({ user_id: userId, allow_push: true }, { onConflict: "user_id", ignoreDuplicates: false });

      if (prefErr) {
        return { ok: true as const, token, warn: "prefs-upsert-failed", error: prefErr.message };
      }

      return { ok: true as const, token };
    } catch (e: any) {
      return { ok: false as const, reason: "unexpected", error: e?.message ?? String(e) };
    }
  };

  /** Valgfri afregistrering (fx ved logout). */
  const unregister = async () => {
    try {
      if (!userId) return { ok: false as const, reason: "no-user" };

      const { error: delErr } = await supabase.from("push_tokens").delete().eq("user_id", userId);
      if (delErr) return { ok: false as const, reason: "db-delete-failed", error: delErr.message };

      const { error: prefErr } = await supabase
        .from("user_push_prefs")
        .upsert({ user_id: userId, allow_push: false }, { onConflict: "user_id", ignoreDuplicates: false });

      if (prefErr) {
        return { ok: true as const, warn: "prefs-upsert-failed", error: prefErr.message };
      }
      return { ok: true as const };
    } catch (e: any) {
      return { ok: false as const, reason: "unexpected", error: e?.message ?? String(e) };
    }
  };

  return { requestAndRegister, unregister };
}