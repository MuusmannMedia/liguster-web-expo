// components/BottomNav.js
import { usePathname, useRouter } from 'expo-router';
import React, { useMemo } from 'react';
import { Platform, StyleSheet, Text, TouchableOpacity, View, useWindowDimensions } from 'react-native';

export default function BottomNav() {
  const router = useRouter();
  const path = usePathname();

  const { width, height } = useWindowDimensions();
  const isTablet = useMemo(() => {
    if (Platform.OS === 'ios' && Platform.isPad) return true;
    return Math.min(width, height) >= 768;
  }, [width, height]);

  const labelFontSize = isTablet ? 18 : 10;
  const activePaddingH = isTablet ? 18 : 12;
  const activePaddingHMig = isTablet ? 24 : 18;

  const prefix = '/protected';

  const isActive = (to) => {
    // Aktiv hvis vi er præcis på ruten eller på en undermappe (fx /protected/forening/123)
    return path === to || path.startsWith(to + '/');
  };

  const Btn = ({ to, label, isMig }) => (
    <TouchableOpacity style={styles.navButton} onPress={() => router.replace(to)}>
      <Text
        style={[
          styles.item,
          { fontSize: labelFontSize },
          isActive(to) && [
            isMig ? styles.activeMig : styles.active,
            { paddingHorizontal: isMig ? activePaddingHMig : activePaddingH },
          ],
        ]}
      >
        {label}
      </Text>
    </TouchableOpacity>
  );

  return (
    <View style={styles.nav}>
      <View style={styles.row}>
        <Btn to={`${prefix}/Opslag`} label="OPSLAG" />
        <Btn to={`${prefix}/ForeningerScreen`} label="FORENING" />
        <Btn to={`${prefix}/Beskeder`} label="BESKEDER" />
      </View>

      <View style={styles.row}>
        <Btn to={`${prefix}/MineOpslag`} label="MINE OPSLAG" />
        <Btn to={`${prefix}/MigScreen`} label="MIG" isMig />
        <View style={styles.navButton} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  nav: {
    backgroundColor: '#171C22',
    borderTopLeftRadius: 40,
    borderTopRightRadius: 40,
    position: 'absolute',
    bottom: 0, left: 0, right: 0,
    paddingTop: 18, paddingBottom: 24, paddingHorizontal: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.18,
    shadowRadius: 7,
    elevation: 10,
  },
  row: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  navButton: { flex: 1, alignItems: 'center' },
  item: { color: '#fff', fontWeight: '500', paddingVertical: 6, paddingHorizontal: 4 },
  active: { backgroundColor: '#fff', color: '#171C22', borderRadius: 18, fontWeight: 'bold' },
  activeMig: { backgroundColor: '#fff', color: '#171C22', borderRadius: 10, fontWeight: 'bold' },
});