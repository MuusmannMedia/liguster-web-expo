// app/disclaimer.tsx
import React from "react";
import { Linking, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";

export default function DisclaimerScreen() {
  const router = useRouter();

  const openFull = () => {
    Linking.openURL("https://liguster-app.dk/disclaimer");
  };

  return (
    <View style={styles.root}>
      <SafeAreaView edges={["top"]} style={styles.headerArea}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} accessibilityRole="button">
            <Text style={styles.back}>‹ Tilbage</Text>
          </TouchableOpacity>
          <Text style={styles.headerSpacer} />
        </View>
      </SafeAreaView>

      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.h1}>Ansvarsfraskrivelse for Liguster</Text>
        <Text style={styles.updated}>Senest opdateret: 4. august 2025</Text>

        <Text style={styles.p}>
          Ved at bruge Liguster accepterer du, at du selv er ansvarlig for indhold, du deler
          (tekst og billeder). Liguster gennemgår ikke alt indhold og kan derfor ikke
          garantere, at indhold er korrekt eller passende.
        </Text>
        <Text style={styles.p}>
          Du må ikke uploade ulovligt, krænkende eller rettighedskrænkende indhold. Brug af
          appen sker på eget ansvar.
        </Text>

        <Text style={styles.h2}>Kontakt</Text>
        <Text style={styles.p}>
          Har du spørgsmål, kan du kontakte os på e-mail:{" "}
          <Text style={styles.link} onPress={() => Linking.openURL("mailto:kontakt@liguster-app.dk")}>
            kontakt@liguster-app.dk
          </Text>
        </Text>

        <Text style={[styles.link, { marginTop: 8 }]} onPress={openFull}>
          Læs den fulde ansvarsfraskrivelse på liguster-app.dk/disclaimer
        </Text>

        <View style={{ height: 28 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  // matcher privacy-sidens mørke layout
  root: { flex: 1, backgroundColor: "#0F141A" },
  headerArea: { backgroundColor: "#0F141A" },
  header: {
    height: 56,
    paddingHorizontal: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  back: { color: "#FFFFFF", fontWeight: "700", fontSize: 16 },
  headerSpacer: { width: 70, color: "transparent" },

  content: { paddingHorizontal: 20, paddingTop: 6, paddingBottom: 24 },
  h1: { color: "#FFFFFF", fontSize: 30, lineHeight: 36, fontWeight: "800", marginBottom: 8 },
  updated: { color: "#C7CED6", fontSize: 16, marginBottom: 18 },
  p: { color: "#E3E8EF", fontSize: 16, lineHeight: 24, marginBottom: 12 },
  h2: { color: "#FFFFFF", fontSize: 22, lineHeight: 28, fontWeight: "800", marginTop: 8, marginBottom: 8 },

  link: { color: "#6EA8FF", textDecorationLine: "underline", fontSize: 16 },
});