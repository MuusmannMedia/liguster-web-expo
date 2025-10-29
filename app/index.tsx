// app/index.tsx
import { useRouter } from "expo-router";
import React, { useEffect, useMemo, useState, useCallback } from "react";
import { Image, StyleSheet, Text, TouchableOpacity, View, useWindowDimensions } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import useRegisterPushToken from "../hooks/useRegisterPushToken";
import {
  getFirstLaunchDone,
  setFirstLaunchDone,
  getPushAsked,
  isPushNudgeDue,
  setPushNudgedNow,
} from "../utils/launchFlags";

export default function IndexScreen() {
  const router = useRouter();
  const { width } = useWindowDimensions();

  const { requestAndRegister } = useRegisterPushToken();

  const [firstLaunchDone, setFLD] = useState<boolean | null>(null);
  const [pushAsked, setPA] = useState<boolean | null>(null);
  const [nudgeDue, setNudgeDue] = useState<boolean>(false);
  const [busy, setBusy] = useState(false);

  const logoSize = Math.min(340, Math.max(200, width * 0.6));
  const buttonWidth = logoSize;
  const isTablet = width >= 768;
  const buttonHeight = isTablet ? 68 : 52;
  const buttonFontSize = isTablet ? 18 : 14;
  const footerFontSize = isTablet ? 18 : 14;

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const [wasDone, pushed, due] = await Promise.all([
          getFirstLaunchDone(),
          getPushAsked(),
          isPushNudgeDue(7),
        ]);
        if (!mounted) return;
        setFLD(wasDone);
        setPA(pushed);
        setNudgeDue(due);
        if (!wasDone) await setFirstLaunchDone();
      } catch {}
    })();
    return () => {
      mounted = false;
    };
  }, []);

  const shouldShowPushNudge = useMemo(() => {
    if (firstLaunchDone === null || pushAsked === null) return false;
    return firstLaunchDone === true && pushAsked === false && nudgeDue === true;
  }, [firstLaunchDone, pushAsked, nudgeDue]);

  const handleEnablePush = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    try {
      await requestAndRegister().catch(() => {});
    } finally {
      await setPushNudgedNow();
      setPA(true);
      setBusy(false);
    }
  }, [busy, requestAndRegister]);

  return (
    <View style={styles.root}>
      <SafeAreaView style={styles.safeArea} edges={["top", "bottom"]}>
        {/* Logo */}
        <View style={styles.logoContainer}>
          <Image
            source={require("../assets/images/Liguster-logo-NEG.png")}
            style={[styles.logoImage, { width: logoSize, height: logoSize }]}
            resizeMode="contain"
          />
        </View>

        {/* CTA-knapper */}
        <TouchableOpacity
          style={[styles.button, { width: buttonWidth, height: buttonHeight, marginBottom: 26 }]}
          onPress={() => router.push("/LoginScreen")}
        >
          <Text style={[styles.buttonText, { fontSize: buttonFontSize }]}>LOGIN</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.button, { width: buttonWidth, height: buttonHeight }]}
          onPress={() => router.push("/OpretBruger")}
        >
          <Text style={[styles.buttonText, { fontSize: buttonFontSize }]}>OPRET BRUGER</Text>
        </TouchableOpacity>

        {/* Valgfri notifikations-knap */}
        {shouldShowPushNudge && (
          <TouchableOpacity
            onPress={handleEnablePush}
            disabled={busy}
            style={[
              styles.nudgeBtn,
              { width: buttonWidth, height: isTablet ? 56 : 46, opacity: busy ? 0.7 : 1 },
            ]}
          >
            <Text style={[styles.nudgeText, { fontSize: isTablet ? 16 : 13 }]}>
              {busy ? "Arbejder…" : "Aktivér notifikationer"}
            </Text>
          </TouchableOpacity>
        )}

        {/* Footer – nu med tre linjer */}
        <View style={styles.legalBox}>
          <TouchableOpacity onPress={() => router.push("/privacy")}>
            <Text style={[styles.legalLink, { fontSize: footerFontSize }]}>Privacy Policy</Text>
          </TouchableOpacity>

          <TouchableOpacity onPress={() => router.push("/disclaimer")}>
            <Text style={[styles.legalLink, { fontSize: footerFontSize }]}>Ansvarsfraskrivelse</Text>
          </TouchableOpacity>

          <Text style={[styles.copyright, { fontSize: footerFontSize }]}>
            © {new Date().getFullYear()} Liguster
          </Text>
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#171C22" },
  safeArea: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 16,
  },
  logoContainer: { alignItems: "center", marginBottom: 48 },
  logoImage: { marginBottom: 32 },

  button: {
    backgroundColor: "#fff",
    borderRadius: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  buttonText: { color: "#171C22", fontWeight: "700", letterSpacing: 1 },

  nudgeBtn: {
    marginTop: 16,
    backgroundColor: "#0EA5E9",
    borderRadius: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  nudgeText: { color: "#fff", fontWeight: "800", letterSpacing: 0.5 },

  legalBox: {
    marginTop: 40,
    alignItems: "center",
    gap: 6,
    opacity: 0.9,
  },
  legalLink: {
    color: "#C9D2DC",
    textDecorationLine: "underline",
    fontWeight: "600",
  },
  copyright: { color: "#6C7682", fontWeight: "500" },
});