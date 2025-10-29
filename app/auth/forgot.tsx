// app/auth/forgot.tsx
import { useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { supabase } from '../../utils/supabase';

export default function ForgotPasswordScreen() {
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);

  async function onSend() {
    const trimmed = email.trim().toLowerCase();
    if (!trimmed) {
      Alert.alert('Skriv din e-mail.');
      return;
    }

    setBusy(true);
    try {
      // SKAL matche Supabase Redirect Allowlist:
      // https://www.liguster-app.dk/reset
      const redirectTo = 'https://www.liguster-app.dk/reset';

      const { error } = await supabase.auth.resetPasswordForEmail(trimmed, {
        redirectTo,
      });

      // Neutral besked for ikke at afsløre brugere
      Alert.alert(
        'Hvis adressen findes, har vi sendt et link til at nulstille adgangskoden.'
      );

      if (error) console.log('resetPasswordForEmail error:', error.message);
    } catch (e: any) {
      Alert.alert(
        'Hvis adressen findes, har vi sendt et link til at nulstille adgangskoden.'
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={s.root}
      behavior={Platform.select({ ios: 'padding', android: 'height' })}
    >
      <View style={s.card}>
        <Text style={s.title}>Nulstil adgangskode</Text>
        <TextInput
          style={s.input}
          placeholder="Din e-mail"
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
          value={email}
          onChangeText={setEmail}
          returnKeyType="send"
          onSubmitEditing={onSend}
          textContentType="username"
        />
        <TouchableOpacity
          style={[s.btn, busy && { opacity: 0.7 }]}
          onPress={onSend}
          disabled={busy}
        >
          <Text style={s.btnText}>{busy ? 'Sender…' : 'Send reset-link'}</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#171C22', alignItems: 'center', justifyContent: 'center', padding: 20 },
  card: { width: 320, backgroundColor: '#fff', borderRadius: 14, padding: 16 },
  title: { fontSize: 20, fontWeight: '700', marginBottom: 12, color: '#0f172a' },
  input: { height: 48, borderRadius: 10, borderWidth: 1, borderColor: '#e5e7eb', paddingHorizontal: 12, marginBottom: 12 },
  btn: { height: 48, borderRadius: 10, backgroundColor: '#131921', alignItems: 'center', justifyContent: 'center' },
  btnText: { color: '#fff', fontWeight: '700' },
});