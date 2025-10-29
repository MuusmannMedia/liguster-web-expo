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

      {/* Simpel topbar på native */}
      {Platform.OS !== "web" && (
        <View style={styles.topBar}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <Text style={styles.backText}>‹ Tilbage</Text>
          </TouchableOpacity>
        </View>
      )}

      <ScrollView style={styles.scroll} contentContainerStyle={styles.container}>
        <Text style={styles.h1}>Privatlivspolitik for Liguster</Text>
        <Text style={styles.updated}>Senest opdateret: 4. august 2025</Text>

        <Text style={styles.p}>
          Denne privatlivspolitik beskriver vores politikker og procedurer for,
          hvordan vi indsamler, bruger og videregiver dine oplysninger, når du
          bruger tjenesten, samt dine rettigheder og hvordan loven beskytter dig.
        </Text>

        <Text style={styles.p}>
          Vi bruger dine personoplysninger til at levere og forbedre tjenesten.
          Ved at bruge tjenesten accepterer du, at oplysninger indsamles og bruges
          i overensstemmelse med denne privatlivspolitik.
        </Text>

        <Text style={styles.h2}>Kontakt</Text>
        <Text style={styles.p}>
          Har du spørgsmål, kan du kontakte os på e-mail:{" "}
          <Text
            style={styles.link}
            onPress={() => WebBrowser.openBrowserAsync("mailto:kontakt@liguster-app.dk")}
          >
            kontakt@liguster-app.dk
          </Text>
        </Text>

        <Text style={[styles.link, { marginTop: 8 }]} onPress={openFullPolicy}>
          Læs den fulde politik på liguster-app.dk/privacy
        </Text>

        <View style={{ height: 28 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#0F141A" },
  topBar: {
    paddingTop: 50,
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  backBtn: { paddingVertical: 6 },
  backText: { color: "#FFFFFF", fontSize: 16, fontWeight: "700" },

  scroll: { flex: 1 },
  container: { paddingHorizontal: 20, paddingTop: 6, paddingBottom: 24 },

  h1: { color: "#FFFFFF", fontSize: 30, lineHeight: 36, fontWeight: "800", marginBottom: 8 },
  updated: { color: "#C7CED6", fontSize: 16, marginBottom: 18 },
  p: { color: "#E3E8EF", fontSize: 16, lineHeight: 24, marginBottom: 12 },
  h2: { color: "#FFFFFF", fontSize: 22, lineHeight: 28, fontWeight: "800", marginTop: 8, marginBottom: 8 },
  link: { color: "#6EA8FF", textDecorationLine: "underline", fontSize: 16 },
});