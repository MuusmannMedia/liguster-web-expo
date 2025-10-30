// app/public/index.tsx
import React from "react";
import { Link } from "expo-router";
import {
  View,
  Text,
  Image,
  StyleSheet,
  Platform,
  Pressable,
  ScrollView,
} from "react-native";

export default function LandingPageWeb() {
  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.wrapper}>
      {/* HERO */}
      <View style={styles.heroSection}>
        {/* Venstre tekst */}
        <View style={styles.leftCol}>
          <Text style={styles.headline}>Nabolaget – samlet ét sted</Text>

          <Text style={styles.blurb}>
            Liguster er dit fælles sted for hverdagen i nabolaget.
            Del ting i stedet for at købe nyt. Spørg om hjælp og få svar hurtigt.
            Hold styr på foreningen – medlemmer, begivenheder, beslutninger –
            uden at drukne i mails eller Facebook-grupper.
            Alt samlet ét sted, kun for jer.
          </Text>

          <Text style={styles.subtle}>
            Webudgaven er under udvikling. Har du allerede en konto i appen,
            kan du logge ind nedenfor.
          </Text>

          <Pressable
            onPress={() => {
              // ✅ korrekt public-sti
              window.location.href = "/public/privacy";
            }}
            style={({ hovered }) => [
              styles.inlineLinkPressable,
              hovered && styles.inlineLinkHovered,
            ]}
          >
            <Text style={styles.inlineLinkText}>Privacy Policy</Text>
          </Pressable>
        </View>

        {/* Højre: logo uden tekst */}
        <View style={styles.rightCol}>
          <Image
            source={require("../assets/images/Liguster-logo-NEG.png")}
            style={styles.bigLogo}
          />
        </View>
      </View>

      {/* FEATURES */}
      <View style={styles.featureRow}>
        <View style={styles.featureCard}>
          <Text style={styles.featureTitle}>Opslag & hjælp</Text>
          <Text style={styles.featureBody}>
            Efterlys hjælp, lån et værktøj, giv noget væk,
            eller sig “er der nogen der lige kan…?”.
            Alt samlet i nabolaget – ikke hele internettet.
          </Text>
        </View>

        <View style={styles.featureCard}>
          <Text style={styles.featureTitle}>Foreninger</Text>
          <Text style={styles.featureBody}>
            Medlemslister, kalender, referater og beskeder.
            Bestyrelsen får ét sted at styre det hele,
            og beboerne kan altid finde svar selv.
          </Text>
        </View>

        <View style={styles.featureCard}>
          <Text style={styles.featureTitle}>Beskeder</Text>
          <Text style={styles.featureBody}>
            Skriv direkte til naboer eller lav fælles grupper.
            Ingen telefonnumre delt rundt. Ingen støj udefra.
          </Text>
        </View>
      </View>

      {/* FOOTER / CTA */}
      <View style={styles.footerOuter}>
        <View style={styles.footerInner}>
          <Text style={styles.footerHeading}>Klar til at logge ind?</Text>

          <View style={styles.footerLinksRow}>
            {/* ✅ korrekt public-sti til LoginScreen */}
            <Link href="/public/LoginScreen" style={styles.footerLinkHit}>
              <Text style={styles.footerLinkText}>Log ind</Text>
            </Link>

            <Text style={styles.footerDot}>·</Text>

            {/* ✅ korrekt public-sti til privacy */}
            <Link href="/public/privacy" style={styles.footerLinkHit}>
              <Text style={styles.footerLinkText}>Privacy Policy</Text>
            </Link>
          </View>

          <Text style={styles.copy}>
            © {new Date().getFullYear()} Liguster
          </Text>
        </View>
      </View>
    </ScrollView>
  );
}

/* ==== TOKENS ==== */
const BG = "#0f1622";
const FOOT_BG = "#111824";
const PANEL_BG = "#1a222f";
const BORDER = "rgba(255,255,255,0.08)";
const TEXT_MAIN = "#fff";
const TEXT_DIM = "#cbd6e2";

/* ==== STYLES ==== */
const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: BG,
  },

  wrapper: {
    maxWidth: 1200,
    width: "100%",
    alignSelf: "center",
    paddingHorizontal: 24,
    paddingTop: 48,
    paddingBottom: 0,
  },

  /* HERO SEKTION */
  heroSection: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    alignItems: "center",
    columnGap: 32,
    rowGap: 32,
    marginBottom: 40,
  },

  leftCol: {
    flexShrink: 1,
    flexGrow: 1,
    minWidth: 260,
    maxWidth: 600,
  },

  headline: {
    color: TEXT_MAIN,
    fontSize: 48,
    lineHeight: 40,
    fontWeight: "700",
    marginBottom: 20,
  },

  blurb: {
    color: TEXT_MAIN,
    fontSize: 18,
    lineHeight: 26,
    marginBottom: 20,
    fontWeight: "400",
  },

  subtle: {
    color: TEXT_DIM,
    fontSize: 16,
    lineHeight: 22,
    fontWeight: "400",
  },

  inlineLinkPressable: {
    marginTop: 20,
    alignSelf: "flex-start",
    ...(Platform.OS === "web" ? { cursor: "pointer" } : null),
  },

  inlineLinkHovered: {
    textDecorationLine: "underline",
  },

  inlineLinkText: {
    color: "#9dbdff",
    fontSize: 16,
    fontWeight: "500",
    textDecorationLine: "underline",
  },

  rightCol: {
    minWidth: 260,
    maxWidth: 360,
    alignItems: "center",
  },

  bigLogo: {
    width: 340,
    height: 340,
    resizeMode: "contain",
  },

  /* FEATURE KORT */
  featureRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    rowGap: 16,
    columnGap: 16,
    justifyContent: "flex-start",
    marginBottom: 48,
  },

  featureCard: {
    backgroundColor: PANEL_BG,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: BORDER,
    paddingVertical: 20,
    paddingHorizontal: 20,
    width: 360,
    maxWidth: "100%",
    flexGrow: 1,
  },

  featureTitle: {
    color: TEXT_MAIN,
    fontSize: 16,
    fontWeight: "700",
    marginBottom: 10,
  },

  featureBody: {
    color: TEXT_DIM,
    fontSize: 16,
    lineHeight: 22,
    fontWeight: "400",
  },

  /* FOOTER */
  footerOuter: {
    marginTop: 16,
    marginHorizontal: -24,
    backgroundColor: FOOT_BG,
    borderTopWidth: 1,
    borderTopColor: BORDER,
    paddingTop: 32,
    paddingBottom: 56,
    paddingHorizontal: 24,
  },

  footerInner: {
    maxWidth: 800,
    width: "100%",
    alignSelf: "center",
    alignItems: "center",
  },

  footerHeading: {
    color: TEXT_MAIN,
    fontWeight: "700",
    fontSize: 18,
    marginBottom: 16,
    textAlign: "center",
  },

  footerLinksRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    columnGap: 14,
    rowGap: 8,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },

  footerLinkHit: {
    ...(Platform.OS === "web" ? { cursor: "pointer" } : null),
  },

  footerLinkText: {
    color: TEXT_DIM,
    fontSize: 16,
    textDecorationLine: "underline",
    fontWeight: "500",
  },

  footerDot: {
    color: TEXT_DIM,
    fontSize: 16,
    fontWeight: "400",
  },

  copy: {
    color: TEXT_DIM,
    fontSize: 14,
    fontWeight: "400",
  },
});