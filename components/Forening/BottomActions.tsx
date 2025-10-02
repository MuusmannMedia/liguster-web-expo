// components/Forening/BottomActions.tsx
import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';

type Props = {
  isApproved: boolean;
  isOwner: boolean;
  onLeave: () => void;
  onDelete: () => void;
};

export default function BottomActions({ isApproved, isOwner, onLeave, onDelete }: Props) {
  return (
    <View style={styles.wrap}>
      {isApproved && (
        <TouchableOpacity style={[styles.actionBtn, styles.leaveAction]} onPress={onLeave}>
          <Text style={styles.actionBtnText}>Afslut medlemskab</Text>
        </TouchableOpacity>
      )}

      {isOwner && (
        <TouchableOpacity style={[styles.actionBtn, styles.deleteAction]} onPress={onDelete}>
          <Text style={styles.deleteActionText}>Slet forening</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginTop: 12,
    marginHorizontal: 14,
    marginBottom: 12,
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 12,
    gap: 10,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
    borderWidth: 1,
    borderColor: '#eef1f4',
  },
  actionBtn: { borderRadius: 10, paddingVertical: 12, alignItems: 'center' },
  leaveAction: { backgroundColor: '#9aa0a6' },
  deleteAction: { backgroundColor: '#C62828' },
  actionBtnText: { color: '#fff', fontSize: 14, fontWeight: '800' },
  deleteActionText: { color: '#fff', fontSize: 14, fontWeight: '800' },
});