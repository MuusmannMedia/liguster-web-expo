// app/public/LoginScreen.tsx
import { useRouter } from "expo-router";
import React, { useRef, useState } from "react";
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
import { supabase } from "../../utils/supabase";

export const options = { headerShown: false };

/** Wrapper der ikke stjæler fokus på web */
function MaybeKeyboardDismiss({ children }: { children: React.ReactNode }) {
  if (Platform.OS === "web") return <View style={{ flex: 1 }}>{children}</View>;
  return (
    <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
      <View style={{ flex: 1 }}>{children}</View>
    </TouchableWithoutFeedback>
  );
}

export default function LoginScreen() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const passwordRef = useRef<TextInput>(null);

  const goHome = () => router.replace("/public");

  const onLogin = async () => {
    if (!email || !password) {
      Alert.alert("Fejl", "Udfyld både email og password.");
      return;
    }
    try {
      setLoading(true);
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      router.replace("/protected/Opslag");
    } catch (e: any) {
      Alert.alert("Login fejlede", e?.message ?? "Prøv igen.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.root}>
      {/* Top-bar uden SafeAreaView */}
      <View style={styles.backSafe}>
        <TouchableOpacity
          style={styles.backBtn}
          onPress={goHome}
          accessibilityRole="button"
          accessibilityLabel="Tilbage"
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Text style={styles.backIcon}>‹</Text>
        </TouchableOpacity>
      </View>

      {/* Form content */}
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.select({ ios: "padding", android: "height" })}
      >
        <MaybeKeyboardDismiss>
          <View style={styles.centered}>
            <Text style={styles.title}>Log ind</Text>

            <TextInput
              style={styles.input}
              placeholder="Email"
              placeholderTextColor="#999"
              autoCapitalize="none"
              keyboardType="email-address"
              textContentType="username"
              value={email}
              onChangeText={setEmail}
              returnKeyType="next"
              onSubmitEditing={() => passwordRef.current?.focus()}
              blurOnSubmit={false}
            />

            <TextInput
              ref={passwordRef}
              style={styles.input}
              placeholder="Password"
              placeholderTextColor="#999"
              secureTextEntry
              textContentType="password"
              value={password}
              onChangeText={setPassword}
              returnKeyType="go"
              onSubmitEditing={onLogin}
            />

            <TouchableOpacity style={styles.button} onPress={onLogin} disabled={loading}>
              <Text style={styles.buttonText}>{loading ? "Logger ind…" : "LOG IND"}</Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => router.push("/public/glemt-kodeord")}
              style={{ alignSelf: "center", marginTop: 16 }}
            >
              <Text style={styles.linkText}>Glemt kodeord?</Text>
            </TouchableOpacity>
          </View>
        </MaybeKeyboardDismiss>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#171C22" },

  // Simpel topbar uden SafeAreaView – lidt padding-top
  backSafe: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 12,
    paddingTop: Platform.OS === "web" ? 8 : 8, // kan evt. tunes
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

  title: { color: "#fff", fontSize: 28, fontWeight: "700", marginBottom: 16 },

  input: {
    backgroundColor: "#fff",
    width: 260,
    height: 48,
    borderRadius: 40,
    paddingHorizontal: 14,
    marginBottom: 12,
    fontSize: 16,
  },

  linkText: {
    color: "#cfe2ff",
    fontWeight: "700",
    fontSize: 15,
    textDecorationLine: "underline",
  },

  button: {
    backgroundColor: "#fff",
    borderRadius: 40,
    width: 200,
    height: 52,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 8,
    elevation: 1,
  },
  buttonText: {
    color: "#171C22",
    fontSize: 16,
    fontWeight: "700",
    letterSpacing: 1,
  },
});