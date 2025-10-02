// components/Forening/ForeningHeader.tsx
import React, { useState } from 'react';
import { View, Text, Image, TextInput, TouchableOpacity, StyleSheet, useWindowDimensions } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { decode } from 'base64-arraybuffer';
import type { Forening } from '../../types/forening';
import { setForeningImageUrl, updateForeningText } from '../../lib/foreningApi';
import { supabase } from '../../utils/supabase';

type Props = {
  forening: Forening;
  isOwner: boolean;
  onUpdateLocal: (patch: Partial<Forening>) => void;
};

export default function ForeningHeader({ forening, isOwner, onUpdateLocal }: Props) {
  const { width } = useWindowDimensions();
  const isTablet = width >= 768;

  const [editMode, setEditMode] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editNavn, setEditNavn] = useState(forening.navn || '');
  const [editSted, setEditSted] = useState(forening.sted || '');
  const [editBeskrivelse, setEditBeskrivelse] = useState(forening.beskrivelse || '');
  const [uploading, setUploading] = useState(false);

  const handleSave = async () => {
    if (!isOwner) return;
    setSaving(true);
    try {
      await updateForeningText(forening.id, {
        navn: editNavn.trim(),
        sted: editSted.trim(),
        beskrivelse: editBeskrivelse.trim(),
      });
      onUpdateLocal({ navn: editNavn.trim(), sted: editSted.trim(), beskrivelse: editBeskrivelse.trim() });
      setEditMode(false);
    } finally {
      setSaving(false);
    }
  };

  const handleUpload = async () => {
    if (!isOwner) return;
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.8, base64: true });
    if (res.canceled) return;
    const file = res.assets?.[0];
    if (!file?.base64) return;

    setUploading(true);
    try {
      const ext = (file.uri.split('.').pop() || 'jpg').toLowerCase();
      const fileName = `${forening.id}_${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage.from('foreningsbilleder').upload(fileName, decode(file.base64), {
        contentType: file.type || 'image/jpeg',
        upsert: true,
      });
      if (upErr) throw upErr;
      const { data } = supabase.storage.from('foreningsbilleder').getPublicUrl(fileName);
      await setForeningImageUrl(forening.id, data.publicUrl);
      onUpdateLocal({ billede_url: data.publicUrl });
    } finally {
      setUploading(false);
    }
  };

  return (
    <View style={styles.card}>
      {forening.billede_url ? (
        <Image source={{ uri: forening.billede_url }} style={[styles.hero, isTablet && styles.heroTablet]} />
      ) : (
        <View style={[styles.hero, styles.heroPlaceholder, isTablet && styles.heroTablet]}>
          <Text style={{ color: '#222', fontSize: 12 }}>Intet billede</Text>
        </View>
      )}

      {isOwner && editMode ? (
        <>
          <TextInput style={[styles.input, styles.titleInput]} value={editNavn} onChangeText={setEditNavn} placeholder="Foreningens navn" placeholderTextColor="#777" />
          <TextInput style={[styles.input]} value={editSted} onChangeText={setEditSted} placeholder="Sted" placeholderTextColor="#777" />
          <TextInput style={[styles.input, styles.descInput]} value={editBeskrivelse} onChangeText={setEditBeskrivelse} placeholder="Beskrivelse" placeholderTextColor="#777" multiline />
        </>
      ) : (
        <>
          <Text style={styles.title}>{forening.navn}</Text>
          {!!forening.sted && <Text style={styles.place}>{forening.sted}</Text>}
          {!!forening.beskrivelse && <Text style={styles.desc}>{forening.beskrivelse}</Text>}
        </>
      )}

      {isOwner && (
        <View style={styles.editRow}>
          {!editMode ? (
            <>
              <TouchableOpacity style={[styles.smallActionBtn, styles.editBtn]} onPress={() => setEditMode(true)}>
                <Text style={styles.smallActionText}>Rediger</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.smallActionBtn, styles.uploadBtn]} onPress={handleUpload} disabled={uploading}>
                <Text style={styles.smallActionText}>{uploading ? 'Uploader…' : 'Upload billede'}</Text>
              </TouchableOpacity>
            </>
          ) : (
            <>
              <TouchableOpacity style={[styles.smallActionBtn, styles.saveBtn]} onPress={handleSave} disabled={saving}>
                <Text style={styles.smallActionText}>{saving ? 'Gemmer…' : 'Gem'}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.smallActionBtn, styles.cancelBtn]}
                onPress={() => {
                  setEditMode(false);
                  setEditNavn(forening.navn || '');
                  setEditSted(forening.sted || '');
                  setEditBeskrivelse(forening.beskrivelse || '');
                }}
                disabled={saving}
              >
                <Text style={styles.smallActionText}>Annullér</Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginHorizontal: 14,
    marginTop: 6,
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 12,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
    borderWidth: 1,
    borderColor: '#eef1f4',
  },
  hero: { width: '100%', height: 180, borderRadius: 10, marginBottom: 8, resizeMode: 'cover', backgroundColor: '#f0f0f0' },
  heroTablet: { height: 420 },
  heroPlaceholder: { alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 22, fontWeight: '900', color: '#131921', marginTop: 4 },
  place: { fontSize: 14, fontWeight: '700', color: '#000', marginTop: 2 },
  desc: { fontSize: 13, color: '#000', marginTop: 6, lineHeight: 18 },
  input: { backgroundColor: '#fff', borderRadius: 8, borderWidth: 1, borderColor: '#e5e8ec', paddingHorizontal: 10, paddingVertical: 8, color: '#000', marginTop: 6 },
  titleInput: { fontSize: 20, fontWeight: '900', color: '#131921' },
  descInput: { minHeight: 76, textAlignVertical: 'top' },
  editRow: { flexDirection: 'row', gap: 10, marginTop: 10 },
  smallActionBtn: { paddingVertical: 8, paddingHorizontal: 12, borderRadius: 8 },
  smallActionText: { color: '#fff', fontWeight: '800' },
  editBtn: { backgroundColor: '#131921' },
  saveBtn: { backgroundColor: '#1f7a33' },
  cancelBtn: { backgroundColor: '#9aa0a6' },
  uploadBtn: { backgroundColor: '#3949ab' },
});