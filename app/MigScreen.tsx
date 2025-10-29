// app/MigScreen.tsx
import { useNavigation } from '@react-navigation/native';
import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import { decode } from 'base64-arraybuffer';
import BottomNav from '../components/BottomNav';
import { useProfile } from '../hooks/useProfile';
import { supabase } from '../utils/supabase';

const PLACEHOLDER = 'https://placehold.co/250x250?text=Profil';

/** Fælles afrundinger (matcher Events/Threads) */
const RADII = { sm: 10, md: 14, lg: 18, xl: 22 };

/** ====== iPhone vs iPad størrelser ====== */
const iPhoneSizes = {
  nameFont: 16,
  nameInputFont: 16,
  buttonFont: 12,
  actionFont: 13,
  emailFont: 12,
  statusFont: 10,
  buttonHeight: 36,
  cardPadding: 22,
  sectionGapBelowName: 10,
  sectionGapBelowButtons: 12,
};

const iPadSizes = {
  nameFont: 30,
  nameInputFont: 20,
  buttonFont: 14,
  actionFont: 15,
  emailFont: 14,
  statusFont: 14,
  buttonHeight: 42,
  cardPadding: 46,
  sectionGapBelowName: 14,
  sectionGapBelowButtons: 18,
};

/** Hjælpere til billede */
async function compressImage(uri: string, maxWidth = 1200, quality = 0.5) {
  return ImageManipulator.manipulateAsync(
    uri,
    [{ resize: { width: maxWidth } }],
    { compress: quality, format: ImageManipulator.SaveFormat.JPEG, base64: true }
  );
}

/** ====== Navn-editor ====== */
const NameEditor = ({
  initialName,
  onSave,
  savingName,
  isTablet,
}: {
  initialName?: string | null;
  onSave: (name: string) => Promise<boolean>;
  savingName: boolean;
  isTablet: boolean;
}) => {
  const [name, setName] = useState(initialName ?? '');
  const [editing, setEditing] = useState(false);
  const sizes = isTablet ? iPadSizes : iPhoneSizes;

  const handleSave = async () => {
    const success = await onSave(name.trim());
    if (success) setEditing(false);
  };

  if (editing) {
    return (
      <>
        <TextInput
          value={name}
          onChangeText={setName}
          placeholder="Indtast navn"
          style={[
            styles.name,
            styles.nameInput,
            { fontSize: sizes.nameInputFont, paddingVertical: 7 },
          ]}
          autoFocus
          returnKeyType="done"
          onSubmitEditing={handleSave}
        />
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 14 }}>
          <TouchableOpacity onPress={handleSave} disabled={savingName}>
            <Text style={[styles.actionText, { color: '#259030', fontSize: sizes.actionFont }]}>
              {savingName ? 'GEMMER…' : 'GEM'}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => { setEditing(false); Keyboard.dismiss(); }}>
            <Text style={[styles.actionText, { color: '#F44', fontSize: sizes.actionFont }]}>ANNULLER</Text>
          </TouchableOpacity>
        </View>
      </>
    );
  }

  return (
    <>
      <Text style={[styles.name, { fontSize: sizes.nameFont }]}>{initialName || 'Bruger'}</Text>
      <TouchableOpacity
        onPress={() => setEditing(true)}
        style={[
          styles.actionBox,
          { height: sizes.buttonHeight, alignSelf: 'center', paddingHorizontal: 18, marginTop: 6 },
        ]}
      >
        <Text style={[styles.actionBoxText, { fontSize: sizes.buttonFont }]}>RET NAVN</Text>
      </TouchableOpacity>
    </>
  );
};

