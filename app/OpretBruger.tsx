// app/OpretBruger.tsx
import { Ionicons } from '@expo/vector-icons'; // expo install @expo/vector-icons
import { useRouter } from 'expo-router';
import React, { useMemo, useRef, useState } from 'react';
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

export const options = { headerShown: false };

export default function OpretBruger() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const pwdRef = useRef<TextInput>(null);
  const confirmRef = useRef<TextInput>(null);

  const emailTrimmed = email.trim();
  const isEmailValid = useMemo(
    () => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailTrimmed),
    [emailTrimmed]
  );
  const isPasswordStrong = password.length >= 8;
  const passwordsMatch = confirm === password;

  const canSubmit = isEmailValid && isPasswordStrong && passwordsMatch && !loading;

  const handleSignup = async () => {
    if (!isEmailValid) return Alert.alert('Fejl', 'Indtast en gyldig email.');
    if (!isPasswordStrong) return Alert.alert('Fejl', 'Password skal være mindst 8 tegn.');
    if (!passwordsMatch) return Alert.alert('Fejl', 'Passwords er ikke ens.');

    try {
      setLoading(true);

      const { data, error } = await supabase.auth.signUp({
        email: emailTrimmed,
        password,
        options: {
          emailRedirectTo: 'ligusterapp://LoginScreen',
        },
      });

      if (error) throw error;

      // Opret i users-tabellen
      try {
        const userId = data?.user?.id || data?.session?.user?.id;
        const userEmail = data?.user?.email || data?.session?.user?.email || emailTrimmed;
        if (userId && userEmail) {
          const { data: existing } = await supabase
            .from('users')
            .select('id')
            .eq('id', userId)
            .maybeSingle();

          if (!existing) {
            await supabase.from('users').insert([{ id: userId, email: userEmail }]);
          }
        }
      } catch {
        // Ignorér sekundær fejl
      }

      Alert.alert(
        'Succes',
        'Din bruger er oprettet! Tjek din email for at bekræfte, og log derefter ind.'
      );
      router.replace('/LoginScreen');
    } catch (e: any) {
      Alert.alert('Fejl', e?.message || 'Noget gik galt. Prøv igen.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: '#171C22' }}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
          <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
            <TouchableOpacity style={styles.backIcon} onPress={() => router.replace('/')}>
              <Text style={{ fontSize: 30, color: '#fff' }}>{'‹'}</Text>
            </TouchableOpacity>

            <Text style={styles.title}>Opret bruger</Text>
            <Text style={styles.gdpr}>
              Vi gemmer kun din email for at kunne vise din profil.{"\n"}
              Vi deler den aldrig med andre.
            </Text>

            <TextInput
              style={styles.input}
              placeholder="Email"
              placeholderTextColor="#999"
              autoCapitalize="none"
              keyboardType="email-address"
              textContentType="emailAddress"
              value={email}
              onChangeText={setEmail}
              returnKeyType="next"
              onSubmitEditing={() => pwdRef.current?.focus()}
              blurOnSubmit={false}
            />

            {/* Password felt med toggle */}
            <View style={styles.passwordWrapper}>
              <TextInput
                ref={pwdRef}
                style={[styles.input, { flex: 1, marginBottom: 0 }]}
                placeholder="Password (min. 8 tegn)"
                placeholderTextColor="#999"
                secureTextEntry={!showPassword}
                textContentType="newPassword"
                value={password}
                onChangeText={setPassword}
                returnKeyType="next"
                onSubmitEditing={() => confirmRef.current?.focus()}
                blurOnSubmit={false}
              />
              <TouchableOpacity onPress={() => setShowPassword(!showPassword)} style={styles.eye}>
                <Ionicons
                  name={showPassword ? 'eye-off' : 'eye'}
                  size={22}
                  color="#555"
                />
              </TouchableOpacity>
            </View>

            {/* Bekræft password felt med toggle */}
            <View style={styles.passwordWrapper}>
              <TextInput
                ref={confirmRef}
                style={[styles.input, { flex: 1, marginBottom: 0 }]}
                placeholder="Bekræft password"
                placeholderTextColor="#999"
                secureTextEntry={!showConfirm}
                textContentType="newPassword"
                value={confirm}
                onChangeText={setConfirm}
                returnKeyType="go"
                onSubmitEditing={canSubmit ? handleSignup : undefined}
              />
              <TouchableOpacity onPress={() => setShowConfirm(!showConfirm)} style={styles.eye}>
                <Ionicons
                  name={showConfirm ? 'eye-off' : 'eye'}
                  size={22}
                  color="#555"
                />
              </TouchableOpacity>
            </View>

            {!isEmailValid && email.length > 0 && (
              <Text style={styles.hint}>Indtast en gyldig email-adresse.</Text>
            )}
            {!isPasswordStrong && password.length > 0 && (
              <Text style={styles.hint}>Password skal være mindst 8 tegn.</Text>
            )}
            {!passwordsMatch && confirm.length > 0 && (
              <Text style={styles.hint}>Passwords er ikke ens.</Text>
            )}

            <TouchableOpacity
              style={[styles.button, !canSubmit && { opacity: 0.55 }]}
              onPress={handleSignup}
              disabled={!canSubmit}
            >
              <Text style={styles.buttonText}>{loading ? 'OPRETTER…' : 'OPRET BRUGER'}</Text>
            </TouchableOpacity>
          </SafeAreaView>
        </TouchableWithoutFeedback>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#171C22',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  backIcon: {
    position: 'absolute',
    top: 45,
    left: 25,
    zIndex: 99,
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'flex-start',
  },
  gdpr: {
    color: '#fff',
    fontSize: 13,
    opacity: 0.8,
    marginBottom: 22, // ekstra luft ned til email-feltet
    marginHorizontal: 20,
    textAlign: 'center',
    lineHeight: 18,
  },
  title: {
    color: '#fff',
    fontSize: 28,
    fontWeight: '700',
    marginTop: 56,
    marginBottom: 14,
    letterSpacing: 1.5,
  },
  input: {
    backgroundColor: '#fff',
    width: 260,
    height: 48,
    borderRadius: 40,
    paddingHorizontal: 14,
    marginBottom: 18,
    fontSize: 16,
  },
  passwordWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    width: 260,
    marginBottom: 18,
    backgroundColor: '#fff',
    borderRadius: 40,
    paddingRight: 8,
  },
  eye: { padding: 6 },
  hint: {
    color: '#fca5a5',
    fontSize: 12,
    marginBottom: 6,
  },
  button: {
    backgroundColor: '#ffffffff', // mørk blå baggrund
    borderRadius: 40,
    width: 260,                 // samme bredde som inputfelterne
    height: 48,                 // samme højde som inputfelterne
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 18,
  },
  buttonText: {
    color: '#000000ff',              // hvid tekst
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 1,
  },
});