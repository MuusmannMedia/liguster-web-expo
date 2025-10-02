// components/Forening/MembersPreview.tsx
import React from 'react';
import { View, Text, FlatList, Image, TouchableOpacity, StyleSheet } from 'react-native';
import type { MedlemsRow } from '../../types/forening';
import { getDisplayName, isAdmin } from '../../lib/foreningApi';

type Props = {
  approved: MedlemsRow[];
  onPressMember: (m: MedlemsRow | null) => void;
};

export default function MembersPreview({ approved, onPressMember }: Props) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>Medlemmer</Text>
      <FlatList
        data={approved}
        keyExtractor={(item) => item.user_id}
        horizontal
        renderItem={({ item }) => (
          <TouchableOpacity onPress={() => onPressMember(item)} style={styles.memberBox}>
            {item.users?.avatar_url ? (
              <Image source={{ uri: item.users.avatar_url }} style={styles.memberAvatar} />
            ) : (
              <View style={[styles.memberAvatar, styles.memberAvatarPlaceholder]}>
                <Text style={{ color: '#131921', fontSize: 12 }}>?</Text>
              </View>
            )}
            <Text style={styles.memberName}>{getDisplayName(item.users)}</Text>
            {isAdmin(item) ? <Text style={styles.adminTag}>ADMIN</Text> : null}
          </TouchableOpacity>
        )}
        ListEmptyComponent={<Text style={{ color: '#000', margin: 8, fontSize: 12 }}>Ingen medlemmer endnu.</Text>}
        contentContainerStyle={{ paddingVertical: 6, paddingLeft: 12 }}
        showsHorizontalScrollIndicator={false}
      />
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
  memberBox: { alignItems: 'center', marginRight: 12, minWidth: 64 },
  memberAvatar: { width: 40, height: 40, borderRadius: 20, marginBottom: 4, backgroundColor: '#f0f0f0' },
  memberAvatarPlaceholder: { alignItems: 'center', justifyContent: 'center' },
  memberName: { color: '#000', fontSize: 11, fontWeight: '700', textAlign: 'center' },
  adminTag: { marginTop: 2, fontSize: 9, fontWeight: '800', color: '#131921' },
});