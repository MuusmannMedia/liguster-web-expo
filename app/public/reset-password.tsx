// app/reset-password.tsx
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
import { useRouter, useLocalSearchParams } from "expo-router";
import * as Linking from "expo-linking";
import { SafeAreaView } from "react-native-safe-area-context";
import { supabase } from "../../utils/supabase";

export const options = { headerShown: false };

// Helper: parse "a=1&b=2" til { a: "1", b: "2" }
const parseKV = (s: string) =>
  Object.fromEntries(
    s
      .split("&")
      .filter(Boolean)
      .map((kv) => {
        const [k, v = ""] = kv.split("=");
        return [decodeURIComponent(k), decodeURIComponent(v)];
      })
  ) as Record<string, string>;

export default function ResetPasswordScreen() {
  const router = useRouter();

  // Supabase redirect leverer bl.a.: type=recovery, access_token, refresh_token
  const params = useLocalSearchParams<{
    type?: string;
    access_token?: string;
    refresh_token?: string;
  }>();
  const type = params.type;
  const access_token = params.access_token;
  const refresh_token = params.refresh_token;

  const [busy, setBusy] = React.useState(true); // sætter session
  const [ready, setReady] = React.useState(false); // når formular kan vises
  const [newPwd, setNewPwd] = React.useState("");
  const [confirmPwd, setConfirmPwd] = React.useState("");
  const [updating, setUpdating] = React.useState(false);

  const confirmRef = React.useRef<TextInput>(null);

  // 0) Fallback: Hvis vi ikke har tokens i query, prøv at hente den rå URL og konverter # → ?
  React.useEffect(() => {
    let cancelled = false;

    const ensureQueryParams = async () => {
      // Allerede OK?
      if (access_token && refresh_token) return;

      // Læs initial URL (cold start via deep link)
      const initial = await Linking.getInitialURL();

      // Eller lyt (hvis appen allerede kører)
      const handle = async (incoming: string | null) => {
        if (!incoming) return;

        // 1) Prøv query først
        const parsed = Linking.parse(incoming);
        const q = parsed.queryParams ?? {};
        if (q.access_token && q.refresh_token) return; // så får useLocalSearchParams dem allerede

        // 2) Prøv hash
        const hashIndex = incoming.indexOf("#");
        if (hashIndex >= 0) {
          const raw = incoming.slice(hashIndex + 1); // "type=recovery&access_token=…"
          const kv = parseKV(raw);
          if (kv.access_token && kv.refresh_token) {
            // Navigér til samme skærm med *query*-parametre
            router.replace({
              pathname: "/reset-password",
              params: {
                type: kv.type ?? "recovery",
                access_token: kv.access_token,
                refresh_token: kv.refresh_token,
              },
            });
          }
        }
      };

      await handle(initial);

      // Sæt event-listener for det tilfælde at skærmen er åben når linket kommer
      const sub = Linking.addEventListener("url", ({ url }) => { void handle(url); });
      return () => sub.remove();
    };

    const cleanup = ensureQueryParams();
    return () => { cancelled = true; void cleanup; };
    // Kør kun når vi ikke allerede har parametre
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [access_token, refresh_token]);

  // 1) Sæt session ud fra query-params (når de er på plads)
  React.useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        if (type === "recovery" && access_token && refresh_token) {
          const { error } = await supabase.auth.setSession({
            access_token: String(access_token),
            refresh_token: String(refresh_token),
          });
          if (error) {
            Alert.alert("Fejl", "Kunne ikke etablere session fra nulstillingslinket.");
          }
        }
      } finally {
        if (!cancelled) {
          setBusy(false);
          setReady(true);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [type, access_token, refresh_token]);

  // 2) Opdater adgangskode
  const onSubmit = async () => {
    if (!newPwd || !confirmPwd) {
      Alert.alert("Manglende felt", "Udfyld begge felter.");
      return;
    }
    if (newPwd.length < 8) {
      Alert.alert("For kort adgangskode", "Adgangskoden skal som minimum være 8 tegn.");
      return;
    }
    if (newPwd !== confirmPwd) {
      Alert.alert("Mismatch", "De to adgangskoder er ikke ens.");
      return;
    }

    try {
      setUpdating(true);
      const { error } = await supabase.auth.updateUser({ password: newPwd });
      if (error) throw error;

      Alert.alert("Succes", "Din adgangskode er opdateret.", [
        { text: "OK", onPress: () => router.replace("/Opslag") },
      ]);
    } catch (e: any) {
      Alert.alert("Kunne ikke opdatere", e?.message ?? "Prøv igen.");
    } finally {
      setUpdating(false);
    }
  };

  const goBack = () => router.replace("/LoginScreen"); // eller "/"

  return (
    <View style={styles.root}>
      {/* Tilbagepil */}
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

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.select({ ios: "padding", android: "height" })}
      >
        <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
          <View style={styles.centered}>
            <Text style={styles.title}>Nulstil adgangskode</Text>

            {!ready ? (
              <Text style={{ color: "#9fb0c0" }}>
                {busy ? "Åbner nulstillingslink…" : "Klar."}
              </Text>
            ) : (
              <>
                <TextInput
                  style={styles.input}
                  placeholder="Ny adgangskode"
                  placeholderTextColor="#999"
                  secureTextEntry
                  autoCapitalize="none"
                  value={newPwd}
                  onChangeText={setNewPwd}
                  returnKeyType="next"
                  onSubmitEditing={() => confirmRef.current?.focus()}
                  blurOnSubmit={false}
                />
                <TextInput
                  ref={confirmRef}
                  style={styles.input}
                  placeholder="Gentag adgangskode"
                  placeholderTextColor="#999"
                  secureTextEntry
                  autoCapitalize="none"
                  value={confirmPwd}
                  onChangeText={setConfirmPwd}
                  returnKeyType="go"
                  onSubmitEditing={onSubmit}
                />

                <TouchableOpacity
                  style={[styles.button, updating && { opacity: 0.7 }]}
                  onPress={onSubmit}
                  disabled={updating}
                >
                  <Text style={styles.buttonText}>
                    {updating ? "Opdaterer…" : "OPDATER KODE"}
                  </Text>
                </TouchableOpacity>
              </>
            )}
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

  title: { color: "#fff", fontSize: 26, fontWeight: "700", marginBottom: 16 },

  input: {
    backgroundColor: "#fff",
    width: 260,
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
    marginTop: 8,
    elevation: 1,
  },
  buttonText: { color: "#171C22", fontSize: 16, fontWeight: "700", letterSpacing: 1 },
});