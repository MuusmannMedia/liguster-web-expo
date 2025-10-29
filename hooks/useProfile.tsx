// hooks/useProfile.tsx
import * as ImagePicker from "expo-image-picker";
import * as ImageManipulator from "expo-image-manipulator";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { Alert, Keyboard } from "react-native";
import { decode } from "base64-arraybuffer";
import { supabase } from "../utils/supabase";

type SupabaseUser = { id: string; email: string; [key: string]: any };
type Profile = { name: string; avatar_url: string | null };

export function useProfile() {
  const [user, setUser] = useState<SupabaseUser | null>(null);
  const [profile, setProfile] = useState<Profile>({ name: "", avatar_url: null });
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [savingName, setSavingName] = useState(false);
  const router = useRouter();

  const fetchProfile = useCallback(async () => {
    setLoading(true);

    const { data: authData, error: authError } = await supabase.auth.getUser();
    if (authError || !authData.user) {
      setUser(null);
      setProfile({ name: "", avatar_url: null });
      setLoading(false);
      return;
    }

    const currentUser = authData.user as SupabaseUser;
    setUser(currentUser);

    const { data: profileData, error: profileError } = await supabase
      .from("users")
      .select("name, avatar_url")
      .eq("id", currentUser.id)
      .single();

    if (profileError && profileError.code === "PGRST116") {
      // mangler række → opret tom profil
      await supabase.from("users").insert([{ id: currentUser.id, email: currentUser.email }]);
      setProfile({ name: "", avatar_url: null });
    } else if (!profileError && profileData) {
      // Håndter både relative stier og allerede fulde URL’er
      let publicUrl: string | null = null;
      const raw = profileData.avatar_url;

      if (raw) {
        if (/^https?:\/\//i.test(raw)) {
          publicUrl = `${raw}?t=${Date.now()}`;
        } else {
          const { data: urlData } = supabase.storage.from("avatars").getPublicUrl(raw);
          publicUrl = urlData?.publicUrl ? `${urlData.publicUrl}?t=${Date.now()}` : null;
        }
      }

      setProfile({ name: profileData.name || "", avatar_url: publicUrl });
    } else if (profileError) {
      console.error("Fejl ved hentning af profil:", profileError);
    }

    setLoading(false);
  }, []);

  useEffect(() => {
    fetchProfile();
  }, [fetchProfile]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.replace("/LoginScreen");
  };

  const pickAndUploadAvatar = async () => {
    if (!user) return;

    const { granted } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!granted) {
      Alert.alert("Adgang påkrævet", "Appen skal have adgang til dine billeder.");
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 1,
    });
    if (result.canceled || !result.assets?.length) return;

    setUploading(true);
    try {
      const asset = result.assets[0];

      // Konverter til JPEG og komprimer en smule, + giv base64
      const manipulated = await ImageManipulator.manipulateAsync(
        asset.uri,
        [{ resize: { width: 1200 } }],
        { compress: 0.75, format: ImageManipulator.SaveFormat.JPEG, base64: true }
      );

      if (!manipulated.base64) {
        throw new Error("Kunne ikke læse billeddata (base64).");
      }

      const filePath = `${user.id}/${Date.now()}.jpg`; // altid .jpg
      const arrayBuffer = decode(manipulated.base64);   // ArrayBuffer (sikkert i RN)

      // Upload uden upsert (kræver kun INSERT-policy)
      const { error: uploadError } = await supabase
        .storage
        .from("avatars")
        .upload(filePath, arrayBuffer, { contentType: "image/jpeg", upsert: false });

      if (uploadError) throw uploadError;

      // Gem relativ sti i DB
      const { error: dbError } = await supabase
        .from("users")
        .update({ avatar_url: filePath })
        .eq("id", user.id);

      if (dbError) throw dbError;

      // Hent offentlig URL til UI
      const { data: urlData } = supabase.storage.from("avatars").getPublicUrl(filePath);
      const publicUrl = urlData?.publicUrl ? `${urlData.publicUrl}?t=${Date.now()}` : null;

      setProfile((prev) => ({ ...prev, avatar_url: publicUrl }));
    } catch (err: any) {
      Alert.alert("Fejl ved upload", err?.message ?? String(err));
    } finally {
      setUploading(false);
    }
  };

  const handleSaveName = async (newName: string) => {
    if (!user) return false;
    setSavingName(true);
    const { error } = await supabase.from("users").update({ name: newName }).eq("id", user.id);
    setSavingName(false);
    if (error) {
      Alert.alert("Kunne ikke gemme navn", error.message);
      return false;
    }
    setProfile((prev) => ({ ...prev, name: newName }));
    Keyboard.dismiss();
    return true;
  };

  return {
    user,
    profile,
    setProfile,   // giver skærmen mulighed for at opdatere lokalt (fx ved slet)
    fetchProfile, // hvis du vil refreshe fra serveren
    loading,
    uploading,
    savingName,
    handleLogout,
    pickAndUploadAvatar,
    handleSaveName,
  };
}