// components/Forening/ThreadModal.tsx
import React, { useEffect, useState } from 'react';
import { Modal, View, Text, TouchableOpacity, TextInput, FlatList, Image, StyleSheet } from 'react-native';
import type { BrugerLite } from '../../types/forening';
import { fetchMessagesPlusUsers, sendMessage, getDisplayName } from '../../lib/foreningApi';

type Props = {
  visible: boolean;
  onClose: () => void;
  threadId: string;
  threadTitle: string;
  currentUserId: string | null;
};

export default function ThreadModal({ visible, onClose, threadId, threadTitle, currentUserId }: Props) {
  const [msgs, setMsgs] = useState<Array<{ id: string; text: string; created_at: string; user?: BrugerLite }>>([]);
  const [loading, setLoading] = useState(false);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const data = await fetchMessagesPlusUsers(threadId);
      setMsgs(data);
    } catch (e) {
      console.error('Kunne ikke hente beskeder:', (e as any).message);
      setMsgs([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (visible) load();
  }, [visible, threadId]);

  const onSend = async () => {
    if (!currentUserId || !text.trim()) return;
    setSending(true);
    try {
      await sendMessage(threadId, currentUserId, text.trim());
      setText('');
      await load();
    } finally {
      setSending(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <View style={styles.header}>
            <Text style={styles.title}>{threadTitle}</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}><Text style={styles.closeTxt}>✕</Text></TouchableOpacity>
          </View>

          {loading ? (
            <Text style={{ padding: 16 }}>Indlæser…</Text>
          ) : msgs.length === 0 ? (
            <Text style={{ padding: 16, color: '#444' }}>Ingen beskeder i denne tråd endnu.</Text>
          ) : (
            <FlatList
              data={msgs}
              keyExtractor={(m) => m.id}
              renderItem={({ item }) => (
                <View style={styles.msgRow}>
                  {item.user?.avatar_url ? (
                    <Image source={{ uri: item.user.avatar_url }} style={styles.msgAvatar} />
                  ) : (
                    <View style={[styles.msgAvatar, styles.msgAvatarPh]}><Text>?</Text></View>
                  )}
                  <View style={{ flex: 1 }}>
                    <Text style={styles.msgName}>{getDisplayName(item.user)}</Text>
                    <Text style={styles.msgText}>{item.text}</Text>
                  </View>
                </View>
              )}
              contentContainerStyle={{ paddingHorizontal: 12, paddingBottom: 12 }}
            />
          )}

          <View style={styles.inputRow}>
            <TextInput
              style={styles.input}
              placeholder="Skriv en besked…"
              value={text}
              onChangeText={setText}
              placeholderTextColor="#93A1AD"
            />
            <TouchableOpacity style={styles.sendBtn} onPress={onSend} disabled={sending || !text.trim()}>
              <Text style={styles.sendTxt}>{sending ? '...' : 'Send'}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', alignItems: 'center', justifyContent: 'center', padding: 18 },
  sheet: { width: '100%', maxWidth: 620, backgroundColor: '#fff', borderRadius: 16, overflow: 'hidden' },
  header: { padding: 16, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#e6ecf2', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { fontSize: 22, fontWeight: '900', color: '#131921' },
  closeBtn: { backgroundColor: '#131921', borderRadius: 16, paddingHorizontal: 10, paddingVertical: 6 },
  closeTxt: { color: '#fff', fontWeight: '800' },
  msgRow: { flexDirection: 'row', gap: 10, alignItems: 'flex-start', paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#f0f3f6' },
  msgAvatar: { width: 32, height: 32, borderRadius: 16, backgroundColor: '#f0f0f0' },
  msgAvatarPh: { alignItems: 'center', justifyContent: 'center' },
  msgName: { fontSize: 12, fontWeight: '800', color: '#223' },
  msgText: { fontSize: 13, color: '#111', marginTop: 2 },
  inputRow: { flexDirection: 'row', gap: 8, padding: 12, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#e6ecf2' },
  input: { flex: 1, backgroundColor: '#F4F6F8', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, color: '#000' },
  sendBtn: { backgroundColor: '#131921', borderRadius: 10, paddingHorizontal: 16, alignItems: 'center', justifyContent: 'center' },
  sendTxt: { color: '#fff', fontWeight: '900' },
});