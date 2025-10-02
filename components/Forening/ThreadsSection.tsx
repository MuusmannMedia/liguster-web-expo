// components/Forening/ThreadsSection.tsx
import React, { useEffect, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, FlatList } from 'react-native';
import type { ThreadRow } from '../../types/forening';
import { createThread, fetchThreads } from '../../lib/foreningApi';
import ThreadModal from './ThreadModal';

type Props = {
  foreningId: string;
  currentUserId: string | null;
};

export default function ThreadsSection({ foreningId, currentUserId }: Props) {
  const [threads, setThreads] = useState<ThreadRow[]>([]);
  const [title, setTitle] = useState('');
  const [opening, setOpening] = useState<{ id: string; title: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      setThreads(await fetchThreads(foreningId));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [foreningId]);

  const onCreate = async () => {
    if (!currentUserId || !title.trim()) return;
    setCreating(true);
    try {
      const t = await createThread(foreningId, title.trim(), currentUserId);
      setTitle('');
      setThreads((prev) => [t, ...prev]);
    } finally {
      setCreating(false);
    }
  };

  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>Samtaler</Text>

      {/* Opret ny tråd */}
      <View style={styles.createRow}>
        <TextInput
          style={styles.input}
          placeholder="Ny tråd – skriv en overskrift…"
          placeholderTextColor="#93A1AD"
          value={title}
          onChangeText={setTitle}
        />
        <TouchableOpacity style={styles.createBtn} onPress={onCreate} disabled={!title.trim() || creating}>
          <Text style={styles.createTxt}>{creating ? '...' : 'Opret'}</Text>
        </TouchableOpacity>
      </View>

      {/* Liste af tråde */}
      {loading ? (
        <Text style={{ color: '#333', marginTop: 8 }}>Indlæser…</Text>
      ) : threads.length === 0 ? (
        <Text style={styles.muted}>Ingen tråde endnu.</Text>
      ) : (
        <FlatList
          data={threads}
          keyExtractor={(t) => t.id}
          renderItem={({ item }) => (
            <TouchableOpacity style={styles.threadRow} onPress={() => setOpening({ id: item.id, title: item.title })}>
              <Text style={styles.threadTitle}>{item.title}</Text>
              <Text style={styles.threadMeta}>Oprettet {new Date(item.created_at).toLocaleDateString()}</Text>
            </TouchableOpacity>
          )}
          ItemSeparatorComponent={() => <View style={styles.sep} />}
          scrollEnabled={false}
        />
      )}

      {/* Modal for udvalgt tråd */}
      {opening && (
        <ThreadModal
          visible={!!opening}
          onClose={() => setOpening(null)}
          threadId={opening.id}
          threadTitle={opening.title}
          currentUserId={currentUserId}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    marginTop: 12,
    marginHorizontal: 14,
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: '#eef1f4',
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  sectionTitle: { fontSize: 16, fontWeight: '900', color: '#131921' },
  createRow: { flexDirection: 'row', gap: 8, marginTop: 8, marginBottom: 4 },
  input: { flex: 1, backgroundColor: '#F4F6F8', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, color: '#000' },
  createBtn: { backgroundColor: '#131921', borderRadius: 10, paddingHorizontal: 16, alignItems: 'center', justifyContent: 'center' },
  createTxt: { color: '#fff', fontWeight: '900' },
  muted: { marginTop: 4, color: '#000', fontSize: 12, opacity: 0.7 },
  threadRow: { paddingVertical: 10 },
  threadTitle: { color: '#131921', fontWeight: '900', fontSize: 15 },
  threadMeta: { color: '#000', opacity: 0.7, fontSize: 11, marginTop: 2 },
  sep: { height: StyleSheet.hairlineWidth, backgroundColor: '#ecf1f5' },
});