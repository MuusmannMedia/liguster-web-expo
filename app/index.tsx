// app/index.tsx
import { useRouter } from "expo-router";
import React from "react";
import {
    Image,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
    useWindowDimensions,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

export default function IndexScreen() {
  const router = useRouter();
  const { width } = useWindowDimensions();

  // Logo-størrelse dynamisk: min 200, max 340
  const logoSize = Math.min(340, Math.max(200, width * 0.6));

  // Knapbredde følger logoet
  const buttonWidth = logoSize;

  // Tablet vs. mobil
  const isTablet = width >= 768;
  const buttonHeight = isTablet ? 68 : 52;
  const buttonFontSize = isTablet ? 18 : 14;
  const footerFontSize = isTablet ? 23 : 15;

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
          accessibilityRole="button"
          accessibilityLabel="Log ind"
        >
          <Text style={[styles.buttonText, { fontSize: buttonFontSize }]}>LOGIN</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.button, { width: buttonWidth, height: buttonHeight }]}
          onPress={() => router.push("/OpretBruger")}
          accessibilityRole="button"
          accessibilityLabel="Opret bruger"
        >
          <Text style={[styles.buttonText, { fontSize: buttonFontSize }]}>OPRET BRUGER</Text>
        </TouchableOpacity>

        {/* Footer */}
        <View style={styles.legalBox}>
          <TouchableOpacity
            onPress={() => router.push("/privacy")}
            accessibilityRole="link"
            accessibilityLabel="Gå til Privacy Policy"
          >
            <Text style={[styles.legalLink, { fontSize: footerFontSize }]}>Privacy Policy</Text>
          </TouchableOpacity>
          <Text style={[styles.dot, { fontSize: footerFontSize - 1 }]}>•</Text>
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

  // Logo
  logoContainer: { alignItems: "center", marginBottom: 48 },
  logoImage: { marginBottom: 32 },

  // Knapper
  button: {
    backgroundColor: "#fff",
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  buttonText: { color: "#171C22", fontWeight: "700", letterSpacing: 1 },

  // Footer
  legalBox: {
    marginTop: 28,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    opacity: 0.9,
  },
  legalLink: {
    color: "#C9D2DC",
    textDecorationLine: "underline",
    fontWeight: "600",
  },
  dot: { color: "#6C7682" },
  copyright: { color: "#6C7682" },
});