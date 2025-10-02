// components/ImagePickerField.tsx
import React from 'react';
import { View, Image, Text, TouchableOpacity, StyleSheet } from 'react-native';

export default function ImagePickerField({ billede, onPick, onRemove }) {
  return (
    <View style={styles.thumbnailRow}>
      {billede && billede.uri ? (
        <View style={styles.thumbnailBox}>
          <Image source={{ uri: billede.uri }} style={styles.thumbnail} />
          <TouchableOpacity style={styles.removeBtn} onPress={onRemove}>
            <Text style={styles.removeBtnText}>×</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <TouchableOpacity style={styles.addImageBtn} onPress={onPick}>
          <Text style={styles.addImageBtnText}>＋</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  thumbnailRow: { flexDirection: 'row', marginBottom: 10, minHeight: 62 },
  thumbnailBox: { marginRight: 10, position: 'relative' },
  thumbnail: { width: 62, height: 62, borderRadius: 7, backgroundColor: '#eee' },
  removeBtn: { position: 'absolute', top: -7, right: -7, backgroundColor: '#e85c5c', borderRadius: 13, width: 24, height: 24, alignItems: 'center', justifyContent: 'center', zIndex: 2 },
  removeBtnText: { color: '#fff', fontWeight: 'bold' },
  addImageBtn: { width: 62, height: 62, borderRadius: 7, backgroundColor: '#f3f3f3', borderWidth: 1, borderColor: '#ddd', alignItems: 'center', justifyContent: 'center' },
  addImageBtnText: { fontSize: 28, color: '#444' },
});