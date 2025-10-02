// hooks/useProfile.ts
import { Buffer } from 'buffer';
import * as FileSystem from 'expo-file-system';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Alert, Keyboard } from 'react-native';
import { supabase } from '../utils/supabase';

type SupabaseUser = { id: string; email: string; [key: string]: any };
type Profile = { name: string; avatar_url: string | null };

export function useProfile() {
  const [user, setUser] = useState<SupabaseUser | null>(null);
  const [profile, setProfile] = useState<Profile>({ name: '', avatar_url: null });
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [savingName, setSavingName] = useState(false);
  const router = useRouter();

  const fetchProfile = useCallback(async () => {
    setLoading(true);
    const { data: authData, error: authError } = await supabase.auth.getUser();
    if (authError || !authData.user) {
      setUser(null);
      setProfile({ name: '', avatar_url: null });
      setLoading(false);
      return;
    }
    const currentUser = authData.user as SupabaseUser;
    setUser(currentUser);

    const { data: profileData, error: profileError } = await supabase
      .from('users')
      .select('name, avatar_url')
      .eq('id', currentUser.id)
      .single();

    if (profileError && profileError.code === 'PGRST116') {
      await supabase.from('users').insert([{ id: currentUser.id, email: currentUser.email }]);
      setProfile({ name: '', avatar_url: null });
    } else if (!profileError && profileData) {
      let publicUrl: string | null = null;
      if (profileData.avatar_url) {
        const { data: urlData } = supabase.storage.from('avatars').getPublicUrl(profileData.avatar_url);
        publicUrl = urlData?.publicUrl ? `${urlData.publicUrl}?t=${Date.now()}` : null;
      }
      setProfile({ name: profileData.name || '', avatar_url: publicUrl });
    } else if (profileError) {
      console.error('Fejl ved hentning af profil:', profileError);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchProfile();
  }, [fetchProfile]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.replace('/LoginScreen');
  };

  const pickAndUploadAvatar = async () => {
    if (!user) return;

    const { granted } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!granted) {
      Alert.alert('Adgang påkrævet', 'Appen skal have adgang til dine billeder.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.7,
    });
    if (result.canceled || !result.assets?.length) return;

    setUploading(true);
    try {
      const asset = result.assets[0];
      const ext = asset.uri.split('.').pop()?.toLowerCase() || 'jpg';
      const filePath = `${user.id}/${Date.now()}.${ext}`;

      const fileData = await FileSystem.readAsStringAsync(asset.uri, {
        encoding: FileSystem.EncodingType.Base64,
      });
      const fileBuffer = Buffer.from(fileData, 'base64');

      // ✅ Storage API
      const { error: uploadError } = await supabase
        .storage
        .from('avatars')
        .upload(filePath, fileBuffer, { upsert: true, contentType: `image/${ext}` });
      if (uploadError) throw uploadError;

      const { error: dbError } = await supabase
        .from('users')
        .update({ avatar_url: filePath })
        .eq('id', user.id);
      if (dbError) throw dbError;

      const { data: urlData } = supabase.storage.from('avatars').getPublicUrl(filePath);
      const publicUrl = urlData?.publicUrl ? `${urlData.publicUrl}?t=${Date.now()}` : null;

      // Opdater UI med det samme
      setProfile(prev => ({ ...prev, avatar_url: publicUrl }));
    } catch (err: any) {
      Alert.alert('Fejl ved upload', err.message ?? String(err));
    } finally {
      setUploading(false);
    }
  };

  const handleSaveName = async (newName: string) => {
    if (!user) return false;
    setSavingName(true);
    const { error } = await supabase.from('users').update({ name: newName }).eq('id', user.id);
    setSavingName(false);
    if (error) {
      Alert.alert('Kunne ikke gemme navn', error.message);
      return false;
    }
    setProfile(prev => ({ ...prev, name: newName }));
    Keyboard.dismiss();
    return true;
  };

  return {
    user,
    profile,
    setProfile,   // ← giver skærmen mulighed for at opdatere lokalt (fx ved slet)
    fetchProfile, // ← hvis du vil refreshe fra serveren
    loading,
    uploading,
    savingName,
    handleLogout,
    pickAndUploadAvatar,
    handleSaveName,
  };
}