// app/request-password-reset.tsx
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import {
  Alert,
  Linking,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { supabase } from '../utils/supabase';

export default function RequestPasswordResetScreen() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handlePasswordReset = async () => {
    if (!email) {
      Alert.alert('Mangler email', 'Indtast venligst din email.');
      return;
    }
    setLoading(true);

    // Vi beder blot Supabase om at sende mailen.
    // Vi angiver IKKE redirectTo – vi håndterer IKKE deep links i appen.
    const { error } = await supabase.auth.resetPasswordForEmail(email);

    setLoading(false);

    if (error) {
      Alert.alert('Fejl', error.message);
      return;
    }

    // Send brugeren tilbage til login med en lille besked i toppen.
    router.replace({
      pathname: '/LoginScreen',
      params: { resetRequested: '1', resetEmail: email },
    });
  };

  const openMailApp = async () => {
    // Forsøg at åbne standard mail-app (best-effort)
    try {
      await Linking.openURL('message:');
    } catch {
      try {
        await Linking.openURL('mailto:');
      } catch {
        // Ignorer – ikke alle enheder tillader dette.
      }
    }
  };

  return (
    <View style={styles.container}>
      <SafeAreaView style={styles.content}>
        <TouchableOpacity style={styles.backIcon} onPress={() => router.back()}>
          <Text style={{ fontSize: 30, color: '#fff' }}>{'‹'}</Text>
        </TouchableOpacity>

        <Text style={styles.title}>Glemt kodeord</Text>
        <Text style={styles.subtitle}>
          Indtast din email, så sender vi dig en mail med instruktioner til at nulstille dit kodeord.
        </Text>

        <TextInput
          style={styles.input}
          placeholder="Email"
          placeholderTextColor="#999"
          autoCapitalize="none"
          value={email}
          onChangeText={setEmail}
          keyboardType="email-address"
        />

        <TouchableOpacity style={styles.button} onPress={handlePasswordReset} disabled={loading}>
          <Text style={styles.buttonText}>{loading ? 'Sender…' : 'SEND MAIL'}</Text>
        </TouchableOpacity>

        <TouchableOpacity style={[styles.linkBtn, { marginTop: 14 }]} onPress={openMailApp}>
          <Text style={styles.linkTxt}>Åbn din mail-app</Text>
        </TouchableOpacity>

        <View style={{ marginTop: 18, paddingHorizontal: 24 }}>
          <Text style={styles.helper}>
            ✅ Vi sender en e-mail med instruktioner. Kan du ikke finde den, så tjek din spammappe.
            Har du stadig problemer, skriv til <Text style={{ fontWeight: '700' }}>support@liguster-app.dk</Text>.
          </Text>
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#171C22' },
  content: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  backIcon: { position: 'absolute', top: 36, left: 16, zIndex: 99 },
  title: { color: '#fff', fontSize: 28, fontWeight: '700', marginBottom: 12 },
  subtitle: { color: '#ccc', fontSize: 16, textAlign: 'center', marginBottom: 24, paddingHorizontal: 20 },
  input: {
    backgroundColor: '#fff',
    width: '80%',
    height: 48,
    borderRadius: 10,
    paddingHorizontal: 14,
    marginBottom: 18,
    fontSize: 16,
  },
  button: {
    backgroundColor: '#fff',
    borderRadius: 16,
    width: '70%',
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 12,
  },
  buttonText: { color: '#171C22', fontSize: 16, fontWeight: '700', letterSpacing: 1 },
  linkBtn: { paddingVertical: 6, paddingHorizontal: 12, borderRadius: 8 },
  linkTxt: { color: '#fff', textDecorationLine: 'underline', opacity: 0.9 },
  helper: { color: '#d9d9d9', textAlign: 'center', lineHeight: 20 },
});