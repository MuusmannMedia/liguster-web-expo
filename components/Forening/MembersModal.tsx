// components/Forening/MembersModal.tsx
import React from 'react';
import { Modal, View, Text, Image, TouchableOpacity, ScrollView, StyleSheet } from 'react-native';
import type { MedlemsRow } from '../../types/forening';
import { getDisplayName, isAdmin } from '../../lib/foreningApi';

type Props = {
  visible: boolean;
  onClose: () => void;
  isOwner: boolean;
  admins: MedlemsRow[];
  regulars: MedlemsRow[];
  pending: MedlemsRow[];
  busyId: string | null;
  onApprove: (userId: string) => void;
  onReject: (userId: string) => void;
};

export default function MembersModal({ visible, onClose, isOwner, admins, regulars, pending, busyId, onApprove, onReject }: Props) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.modalBackdrop}>
        <View style={styles.modalCard}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Medlemmer</Text>
            <View style={{ width: 28, height: 28 }} />
          </View>

          <View style={{ maxHeight: 520 }}>
            <ScrollView>
              {isOwner && (
                <>
                  <Text style={[styles.listHeader, { marginTop: 4 }]}>Afventer godkendelse</Text>
                  {pending.length === 0 ? (
                    <Text style={styles.emptyLine}>Ingen anmodninger.</Text>
                  ) : (
                    pending.map((m) => {
                      const busy = busyId === m.user_id;
                      return (
                        <View key={`pending-${m.user_id}`} style={styles.row}>
                          {m.users?.avatar_url ? (
                            <Image source={{ uri: m.users.avatar_url }} style={styles.rowAvatar} />
                          ) : (
                            <View style={[styles.rowAvatar, styles.rowAvatarPh]}><Text>?</Text></View>
                          )}
                          <View style={{ flex: 1 }}>
                            <Text style={styles.rowName}>{getDisplayName(m.users)}</Text>
                            <Text style={styles.rowEmail}>{m.users?.email || 'Ingen email'}</Text>
                          </View>
                          <View style={{ flexDirection: 'row', gap: 6 }}>
                            <TouchableOpacity onPress={() => onApprove(m.user_id)} disabled={busy} style={[styles.smallBtn, styles.approveBtn, busy && styles.btnDisabled]}>
                              <Text style={styles.smallBtnText}>{busy ? '...' : 'Godkend'}</Text>
                            </TouchableOpacity>
                            <TouchableOpacity onPress={() => onReject(m.user_id)} disabled={busy} style={[styles.smallBtn, styles.rejectBtn, busy && styles.btnDisabled]}>
                              <Text style={styles.smallBtnText}>{busy ? '...' : 'Afvis'}</Text>
                            </TouchableOpacity>
                          </View>
                        </View>
                      );
                    })
                  )}
                </>
              )}

              <Text style={[styles.listHeader, { marginTop: isOwner ? 12 : 4 }]}>Administratorer</Text>
              {admins.length === 0 ? (
                <Text style={styles.emptyLine}>Ingen administratorer.</Text>
              ) : (
                admins.map((m) => (
                  <View key={`admin-${m.user_id}`} style={styles.row}>
                    {m.users?.avatar_url ? <Image source={{ uri: m.users.avatar_url }} style={styles.rowAvatar} /> : <View style={[styles.rowAvatar, styles.rowAvatarPh]}><Text>?</Text></View>}
                    <View style={{ flex: 1 }}>
                      <Text style={styles.rowName}>{getDisplayName(m.users)}</Text>
                      <Text style={styles.rowEmail}>{m.users?.email || 'Ingen email'}</Text>
                    </View>
                    <Text style={styles.rowTag}>ADMIN</Text>
                  </View>
                ))
              )}

              <Text style={[styles.listHeader, { marginTop: 10 }]}>Medlemmer</Text>
              {regulars.length === 0 ? (
                <Text style={styles.emptyLine}>Ingen medlemmer.</Text>
              ) : (
                regulars.map((m) => (
                  <View key={`mem-${m.user_id}`} style={styles.row}>
                    {m.users?.avatar_url ? <Image source={{ uri: m.users.avatar_url }} style={styles.rowAvatar} /> : <View style={[styles.rowAvatar, styles.rowAvatarPh]}><Text>?</Text></View>}
                    <View style={{ flex: 1 }}>
                      <Text style={styles.rowName}>{getDisplayName(m.users)}</Text>
                      <Text style={styles.rowEmail}>{m.users?.email || 'Ingen email'}</Text>
                    </View>
                    <Text style={styles.rowTag}>MEDLEM</Text>
                  </View>
                ))
              )}
            </ScrollView>

            <TouchableOpacity onPress={onClose} style={styles.modalCloseBottom}><Text style={styles.modalCloseText}>✕</Text></TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', alignItems: 'center', justifyContent: 'center', padding: 18 },
  modalCard: { width: '100%', maxWidth: 520, backgroundColor: '#FFFFFF', borderRadius: 14, padding: 12, borderWidth: 1, borderColor: '#eef1f4' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  modalTitle: { fontSize: 16, fontWeight: '900', color: '#131921' },

  listHeader: { fontSize: 12, fontWeight: '800', color: '#131921', marginVertical: 6 },
  emptyLine: { fontSize: 12, color: '#000', paddingVertical: 6, opacity: 0.7 },

  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#e8eef2' },
  rowAvatar: { width: 34, height: 34, borderRadius: 17, marginRight: 10, backgroundColor: '#f0f0f0' },
  rowAvatarPh: { alignItems: 'center', justifyContent: 'center' },
  rowName: { fontSize: 13, fontWeight: '700', color: '#000' },
  rowEmail: { fontSize: 11, color: '#000', opacity: 0.7 },
  rowTag: { fontSize: 10, fontWeight: '800', color: '#131921' },

  modalCloseBottom: { alignSelf: 'flex-end', marginTop: 10, backgroundColor: '#131921', borderRadius: 16, paddingHorizontal: 12, paddingVertical: 6 },
  modalCloseText: { color: '#fff', fontWeight: '900', fontSize: 14 },

  smallBtn: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, borderWidth: 1 },
  approveBtn: { borderColor: '#1f7a33', backgroundColor: '#e6f3ea' },
  rejectBtn: { borderColor: '#a33', backgroundColor: '#f7e6e6' },
  btnDisabled: { opacity: 0.6 },
  smallBtnText: { fontSize: 11, fontWeight: '800', color: '#223' },
});