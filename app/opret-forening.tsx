// app/opret-forening.tsx

import { Feather } from '@expo/vector-icons';
import { Buffer } from 'buffer';
import * as FileSystem from 'expo-file-system';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import {
  Alert,
  Image,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '../utils/supabase';

export default function OpretForeningScreen() {
  const [name, setName] = useState('');
  const [location, setLocation] = useState('');
  const [description, setDescription] = useState('');
  const [billede, setBillede] = useState(null);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const pickImage = async () => {
    const { granted } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!granted) {
      return Alert.alert('Adgang påkrævet', 'Du skal give adgang til kamerarullen for at tilføje et billede.');
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [16, 9],
      quality: 0.7,
    });
    if (!result.canceled && result.assets?.[0]) {
      setBillede(result.assets[0]);
    }
  };

  const handleOpret = async () => {
    if (!name.trim() || !location.trim() || !description.trim()) {
      return Alert.alert('Udfyld alle felter', 'Du skal angive et navn, sted og en beskrivelse for foreningen.');
    }
    setLoading(true);

    try {
      let image_url = null;
      if (billede && billede.uri) {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error("Bruger ikke fundet.");

        const ext = billede.uri.split('.').pop()?.toLowerCase() || 'jpg';
        const fileName = `${user.id}/${Date.now()}.${ext}`;
        const fileData = await FileSystem.readAsStringAsync(billede.uri, { encoding: FileSystem.EncodingType.Base64 });
        const fileBuffer = Buffer.from(fileData, 'base64');
        const contentType = `image/${ext === 'jpg' ? 'jpeg' : ext}`;

        const { error: uploadError } = await supabase.storage
          .from('forenings-billeder')
          .upload(fileName, fileBuffer, { contentType, upsert: true });
        if (uploadError) throw uploadError;

        const { data: urlData } = supabase.storage.from('forenings-billeder').getPublicUrl(fileName);
        image_url = urlData.publicUrl;
      }

      const payload = { navn: name, sted: location, beskrivelse: description, billede_url };
      
      // --- RETTELSE: Forenklet kald uden manuel header ---
      // Supabase-klienten vedhæfter selv den korrekte Authorization header.
      const { error: functionError } = await supabase.functions.invoke('opret-forening', {
        body: payload,
      });

      if (functionError) throw functionError;

      Alert.alert('Success!', 'Din forening er nu oprettet, og du er administrator.');
      router.back();

    } catch (error: any) {
      console.error("Fejl under opret forening:", error);
      Alert.alert('Fejl', 'Kunne ikke oprette foreningen: ' + (error.message ?? String(error)));
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
          <ScrollView contentContainerStyle={styles.scrollContainer}>
            <View style={styles.header}>
              <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} disabled={loading}>
                <Feather name="chevron-left" size={28} color="#fff" />
              </TouchableOpacity>
              <Text style={styles.headerTitle}>Opret ny forening</Text>
            </View>
            <View style={styles.form}>
              <Text style={styles.label}>Navn på forening</Text>
              <TextInput style={styles.input} value={name} onChangeText={setName} placeholder="F.eks. Vejens Vinklub" placeholderTextColor="#999" editable={!loading} />
              <Text style={styles.label}>Sted</Text>
              <TextInput style={styles.input} value={location} onChangeText={setLocation} placeholder="F.eks. Lyngby, 2800" placeholderTextColor="#999" editable={!loading} />
              <Text style={styles.label}>Beskrivelse</Text>
              <TextInput style={[styles.input, styles.textArea]} value={description} onChangeText={setDescription} placeholder="Fortæl kort om formålet med foreningen..." placeholderTextColor="#999" multiline editable={!loading} />
              <Text style={styles.label}>Billede (valgfrit)</Text>
              <TouchableOpacity style={styles.imagePicker} onPress={pickImage} disabled={loading}>
                {billede ? <Image source={{ uri: billede.uri }} style={styles.imagePreview} /> : <View style={styles.imagePlaceholder}><Feather name="camera" size={24} color="#555" /><Text style={styles.imagePlaceholderText}>Vælg billede</Text></View>}
              </TouchableOpacity>
            </View>
            <TouchableOpacity style={styles.submitBtn} onPress={handleOpret} disabled={loading}>
              <Text style={styles.submitBtnText}>{loading ? 'OPRETTER...' : 'OPRET FORENING'}</Text>
            </TouchableOpacity>
          </ScrollView>
        </TouchableWithoutFeedback>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#171C22' },
  scrollContainer: { flexGrow: 1, alignItems: 'center', paddingBottom: 40 },
  header: { width: '100%', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 10, paddingHorizontal: 16, marginBottom: 20 },
  backBtn: { position: 'absolute', left: 16, padding: 5 },
  headerTitle: { color: '#fff', fontSize: 18, fontWeight: 'bold' },
  form: { width: '90%' },
  label: { color: '#fff', fontSize: 14, fontWeight: '600', marginBottom: 8, marginLeft: 4 },
  input: { backgroundColor: '#fff', borderRadius: 8, paddingHorizontal: 14, paddingVertical: 12, fontSize: 16, marginBottom: 18, color: '#222' },
  textArea: { minHeight: 100, textAlignVertical: 'top' },
  imagePicker: { width: '100%', height: 120, borderRadius: 8, backgroundColor: '#f0f0f0', justifyContent: 'center', alignItems: 'center', marginBottom: 20, borderWidth: 1, borderColor: '#444', borderStyle: 'dashed' },
  imagePreview: { width: '100%', height: '100%', borderRadius: 8 },
  imagePlaceholder: { alignItems: 'center' },
  imagePlaceholderText: { color: '#555', marginTop: 8, fontSize: 12 },
  submitBtn: { backgroundColor: '#fff', borderRadius: 12, paddingVertical: 16, width: '90%', alignItems: 'center', marginTop: 20 },
  submitBtnText: { color: '#171C22', fontSize: 16, fontWeight: 'bold', letterSpacing: 1 },
});
