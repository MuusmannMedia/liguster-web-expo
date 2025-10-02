// app/privacy.tsx
import Constants from "expo-constants";
import { useRouter } from "expo-router";
import Head from "expo-router/head";
import * as WebBrowser from "expo-web-browser";
import React from "react";
import {
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

export default function PrivacyPolicy() {
  const router = useRouter();

  // Fallback inkl. trailing slash
  const privacyUrl =
    (Constants.expoConfig?.extra as any)?.privacyUrl ||
    "https://www.liguster-app.dk/privacy/";

  const openFullPolicy = async () => {
    try {
      await WebBrowser.openBrowserAsync(privacyUrl, {
        toolbarColor: "#131921",
        enableBarCollapsing: true,
        presentationStyle: WebBrowser.WebBrowserPresentationStyle.FULL_SCREEN,
      });
    } catch {
      if (Platform.OS === "web") window.location.href = privacyUrl;
    }
  };

  return (
    <View style={styles.root}>
      {/* Web <head>-metadata (kun på web) */}
      {Platform.OS === "web" && (
        <Head>
          <title>Privatlivspolitik – Liguster</title>
          <meta
            name="description"
            content="Læs Ligusters privatlivspolitik: hvilke data vi indsamler, hvordan vi bruger dem, og dine rettigheder."
          />
          <meta name="viewport" content="width=device-width, initial-scale=1" />
        </Head>
      )}

      {/* Simpel tilbageknap på native */}
      {Platform.OS !== "web" && (
        <View style={styles.topBar}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <Text style={styles.backText}>‹ Tilbage</Text>
          </TouchableOpacity>
        </View>
      )}

      <ScrollView style={styles.scroll} contentContainerStyle={styles.container}>
        <Text style={styles.title}>Privatlivspolitik for Liguster</Text>
        <Text style={styles.updated}>Senest opdateret: 4. august 2025</Text>

        <Text style={styles.paragraph}>
          Denne privatlivspolitik beskriver vores politikker og procedurer for,
          hvordan vi indsamler, bruger og videregiver dine oplysninger, når du
          bruger tjenesten, samt dine rettigheder og hvordan loven beskytter dig.
        </Text>

        <Text style={styles.paragraph}>
          Vi bruger dine personoplysninger til at levere og forbedre tjenesten.
          Ved at bruge tjenesten accepterer du, at oplysninger indsamles og bruges
          i overensstemmelse med denne privatlivspolitik.
        </Text>

        <Text style={styles.section}>Kontakt</Text>
        <Text style={styles.paragraph}>
          Har du spørgsmål, kan du kontakte os på e-mail:
          {" "}kontakt@liguster-app.dk
        </Text>

        <TouchableOpacity onPress={openFullPolicy}>
          <Text style={styles.link}>
            Læs den fulde politik på liguster-app.dk/privacy
          </Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#171C22" },
  scroll: { flex: 1 },
  container: { padding: 20, paddingBottom: 40 },

  topBar: {
    paddingTop: 50,
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#333",
  },
  backBtn: { paddingVertical: 6 },
  backText: { color: "#fff", fontSize: 16, fontWeight: "600" },

  title: { fontSize: 22, fontWeight: "700", marginBottom: 10, color: "#fff" },
  updated: { fontSize: 14, color: "#bbb", marginBottom: 20 },
  section: { fontSize: 18, fontWeight: "600", marginTop: 20, marginBottom: 8, color: "#fff" },
  paragraph: { fontSize: 14, color: "#ddd", marginBottom: 14, lineHeight: 20 },
  link: { fontSize: 14, color: "#93c5fd", textDecorationLine: "underline", marginTop: 16 },
});