// hooks/useRegisterPushToken.ts
import * as Device from "expo-device";
import Constants from "expo-constants";
import * as Notifications from "expo-notifications";
import { useEffect, useRef } from "react";
import { Platform } from "react-native";
import { supabase } from "../utils/supabase";
import { setPushAsked } from "../utils/launchFlags";

type RegisterResult =
  | { ok: true; token: string; warn?: string; error?: string }
  | { ok: false; reason: string; error?: string };

export default function useRegisterPushToken(userId?: string | null) {
  const hasSetHandler = useRef(false);
  const hasInitAndroidChannel = useRef(false);
  const isRegisteringRef = useRef(false);

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

  useEffect(() => {
    if (Platform.OS !== "android") return;
    if (hasInitAndroidChannel.current) return;
    hasInitAndroidChannel.current = true;

    (async () => {
      try {
        await Notifications.setNotificationChannelAsync("default", {
          name: "Default",
          importance: Notifications.AndroidImportance.MAX, // høj prioritet
          vibrationPattern: [100, 100],
          lockscreenVisibility: Notifications.AndroidNotificationVisibility.PRIVATE,
        });
      } catch (e) {
        console.warn("Kunne ikke oprette Android notifikationskanal:", e);
      }
    })();
  }, []);

  const getExpoPushTokenSafe = async (): Promise<string | null> => {
    const projectId =
      (Constants as any)?.expoConfig?.extra?.eas?.projectId ??
      (Constants as any)?.easConfig?.projectId ??
      (Constants as any)?.expoConfig?.extra?.projectId ??
      (Constants as any)?.expoConfig?.projectId ??
      undefined;

    // Første forsøg
    const t1 = await Notifications.getExpoPushTokenAsync(projectId ? { projectId } : undefined);
    if (t1?.data) return t1.data;

    // iOS kan indimellem være langsom – kort retry
    await new Promise((r) => setTimeout(r, 400));
    const t2 = await Notifications.getExpoPushTokenAsync(projectId ? { projectId } : undefined);
    return t2?.data ?? null;
  };

  const requestAndRegister = async (): Promise<RegisterResult> => {
    if (isRegisteringRef.current) return { ok: false, reason: "busy" };
    isRegisteringRef.current = true;

    try {
      if (!userId) {
        await setPushAsked();
        return { ok: false, reason: "no-user" };
      }
      if (Platform.OS === "web") {
        await setPushAsked();
        return { ok: false, reason: "web-unsupported" };
      }
      if (!Device.isDevice) {
        await setPushAsked();
        return { ok: false, reason: "simulator" };
      }

      // Permissions (iOS + Android 13+)
      let { status } = await Notifications.getPermissionsAsync();
      if (status !== "granted") {
        const req = await Notifications.requestPermissionsAsync({
          ios: { allowAlert: true, allowBadge: true, allowSound: true },
          // Android 13+ kræver POST_NOTIFICATIONS – Expo håndterer dette flag internt
        });
        status = req.status;
      }
      if (status !== "granted") {
        await setPushAsked();
        return { ok: false, reason: "denied" };
      }

      // Token (med retry)
      const token = await getExpoPushTokenSafe();
      if (!token) {
        await setPushAsked();
        return { ok: false, reason: "no-token" };
      }

      // Meta til debugging/segmentering
      const platform = Platform.OS;
      const device_name =
        (Device.brand ?? "") + (Device.modelName ? ` ${Device.modelName}` : "");
      const app_version =
        (Constants as any)?.manifest2?.extra?.buildVersion ??
        (Constants as any)?.expoConfig?.version ??
        (Constants as any)?.manifest?.version ??
        undefined;

      // DB: strategi A – unik pr. TOKEN (så flere enheder per bruger er ok)
      const { error: upsertErr } = await supabase
        .from("push_tokens")
        .upsert(
          { user_id: userId, token, platform, device_name, app_version },
          { onConflict: "token", ignoreDuplicates: false } // gør token unik
        );

      if (upsertErr) {
        await setPushAsked();
        return { ok: false, reason: "db-upsert-failed", error: upsertErr.message };
      }

      // Prefs: markér samtykke
      const { error: prefErr } = await supabase
        .from("user_push_prefs")
        .upsert({ user_id: userId, allow_push: true }, { onConflict: "user_id" });

      await setPushAsked();

      if (prefErr) {
        return { ok: true, token, warn: "prefs-upsert-failed", error: prefErr.message };
      }
      return { ok: true, token };
    } catch (e: any) {
      await setPushAsked();
      return { ok: false, reason: "unexpected", error: e?.message ?? String(e) };
    } finally {
      isRegisteringRef.current = false;
    }
  };

  // Logout: fjern alle tokens for brugeren (bevidst “bred” oprydning)
  const unregister = async (): Promise<RegisterResult> => {
    try {
      if (!userId) return { ok: false, reason: "no-user" };
      const { error: delErr } = await supabase.from("push_tokens").delete().eq("user_id", userId);
      if (delErr) return { ok: false, reason: "db-delete-failed", error: delErr.message };

      const { error: prefErr } = await supabase
        .from("user_push_prefs")
        .upsert({ user_id: userId, allow_push: false }, { onConflict: "user_id" });

      if (prefErr) return { ok: true, warn: "prefs-upsert-failed", error: prefErr.message };
      return { ok: true, token: "" as any };
    } catch (e: any) {
      return { ok: false, reason: "unexpected", error: e?.message ?? String(e) };
    }
  };

  return { requestAndRegister, unregister };
}