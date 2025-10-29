// app/auth/reset.tsx
import { useEffect, useRef, useState } from 'react';
import * as ExpoLinking from 'expo-linking';
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
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { supabase } from '../../utils/supabase';

// Parse "a=1&b=2" -> { a: "1", b: "2" }
const parseKV = (s: string) =>
  Object.fromEntries(
    s
      .split('&')
      .filter(Boolean)
      .map((kv) => {
        const [k, v = ''] = kv.split('=');
        return [decodeURIComponent(k), decodeURIComponent(v)];
      })
  ) as Record<string, string>;

// Hent tokens fra URL (hash eller query)
function getTokensFromUrl(url: string | null) {
  if (!url) return { access_token: '', refresh_token: '', type: '' };

  // 1) Prøv via Expo's parser (queryParams)
  const parsed = ExpoLinking.parse(url);
  const qp = (parsed.queryParams ?? {}) as Record<string, string>;
  if (qp.access_token && qp.refresh_token) {
    return {
      access_token: String(qp.access_token),
      refresh_token: String(qp.refresh_token),
      type: String(qp.type ?? ''),
    };
  }

  // 2) Fallback: manuel hash-parsing
  const hashIdx = url.indexOf('#');
  if (hashIdx >= 0 && hashIdx + 1 < url.length) {
    const raw = url.slice(hashIdx + 1);
    const kv = parseKV(raw);
    return {
      access_token: String(kv.access_token ?? ''),
      refresh_token: String(kv.refresh_token ?? ''),
      type: String(kv.type ?? ''),
    };
  }

  return { access_token: '', refresh_token: '', type: '' };
}

export default function ResetPasswordScreen() {
  const router = useRouter();
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);

  const didSetSession = useRef(false);
  const confirmRef = useRef<TextInput>(null);

  // Fang deeplink (kold start + når appen allerede kører)
  useEffect(() => {
    let mounted = true;

    async function ensureSession(url: string | null) {
      if (!mounted || didSetSession.current) return;

      const { access_token, refresh_token, type } = getTokensFromUrl(url);

      if (type === 'recovery' && access_token && refresh_token) {
        const { error } = await supabase.auth.setSession({
          access_token,
          refresh_token,
        });
        if (error) {
          Alert.alert(
            'Ugyldigt link',
            'Kunne ikke etablere session fra nulstillingslinket. Åbn mail-linket igen.'
          );
          setReady(true);
          return;
        }
        didSetSession.current = true;
      }

      setReady(true);
    }

    // Cold start
    ExpoLinking.getInitialURL().then(ensureSession);

    // Når appen allerede kører
    const sub = ExpoLinking.addEventListener('url', (e) => ensureSession(e.url));

    return () => {
      mounted = false;
      sub.remove();
    };
  }, []);

  // Opdater adgangskode
  async function onSave() {
    if (!didSetSession.current) {
      Alert.alert(
        'Manglende session',
        'Kunne ikke verificere nulstillingslinket. Åbn mail-linket igen på denne enhed.'
      );
      return;
    }
    if (pw.length < 8) {
      Alert.alert('Adgangskoden skal være mindst 8 tegn.');
      return;
    }
    if (pw !== pw2) {
      Alert.alert('Adgangskoderne er ikke ens.');
      return;
    }

    setBusy(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: pw });
      if (error) throw error;

      Alert.alert('Din adgangskode er opdateret.', undefined, [
        { text: 'OK', onPress: () => router.replace('/Opslag') },
      ]);
    } catch (e: any) {
      Alert.alert('Kunne ikke opdatere adgangskoden', e?.message ?? 'Prøv igen.');
    } finally {
      setBusy(false);
    }
  }

  const goBack = () => router.replace('/LoginScreen');

  if (!ready) return <View style={{ flex: 1, backgroundColor: '#171C22' }} />;

  return (
    <View style={s.page}>
      {/* Tilbagepil */}
      <SafeAreaView edges={['top']} style={s.backSafe}>
        <TouchableOpacity
          style={s.backBtn}
          onPress={goBack}
          accessibilityRole="button"
          accessibilityLabel="Tilbage"
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Text style={s.backIcon}>‹</Text>
        </TouchableOpacity>
      </SafeAreaView>

      <KeyboardAvoidingView
        style={{ flex: 1, width: '100%' }}
        behavior={Platform.select({ ios: 'padding', android: 'height' })}
      >
        <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
          <View style={s.root}>
            <View style={s.card}>
              <Text style={s.title}>Vælg ny adgangskode</Text>

              <TextInput
                style={s.input}
                placeholder="Ny adgangskode"
                secureTextEntry
                value={pw}
                onChangeText={setPw}
                textContentType="newPassword"
                returnKeyType="next"
                onSubmitEditing={() => confirmRef.current?.focus()}
                blurOnSubmit={false}
              />
              <TextInput
                ref={confirmRef}
                style={s.input}
                placeholder="Gentag adgangskode"
                secureTextEntry
                value={pw2}
                onChangeText={setPw2}
                textContentType="newPassword"
                returnKeyType="go"
                onSubmitEditing={onSave}
              />

              <TouchableOpacity style={[s.btn, busy && { opacity: 0.7 }]} onPress={onSave} disabled={busy}>
                <Text style={s.btnText}>{busy ? 'Gemmer…' : 'Gem ny adgangskode'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </TouchableWithoutFeedback>
      </KeyboardAvoidingView>
    </View>
  );
}

const s = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#171C22' },

  backSafe: {
    position: 'absolute',
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
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },
  backIcon: { fontSize: 32, lineHeight: 32, color: '#fff' },

  root: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  card: {
    width: 320,
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 16,
  },
  title: { fontSize: 20, fontWeight: '700', marginBottom: 12, color: '#0f172a' },
  input: {
    height: 48,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    paddingHorizontal: 12,
    marginBottom: 12,
  },
  btn: {
    height: 48,
    borderRadius: 10,
    backgroundColor: '#131921',
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnText: { color: '#fff', fontWeight: '700' },
});