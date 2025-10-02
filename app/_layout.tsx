// app/_layout.tsx
import { DarkTheme, DefaultTheme, ThemeProvider } from "@react-navigation/native";
import { useFonts } from "expo-font";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import React, { useEffect, useMemo, useState } from "react";
import { Linking, Modal, Platform, StyleSheet, Text, TouchableOpacity, View } from "react-native";

import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Notifications from "expo-notifications";

import AnsvarsfraskrivelseGate from "../components/AnsvarsfraskrivelseGate";
import { useColorScheme } from "../hooks/useColorScheme";
import useRegisterPushToken from "../hooks/useRegisterPushToken";
import { useSession } from "../hooks/useSession";

/* ────────────────────────────────────────────────────────────────
   Minimal, stabil push-nudge direkte i layout (ingen ekstra filer)
   - Spørger kun efter login
   - Viser ikke, hvis allerede "granted"
   - Snooze i 14 dage ved "Måske senere"
   - Ved "Tillad" → systemprompt + registrér token i Supabase
────────────────────────────────────────────────────────────────── */
const NUDGE_VERSION = "v1";
const keyAsked = (uid: string) => `push_nudge:${NUDGE_VERSION}:asked:${uid}`;
const keySnooze = (uid: string) => `push_nudge:${NUDGE_VERSION}:snoozeUntil:${uid}`;
const SNOOZE_MS = 14 * 24 * 60 * 60 * 1000; // 14 dage

function PushNudgeInline({ userId }: { userId: string }) {
  const { requestAndRegister } = useRegisterPushToken(userId);
  const [visible, setVisible] = useState(false);
  const [permStatus, setPermStatus] = useState<Notifications.PermissionStatus | null>(null);

  const ASKED_KEY = useMemo(() => keyAsked(userId), [userId]);
  const SNOOZE_KEY = useMemo(() => keySnooze(userId), [userId]);

  useEffect(() => {
    if (!userId) return;
    if (Platform.OS === "web") return; // ingen push i web

    let cancelled = false;

    (async () => {
      try {
        const perms = await Notifications.getPermissionsAsync();
        if (perms.status === "granted") return;

        const asked = await AsyncStorage.getItem(ASKED_KEY);
        if (asked === "1") {
          const snoozeUntil = Number((await AsyncStorage.getItem(SNOOZE_KEY)) || 0);
          if (Date.now() < snoozeUntil) return;
        }

        // Lidt forsinkelse så UI lander
        await new Promise((r) => setTimeout(r, 300));

        if (!cancelled) {
          setPermStatus(perms.status);
          setVisible(true);
        }
      } catch {
        // Nudge er "nice to have" – ignorer fejl
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [userId, ASKED_KEY, SNOOZE_KEY]);

  const onMaybeLater = async () => {
    await AsyncStorage.setItem(SNOOZE_KEY, String(Date.now() + SNOOZE_MS));
    setVisible(false);
  };

  const onAllowOrSettings = async () => {
    try {
      // Hvis allerede blokeret (typisk iOS), guid direkte til indstillinger
      if (permStatus === "blocked" || permStatus === "denied") {
        await AsyncStorage.setItem(ASKED_KEY, "1");
        await AsyncStorage.setItem(SNOOZE_KEY, String(Date.now() + SNOOZE_MS));
        Linking.openSettings();
        return;
      }

      // Ellers: vis systemprompt
      let { status } = await Notifications.getPermissionsAsync();
      if (status !== "granted") {
        const req = await Notifications.requestPermissionsAsync();
        status = req.status;
      }

      await AsyncStorage.setItem(ASKED_KEY, "1");

      if (status === "granted") {
        // Registrér token i Supabase (evt. fejl ignoreres)
        await requestAndRegister().catch(() => {});
      } else {
        // Snooze hvis afvist
        await AsyncStorage.setItem(SNOOZE_KEY, String(Date.now() + SNOOZE_MS));
      }
    } finally {
      setVisible(false);
    }
  };

  if (!visible) return null;

  const isBlocked = permStatus === "blocked" || permStatus === "denied";
  const ctaLabel = isBlocked ? "Gå til Indstillinger" : "Tillad notifikationer";

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onMaybeLater}>
      <View style={styles.nudgeBackdrop}>
        <View style={styles.nudgeCard}>
          <Text style={styles.nudgeTitle}>Slå notifikationer til</Text>
          <Text style={styles.nudgeBody}>
            Få besked når der er nye aktiviteter, beskeder eller vigtige opdateringer.
          </Text>

          <TouchableOpacity onPress={onAllowOrSettings} style={styles.nudgePrimary} accessibilityRole="button">
            <Text style={styles.nudgePrimaryText}>{ctaLabel}</Text>
          </TouchableOpacity>

          <TouchableOpacity onPress={onMaybeLater} style={styles.nudgeSecondary} accessibilityRole="button">
            <Text style={styles.nudgeSecondaryText}>Måske senere</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

/* ──────────────────────────────────────────────────────────────── */

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const [loaded] = useFonts({
    SpaceMono: require("../assets/fonts/SpaceMono-Regular.ttf"),
  });

  const { session } = useSession();
  const userId = session?.user?.id ?? null;

  // Sætter notif-handler + Android channel inde i hook (viser ikke systemprompt)
  useRegisterPushToken(userId ?? undefined);

  if (!loaded) return null;

  return (
    <ThemeProvider value={colorScheme === "dark" ? DarkTheme : DefaultTheme}>
      <View style={styles.root}>
        <StatusBar style="light" />
        <Stack screenOptions={{ headerShown: false, animation: "fade" }}>
          <Stack.Screen name="index" />
          <Stack.Screen name="LoginScreen" />
          <Stack.Screen name="OpretBruger" />
          <Stack.Screen name="Nabolag" />
          <Stack.Screen name="MigScreen" />
          <Stack.Screen name="OpretOpslag" />
          <Stack.Screen name="ForeningerScreen" />
          <Stack.Screen name="MineOpslag" />
          <Stack.Screen name="Beskeder" />
          <Stack.Screen name="+not-found" />
        </Stack>

        {/* Vises kun efter login */}
        {userId && (
          <>
            <AnsvarsfraskrivelseGate />
            <PushNudgeInline userId={userId} />
          </>
        )}
      </View>
    </ThemeProvider>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#7C8996" },

  // Nudge styles
  nudgeBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    alignItems: "center",
    justifyContent: "center",
    padding: 16,
  },
  nudgeCard: {
    width: "100%",
    maxWidth: 520,
    borderRadius: 18,
    backgroundColor: "#111",
    padding: 20,
  },
  nudgeTitle: { color: "#fff", fontSize: 22, fontWeight: "800", marginBottom: 8 },
  nudgeBody: { color: "#E5EAF0", fontSize: 15, marginBottom: 16 },
  nudgePrimary: {
    backgroundColor: "#19c37d",
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: "center",
  },
  nudgePrimaryText: { color: "#0b1b12", fontWeight: "900", fontSize: 15 },
  nudgeSecondary: { paddingVertical: 10, alignItems: "center" },
  nudgeSecondaryText: { color: "#C9D2DC", fontWeight: "600" },
});