/** ====== Skærm ====== */
export default function MigScreen() {
  const navigation = useNavigation<any>();
  const { user, profile, loading, handleLogout, setProfile } = useProfile();

  const [savingNameLocal, setSavingNameLocal] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);

  const { width, height } = useWindowDimensions();
  const isTablet =
    (Platform.OS === 'ios' && // @ts-ignore
      (Platform as any).isPad) || Math.min(width, height) >= 768;

  const sizes = isTablet ? iPadSizes : iPhoneSizes;

  const H_PADDING = 14;
  const cardMaxWidth = Math.min(width - H_PADDING * 2, isTablet ? 720 : 420);

  // Højde på BottomNav + lille top-nudge for at skubbe kortet en anelse ned
  const NAV_HEIGHT = isTablet ? 160 : 120;
  const TOP_NUDGE = isTablet ? 26 : 20;

  // Gem navn i både public.users og auth metadata
  const saveNameBoth = async (newName: string) => {
    if (!user?.id) return false;
    if (!newName) {
      Alert.alert('Fejl', 'Navn må ikke være tomt.');
      return false;
    }
    try {
      setSavingNameLocal(true);
      const [authRes, dbRes] = await Promise.allSettled([
        supabase.auth.updateUser({ data: { full_name: newName } }),
        supabase.from('users').update({ name: newName }).eq('id', user.id),
      ]);
      if (authRes.status === 'rejected') throw new Error(authRes.reason?.message || 'Kunne ikke opdatere auth-profil.');
      if (dbRes.status === 'rejected' || (dbRes.status === 'fulfilled' && (dbRes.value as any)?.error)) {
        throw new Error((dbRes as any)?.value?.error?.message || 'Kunne ikke opdatere brugerprofil i databasen.');
      }
      setProfile((prev: any) => ({ ...prev, name: newName }));
      return true;
    } catch (e: any) {
      Alert.alert('Fejl', e?.message ?? 'Kunne ikke gemme navnet.');
      return false;
    } finally {
      setSavingNameLocal(false);
    }
  };

  const removeAvatar = async () => {
    if (!user?.id) return;
    try {
      setRemoving(true);
      const { error } = await supabase.from('users').update({ avatar_url: null }).eq('id', user.id);
      if (error) Alert.alert('Fejl', 'Kunne ikke slette billede: ' + error.message);
      else setProfile((prev: any) => ({ ...prev, avatar_url: null }));
    } finally {
      setRemoving(false);
    }
  };

  /** 📷 Vælg & upload avatar — robust med base64 */
  const pickAndUploadAvatarLocal = async () => {
    if (!user?.id) return;

    try {
      setUploadingAvatar(true);

      // 1) Tilladelse
      const libPerm = await ImagePicker.getMediaLibraryPermissionsAsync();
      if (!libPerm.granted) {
        const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (status !== 'granted') {
          Alert.alert('Adgang nægtet', 'Giv adgang til billeder for at kunne uploade.');
          return;
        }
      }

      // 2) Vælg billede – bemærk base64: true
      const res = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [5, 6],
        quality: 1,
        base64: true,
      });

      // Afbrudt
      // @ts-ignore
      if (res.canceled) return;

      // @ts-ignore
      const asset = res.assets?.[0];
      if (!asset?.uri) {
        throw new Error('Intet billede valgt.');
      }

      // 3) Sørg for base64 (nogle platforme leverer ikke altid base64)
      let base64 = asset.base64 as string | undefined;
      if (!base64) {
        const manipulated = await compressImage(asset.uri, 1200, 0.5);
        base64 = manipulated.base64 || undefined;
      }
      if (!base64) {
        throw new Error('Kunne ikke læse billedet (base64 mangler).');
      }

      // 4) Upload til Supabase Storage
      const BUCKET = 'avatars';
      const filePath = `public/${user.id}_${Date.now()}.jpg`;

      const { error: upErr } = await supabase.storage
        .from(BUCKET)
        .upload(filePath, decode(base64), {
          contentType: 'image/jpeg',
          upsert: true,
        });

      if (upErr) throw upErr;

      const { data } = supabase.storage.from(BUCKET).getPublicUrl(filePath);
      const publicUrl = data?.publicUrl;
      if (!publicUrl) throw new Error('Kunne ikke få public URL for billedet.');

      // 5) Gem på bruger
      const { error: updErr } = await supabase.from('users').update({ avatar_url: publicUrl }).eq('id', user.id);
      if (updErr) throw updErr;

      setProfile((prev: any) => ({ ...prev, avatar_url: publicUrl }));
    } catch (e: any) {
      Alert.alert('Fejl ved upload', e?.message ?? 'Ukendt fejl ved upload.');
    } finally {
      setUploadingAvatar(false);
    }
  };

  const confirmDeleteAccount = () => {
    Alert.alert(
      'Slet konto',
      'Du er nu ved at slette din konto. Dette kan ikke gøres om. Når din konto er slettet vil alt dit indhold forsvinde fra Liguster!',
      [{ text: 'Annuller', style: 'cancel' }, { text: 'Slet', style: 'destructive', onPress: deleteAccount }],
    );
  };

  const deleteAccount = async () => {
    const { user } = await supabase.auth.getUser();
    if (!user) return;
    try {
      setDeleting(true);
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData?.session?.access_token;
      if (!accessToken) {
        Alert.alert('Fejl', 'Ingen gyldig session. Prøv at logge ind igen.');
        return;
      }
      const url = 'https://gizskyfynvyvhnaqcyax.functions.supabase.co/delete-account';
      const res = await fetch(url, {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      });
      if (!res.ok) {
        const txt = await res.text().catch(() => '');
        throw new Error(`Delete function fejlede (${res.status}): ${txt || 'Ukendt fejl'}`);
      }
      await supabase.auth.signOut();
      navigation.reset({ index: 0, routes: [{ name: 'LoginScreen' }] });
    } catch (e: any) {
      Alert.alert('Fejl', e?.message ?? 'Kunne ikke slette kontoen.');
    } finally {
      setDeleting(false);
    }
  };

  const imageSource =
    profile?.avatar_url && profile.avatar_url.startsWith('http')
      ? { uri: profile.avatar_url }
      : { uri: PLACEHOLDER };

  if (loading) {
    return (
      <View style={[styles.root, { justifyContent: 'center' }]}>
        <ActivityIndicator size="large" color="#fff" />
      </View>
    );
  }

  const initialDisplayName =
    profile?.name ??
    // @ts-ignore
    user?.user_metadata?.full_name ??
    user?.email?.split('@')[0];

  return (
    <SafeAreaView style={styles.root} edges={['top', 'bottom']}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 64 : 0}
      >
        <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
          <View
            style={[
              styles.centerArea,
              {
                paddingHorizontal: 14,
                paddingTop: isTablet ? 26 : 20,
                paddingBottom: isTablet ? 160 : 120,
                minHeight: Math.max(0, height - (isTablet ? 160 : 120)),
              },
            ]}
          >
            <View
              style={[
                styles.card,
                { padding: (isTablet ? iPadSizes : iPhoneSizes).cardPadding, width: '100%', maxWidth: Math.min(width - 28, isTablet ? 720 : 420), alignSelf: 'center' },
              ]}
            >
              {/* Billede – fuld bredde, 5:6 */}
              <Image
                source={imageSource}
                style={[styles.avatar, { width: '100%', aspectRatio: 5 / 6, marginBottom: 10 }]}
                resizeMode="cover"
              />

              {/* Navn + sort "RET NAVN" knap */}
              <View style={{ alignItems: 'center', width: '100%', marginBottom: (isTablet ? iPadSizes : iPhoneSizes).sectionGapBelowName }}>
                <NameEditor
                  initialName={initialDisplayName}
                  onSave={saveNameBoth}
                  savingName={savingNameLocal}
                  isTablet={isTablet}
                />
              </View>

              {/* 4 knapper i to rækker under navnet */}
              <View style={[styles.fullRow, { gap: 10 }]}>
                <TouchableOpacity
                  onPress={pickAndUploadAvatarLocal}
                  disabled={uploadingAvatar}
                  style={[styles.actionBox, { height: (isTablet ? iPadSizes : iPhoneSizes).buttonHeight, flex: 1 }]}
                >
                  <Text style={[styles.actionBoxText, { fontSize: (isTablet ? iPadSizes : iPhoneSizes).buttonFont }]}>
                    {uploadingAvatar ? 'UPLOADER…' : 'RET BILLEDE'}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={removeAvatar}
                  disabled={removing}
                  style={[styles.actionBox, { height: (isTablet ? iPadSizes : iPhoneSizes).buttonHeight, flex: 1 }]}
                >
                  <Text style={[styles.actionBoxText, { fontSize: (isTablet ? iPadSizes : iPhoneSizes).buttonFont }]}>
                    {removing ? 'SLETTER…' : 'SLET BILLEDE'}
                  </Text>
                </TouchableOpacity>
              </View>

              <View style={{ height: (isTablet ? iPadSizes : iPhoneSizes).sectionGapBelowButtons }} />

              <View style={[styles.fullRow, { gap: 10 }]}>
                <TouchableOpacity
                  onPress={handleLogout}
                  disabled={deleting}
                  style={[styles.actionBox, { height: (isTablet ? iPadSizes : iPhoneSizes).buttonHeight, flex: 1 }]}
                >
                  <Text style={[styles.actionBoxText, { fontSize: (isTablet ? iPadSizes : iPhoneSizes).buttonFont }]}>LOG UD</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={confirmDeleteAccount}
                  disabled={deleting}
                  style={[styles.actionBox, { height: (isTablet ? iPadSizes : iPhoneSizes).buttonHeight, flex: 1 }]}
                >
                  <Text style={[styles.actionBoxText, { fontSize: (isTablet ? iPadSizes : iPhoneSizes).buttonFont }]}>
                    {deleting ? 'SLETTER…' : 'SLET KONTO'}
                  </Text>
                </TouchableOpacity>
              </View>

              {/* Email + status nederst */}
              <Text style={[styles.email, { fontSize: (isTablet ? iPadSizes : iPhoneSizes).emailFont }]}>{user?.email ?? 'Ingen email'}</Text>
              <Text style={[styles.status, { fontSize: (isTablet ? iPadSizes : iPhoneSizes).statusFont }]}>
                {user ? 'Du er logget ind' : 'Du er ikke logget ind'}
              </Text>
            </View>
          </View>
        </TouchableWithoutFeedback>
      </KeyboardAvoidingView>
      <BottomNav />
    </SafeAreaView>
  );
}

/** ====== Styles (device-uafhængige) ====== */
const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#869FB9' },
  centerArea: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },

  card: {
    backgroundColor: '#fff',
    borderRadius: RADII.xl,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
  },

  avatar: {
    borderRadius: RADII.xl,
    borderWidth: 0,
    borderColor: '#E8ECF1',
    overflow: 'hidden',
  },

  name: {
    fontWeight: '700',
    color: '#2A2D34',
    marginBottom: 2,
    minWidth: 80,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  nameInput: {
    borderBottomWidth: 1,
    borderColor: '#7C8996',
    textAlign: 'center',
    backgroundColor: '#f7f7f7',
    marginBottom: 10,
    borderRadius: RADII.xl,
    paddingHorizontal: 12,
  },

  actionText: { fontWeight: 'bold', textDecorationLine: 'underline' },
  email: { color: '#6B7280', marginTop: 12, textAlign: 'center' },
  status: { color: '#2A2D34', opacity: 0.7, marginTop: 6, textAlign: 'center' },

  actionBox: {
    backgroundColor: '#131921',
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 14,
  },
  actionBoxText: { color: '#fff', fontWeight: 'bold', textAlign: 'center' },

  fullRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    width: '100%',
  },
});