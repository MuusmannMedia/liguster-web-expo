// app/glemt-kodeord.tsx
import * as React from "react";
import {
  Alert,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { supabase } from "../utils/supabase";

export const options = { headerShown: false };

export default function ForgotPasswordScreen() {
  const router = useRouter();
  const [email, setEmail] = React.useState("");
  const [sending, setSending] = React.useState(false);

  const onSend = async () => {
    const trimmed = email.trim().toLowerCase();
    if (!trimmed) {
      Alert.alert("Mangler e-mail", "Indtast din e-mailadresse.");
      return;
    }
    if (sending) return;

    try {
      setSending(true);

      // VIGTIGT: brug web-broen på WWW-domænet (matcher mail-link og er whitelisted)
      const redirectTo = "https://www.liguster-app.dk/reset";

      const { error } = await supabase.auth.resetPasswordForEmail(trimmed, { redirectTo });
      if (error) throw error;

      Alert.alert(
        "Tjek din mail",
        "Vi har sendt et link til at nulstille din adgangskode. Åbn mailen på denne enhed for at komme direkte tilbage i appen.",
        [{ text: "OK", onPress: () => router.back() }]
      );
    } catch (e: any) {
      const msg = e?.message ?? "Prøv igen om lidt.";
      Alert.alert("Kunne ikke sende mail", msg);
    } finally {
      setSending(false);
    }
  };

  const goBack = () => router.back();

  return (
    <View style={styles.root}>
      {/* Tilbagepil øverst */}
      <SafeAreaView edges={["top"]} style={styles.backSafe}>
        <TouchableOpacity
          style={styles.backBtn}
          onPress={goBack}
          accessibilityRole="button"
          accessibilityLabel="Tilbage"
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Text style={styles.backIcon}>‹</Text>
        </TouchableOpacity>
      </SafeAreaView>

      {/* Flyt indhold op når keyboard vises */}
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.select({ ios: "padding", android: "height" })}
      >
        <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
          <View style={styles.centered}>
            <Text style={styles.title}>Glemt kodeord</Text>
            <Text style={styles.subtitle}>
              Indtast din e-mailadresse, så sender vi et nulstillingslink.
            </Text>

            <TextInput
              style={styles.input}
              placeholder="Din e-mail"
              placeholderTextColor="#999"
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
              textContentType="username"
              value={email}
              onChangeText={setEmail}
              returnKeyType="send"
              onSubmitEditing={onSend}
            />

            <TouchableOpacity
              style={[styles.button, sending && { opacity: 0.7 }]}
              onPress={onSend}
              disabled={sending}
            >
              <Text style={styles.buttonText}>{sending ? "Sender…" : "SEND LINK"}</Text>
            </TouchableOpacity>
          </View>
        </TouchableWithoutFeedback>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#171C22" },

  backSafe: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 12,
    zIndex: 20,
  },
  backBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 4,
  },
  backIcon: { fontSize: 32, lineHeight: 32, color: "#fff" },

  centered: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 20,
  },

  title: { color: "#fff", fontSize: 26, fontWeight: "700", marginBottom: 8 },
  subtitle: {
    color: "#cbd6e2",
    textAlign: "center",
    marginBottom: 16,
    lineHeight: 20,
    maxWidth: 280,
  },

  input: {
    backgroundColor: "#fff",
    width: 280,
    height: 48,
    borderRadius: 40,
    paddingHorizontal: 14,
    marginBottom: 12,
    fontSize: 16,
  },

  button: {
    backgroundColor: "#fff",
    borderRadius: 40,
    width: 220,
    height: 52,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 4,
    elevation: 1,
  },
  buttonText: { color: "#171C22", fontSize: 16, fontWeight: "700", letterSpacing: 1 },
});