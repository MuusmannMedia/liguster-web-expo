// app/reset-password.tsx
import { useRouter } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
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
import { supabase } from '../utils/supabase';

// Skjul header i Stack
export const options = { headerShown: false };

export default function ResetPasswordScreen() {
  const router = useRouter();

  const [checking, setChecking] = useState(true);
  const [hasSession, setHasSession] = useState(false);

  const [pw1, setPw1] = useState('');
  const [pw2, setPw2] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const pwMin = 8;
  const pwValid = useMemo(() => pw1.length >= pwMin && pw1 === pw2, [pw1, pw2]);

  // Tjek for aktiv session (lyt også efter ændringer)
  useEffect(() => {
    let unsub: (() => void) | undefined;

    const run = async () => {
      try {
        const { data } = await supabase.auth.getSession();
        setHasSession(!!data.session);

        const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
          setHasSession(!!session);
        });
        unsub = () => sub.subscription.unsubscribe();
      } finally {
        setChecking(false);
      }
    };

    run();
    return () => { if (unsub) unsub(); };
  }, []);

  const handleSave = async () => {
    if (!hasSession) {
      Alert.alert(
        'Fejl',
        'Auth session mangler. Åbn nulstillingslinket fra din mail igen, og prøv straks.'
      );
      return;
    }
    if (!pw1 || !pw2) {
      Alert.alert('Fejl', 'Udfyld begge felter.');
      return;
    }
    if (pw1.length < pwMin) {
      Alert.alert('Fejl', `Kodeord skal mindst være på ${pwMin} tegn.`);
      return;
    }
    if (pw1 !== pw2) {
      Alert.alert('Fejl', 'Kodeordene er ikke ens.');
      return;
    }

    setSubmitting(true);
    const { error } = await supabase.auth.updateUser({ password: pw1 });
    setSubmitting(false);

    if (error) {
      Alert.alert('Fejl', `Kunne ikke opdatere dit kodeord: ${error.message}`);
      return;
    }

    Alert.alert('Succes', 'Dit kodeord er opdateret. Log ind igen.', [
      { text: 'OK', onPress: () => router.replace('/LoginScreen') },
    ]);
  };

  // UI states
  if (checking) {
    return (
      <View style={styles.loadingWrap}>
        <Text style={styles.loadingTxt}>Forbereder nulstilling…</Text>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: '#171C22' }}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
          <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
            {/* Til login */}
            <TouchableOpacity style={styles.backIcon} onPress={() => router.replace('/LoginScreen')}>
              <Text style={{ fontSize: 30, color: '#fff' }}>{'‹'}</Text>
            </TouchableOpacity>

            <Text style={styles.title}>Nyt kodeord</Text>
            <Text style={styles.subtitle}>Indtast dit nye ønskede kodeord nedenfor.</Text>

            {!hasSession ? (
              <View style={{ maxWidth: 320, paddingHorizontal: 12 }}>
                <Text style={styles.help}>
                  Vi kunne ikke finde en aktiv nulstillingssession. Åbn venligst
                  nulstillingslinket fra din mail igen og kom straks herind.
                </Text>
                <TouchableOpacity
                  onPress={() => router.replace('/LoginScreen')}
                  style={[styles.button, { marginTop: 18 }]}
                >
                  <Text style={styles.buttonText}>TIL LOGIN</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <>
                <TextInput
                  style={styles.input}
                  placeholder="Nyt kodeord"
                  placeholderTextColor="#999"
                  secureTextEntry
                  value={pw1}
                  onChangeText={setPw1}
                  autoCapitalize="none"
                />
                <TextInput
                  style={styles.input}
                  placeholder="Bekræft nyt kodeord"
                  placeholderTextColor="#999"
                  secureTextEntry
                  value={pw2}
                  onChangeText={setPw2}
                  autoCapitalize="none"
                />

                <TouchableOpacity
                  style={[styles.button, { opacity: submitting ? 0.6 : pwValid ? 1 : 0.7 }]}
                  disabled={submitting || !pwValid}
                  onPress={handleSave}
                >
                  <Text style={styles.buttonText}>{submitting ? 'GEMMER…' : 'GEM KODEORD'}</Text>
                </TouchableOpacity>

                {!pwValid && (pw1.length > 0 || pw2.length > 0) ? (
                  <Text style={styles.hint}>
                    Kodeord skal være mindst {pwMin} tegn og felterne skal matche.
                  </Text>
                ) : null}
              </>
            )}
          </SafeAreaView>
        </TouchableWithoutFeedback>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  loadingWrap: {
    flex: 1,
    backgroundColor: '#171C22',
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingTxt: { color: '#fff', fontSize: 16, opacity: 0.9 },

  container: {
    flex: 1,
    backgroundColor: '#171C22',
    alignItems: 'center',
    justifyContent: 'center',
  },
  backIcon: {
    position: 'absolute',
    top: 36,
    left: 16,
    zIndex: 99,
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'flex-start',
  },
  title: { color: '#fff', fontSize: 32, fontWeight: '800', marginTop: 56, marginBottom: 8, letterSpacing: 1.2 },
  subtitle: { color: '#d9d9d9', fontSize: 16, textAlign: 'center', marginBottom: 24, paddingHorizontal: 20 },
  help: { color: '#fff', textAlign: 'center', lineHeight: 20, opacity: 0.9 },
  input: {
    backgroundColor: '#fff',
    width: 280,
    height: 48,
    borderRadius: 10,
    paddingHorizontal: 14,
    marginBottom: 18,
    fontSize: 16,
  },
  button: {
    backgroundColor: '#fff',
    borderRadius: 16,
    width: 220,
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 6,
  },
  buttonText: { color: '#171C22', fontSize: 16, fontWeight: '700', letterSpacing: 1 },
  hint: { marginTop: 10, color: '#fff', opacity: 0.8, fontSize: 13 },
});