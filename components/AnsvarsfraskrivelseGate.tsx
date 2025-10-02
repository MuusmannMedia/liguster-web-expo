// components/AnsvarsfraskrivelseGate.tsx
import AsyncStorage from "@react-native-async-storage/async-storage";
import { usePathname } from "expo-router";
import React, { useEffect, useMemo, useState } from "react";
import { Linking, Modal, Platform, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useSession } from "../hooks/useSession";

const DISCLAIMER_VERSION = "2025-01";

export default function AnsvarsfraskrivelseGate() {
  const { session } = useSession();
  const userId = session?.user?.id ?? null;

  // ❗️Do not show on auth screens
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

  // Only check storage when: we have a user AND we are not on auth screens
  useEffect(() => {
    let mounted = true;
    (async () => {
      if (!STORAGE_KEY || onAuthScreen) {
        mounted && setVisible(false);
        return;
      }
      const accepted = await AsyncStorage.getItem(STORAGE_KEY);
      mounted && setVisible(!accepted);
    })();
    return () => {
      mounted = false;
    };
  }, [STORAGE_KEY, onAuthScreen]);

  const accept = async () => {
    if (!STORAGE_KEY) return;
    await AsyncStorage.setItem(STORAGE_KEY, "accepted");
    setVisible(false);
  };

  const cancel = async () => {
    try {
      await Linking.openURL("https://www.liguster-app.dk/");
    } catch (e) {
      console.warn("Kunne ikke åbne URL:", e);
    }
    // Modal forbliver åben indtil accept
  };

  // Nothing during unauthenticated flow or on auth screens
  if (!userId || onAuthScreen) return null;

  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent>
      <SafeAreaView style={styles.backdrop} edges={["top", "bottom"]}>
        <View style={styles.card}>
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