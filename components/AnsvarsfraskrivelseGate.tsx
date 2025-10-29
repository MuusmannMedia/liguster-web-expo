// components/AnsvarsfraskrivelseGate.tsx
import AsyncStorage from "@react-native-async-storage/async-storage";
import { usePathname } from "expo-router";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { InteractionManager, Linking, Modal, Platform, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useSession } from "../hooks/useSession";

const DISCLAIMER_VERSION = "2025-01";

export default function AnsvarsfraskrivelseGate() {
  const { session } = useSession();
  const userId = session?.user?.id ?? null;

  // Vis ALDRIG på auth-skærme
  const pathname = usePathname();
  const onAuthScreen =
    pathname === "/" ||
    pathname?.includes("LoginScreen") ||
    pathname?.includes("OpretBruger");

  // Per-user storage key
  const STORAGE_KEY = useMemo(
    () => (userId ? `liguster_disclaimer_${DISCLAIMER_VERSION}_${userId}` : null),
    [userId]
  );

  const [visible, setVisible] = useState(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  // Vis først modalen når navigation/animation er færdig
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!STORAGE_KEY || onAuthScreen) {
        if (mountedRef.current) setVisible(false);
        return;
      }

      // Vent til UI er tegnet og transitions er overstået
      await new Promise<void>((resolve) => {
        InteractionManager.runAfterInteractions(() => resolve());
      });

      // Lille micro-delay hjælper mod race med layout på enkelte devices
      await new Promise((r) => setTimeout(r, 50));

      if (cancelled || !mountedRef.current) return;

      try {
        const accepted = await AsyncStorage.getItem(STORAGE_KEY);
        if (!mountedRef.current) return;
        setVisible(!accepted);
      } catch (e) {
        // Hvis der skulle ske en storage-fejl, så hellere vise end at soft-locke
        if (!mountedRef.current) return;
        setVisible(true);
      }
    })();

    return () => { cancelled = true; };
  }, [STORAGE_KEY, onAuthScreen]);

  const closeAfterInteractions = () => {
    // Luk modalen *efter* eventuelle animationer er færdige
    InteractionManager.runAfterInteractions(() => {
      if (mountedRef.current) setVisible(false);
    });
  };

  const accept = async () => {
    if (!STORAGE_KEY) return;
    try {
      await AsyncStorage.setItem(STORAGE_KEY, "accepted");
    } catch (e) {
      console.warn("Kunne ikke gemme accept:", (e as any)?.message);
    } finally {
      closeAfterInteractions();
    }
  };

  const cancel = async () => {
    // Luk modalen først for at undgå, at Modal + Linking “kæmper” om vinduet
    closeAfterInteractions();
    try {
      await Linking.openURL("https://www.liguster-app.dk/");
    } catch (e) {
      console.warn("Kunne ikke åbne URL:", (e as any)?.message);
    }
  };

  // Slet intet UI når ikke logget ind eller på auth-skærme
  if (!userId || onAuthScreen) return null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      // statusBarTranslucent kan give frys i nogle iOS setups – vi undlader det
      // statusBarTranslucent
      onRequestClose={closeAfterInteractions}
      presentationStyle={Platform.OS === "ios" ? "overFullScreen" : "fullScreen"}
    >
      <SafeAreaView style={styles.backdrop} edges={["top", "bottom"]}>
        <View style={styles.card} pointerEvents="box-none">
          <Text style={styles.title}>Ansvarsfraskrivelse</Text>
          <Text style={styles.text}>
            Ved at bruge Liguster accepterer du, at du selv er ansvarlig for indhold, du
            deler (tekst og billeder). Liguster gennemgår ikke alt indhold og kan derfor
            ikke garantere, at indhold er korrekt eller passende.
          </Text>
          <Text style={styles.text}>
            Du må ikke uploade ulovligt, krænkende eller rettighedskrænkende indhold. Brug
            af appen sker på eget ansvar.
          </Text>

          <TouchableOpacity style={styles.btn} onPress={accept} activeOpacity={0.85}>
            <Text style={styles.btnText}>OK – Jeg accepterer</Text>
          </TouchableOpacity>

          <TouchableOpacity style={[styles.btn, styles.cancelBtn]} onPress={cancel} activeOpacity={0.85}>
            <Text style={styles.cancelBtnText}>Annuller</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.95)",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 16,
  },
  card: {
    backgroundColor: "#fff",
    borderRadius: 14,
    padding: 20,
    width: "100%",
    maxWidth: 420,
  },
  title: { fontSize: 20, fontWeight: "800", marginBottom: 12, color: "#131921" },
  text: { fontSize: 15, lineHeight: 22, color: "#444", marginBottom: 12 },
  btn: {
    backgroundColor: "#131921",
    borderRadius: 8,
    paddingVertical: Platform.select({ ios: 14, android: 12 }),
    alignItems: "center",
    marginTop: 10,
  },
  btnText: { color: "#fff", fontWeight: "700", fontSize: 16 },
  cancelBtn: { backgroundColor: "#ddd" },
  cancelBtnText: { color: "#333", fontWeight: "700", fontSize: 16 },
});