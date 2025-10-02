import { Feather } from "@expo/vector-icons"; // expo install @expo/vector-icons
import { Stack } from "expo-router";
import React, { useState } from "react";
import { FlatList, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import BottomNav from "../components/BottomNav"; // Justér stien hvis nødvendigt!

const dummyEvents = [
  { id: "1", date: "2025-07-12", title: "Storskrald afhentes", type: "Affald", note: "Husk at stille storskrald ud før kl. 7" },
  { id: "2", date: "2025-07-14", title: "Børneloppemarked på Bytorvet", type: "Event", note: "Kl. 10-15. Gratis stand for børn." },
  { id: "3", date: "2025-07-16", title: "Advarsel: Vejarbejde på Møllegade", type: "Advarsel", note: "Der kan være larm og omkørsel hele dagen." },
  { id: "4", date: "2025-07-18", title: "Papir/Plast afhentes", type: "Affald", note: "Tøm papir/plast-beholder før kl. 7." },
  { id: "5", date: "2025-07-19", title: "Foreningsmøde i beboerhuset", type: "Forening", note: "Alle medlemmer er velkomne." },
  { id: "6", date: "2025-07-21", title: "Grillaften i parken", type: "Arrangement", note: "Alle er velkomne - tag madkurv med." },
  { id: "7", date: "2025-07-22", title: "Service: Vinduespudsning", type: "Service", note: "Fælles rabat. Tilmeld dig hos viceværten." },
];

const FILTERS = [
  { key: "Alle", label: "Alle" },
  { key: "Affald", label: "Affald" },
  { key: "Event", label: "Event" },
  { key: "Advarsel", label: "Advarsel" },
  { key: "Forening", label: "Forening" },
  { key: "Arrangement", label: "Arrangement" },
  { key: "Service", label: "Service" },
];

export default function KalenderScreen() {
  const [search, setSearch] = useState("");
  const [showFilter, setShowFilter] = useState(false);
  const [selectedFilter, setSelectedFilter] = useState("Alle");

  const filteredEvents = dummyEvents.filter(event => {
    const matchesFilter = selectedFilter === "Alle" || event.type === selectedFilter;
    const matchesSearch =
      event.title.toLowerCase().includes(search.toLowerCase()) ||
      event.note.toLowerCase().includes(search.toLowerCase()) ||
      event.date.includes(search);
    return matchesFilter && matchesSearch;
  });

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={styles.root}>
        <Text style={styles.header}>KALENDER</Text>
        {/* Søg + Filtrer */}
        <View style={styles.searchRow}>
          <TextInput
            style={styles.searchInput}
            value={search}
            onChangeText={setSearch}
            placeholder="Søg i kalenderen…"
            placeholderTextColor="#a1a9b6"
          />
          <TouchableOpacity
            style={styles.filterBtn}
            onPress={() => setShowFilter(v => !v)}
            activeOpacity={0.7}
          >
            <Feather name="filter" size={21} color="#fff" />
            <Text style={styles.filterText}>
              {selectedFilter === "Alle" ? "Filtrer" : selectedFilter}
            </Text>
          </TouchableOpacity>
        </View>
        
        {/* Filter-dropdown (lægger sig oven på listen når showFilter = true) */}
        {showFilter && (
          <View style={styles.filterDropdown}>
            {FILTERS.map(f => (
              <TouchableOpacity
                key={f.key}
                style={styles.filterDropdownItem}
                onPress={() => {
                  setSelectedFilter(f.key);
                  setShowFilter(false);
                }}
              >
                <Text style={{
                  fontWeight: f.key === selectedFilter ? "bold" : "normal",
                  color: f.key === selectedFilter ? "#254890" : "#333",
                  fontSize: 15,
                }}>
                  {f.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* Listen */}
        <FlatList
          data={filteredEvents}
          keyExtractor={item => item.id}
          contentContainerStyle={{ paddingBottom: 100 }}
          renderItem={({ item }) => (
            <View style={[styles.eventBox, styles["type" + item.type]]}>
              <Text style={styles.date}>{item.date}</Text>
              <Text style={styles.title}>{item.title}</Text>
              <Text style={styles.note}>{item.note}</Text>
            </View>
          )}
          ListEmptyComponent={
            <Text style={{ color: "#fff", textAlign: "center", marginTop: 30 }}>
              Ingen events matcher din søgning.
            </Text>
          }
        />
        <BottomNav />
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#7C8996",
    paddingTop: 62,
    alignItems: "center",
    paddingHorizontal: 16,
  },
  header: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#fff",
    letterSpacing: 2,
    marginBottom: 25,
    textTransform: "uppercase",
  },
  searchRow: {
    flexDirection: "row",
    width: "100%",
    alignItems: "center",
    marginBottom: 10,
  },
  searchInput: {
    flex: 1,
    height: 40,
    backgroundColor: "#fff",
    borderRadius: 9,
    paddingHorizontal: 14,
    fontSize: 15,
    color: "#222",
    marginRight: 8,
    borderWidth: 1,
    borderColor: "#dde1e8",
  },
  filterBtn: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#131921",   // MØRKEBLÅ
    borderRadius: 9,
    paddingHorizontal: 13,
    paddingVertical: 8,
    // borderWidth: 0,           // INGEN ramme!
    // borderColor: "transparent",
  },
  filterText: {
    color: "#fff",                // Hvid tekst
    fontWeight: "bold",           // Bold (fed)
    marginLeft: 8,
    fontSize: 14,
  },
  filterDropdown: {
    backgroundColor: "#fff",
    borderRadius: 10,
    padding: 10,
    width: "65%",
    position: "absolute",
    top: 97, // Justeret lidt så den er under searchRow
    left: "18%",
    zIndex: 20,
    shadowColor: "#000",
    shadowOpacity: 0.10,
    shadowRadius: 9,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8,
  },
  filterDropdownItem: {
    paddingVertical: 7,
    paddingHorizontal: 5,
    borderBottomWidth: 1,
    borderBottomColor: "#ececec",
  },
  eventBox: {
    width: "100%",
    backgroundColor: "#fff",
    borderRadius: 10,
    padding: 16,
    marginBottom: 14,
    shadowColor: "#000",
    shadowOpacity: 0.08,
    shadowRadius: 7,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  date: {
    fontWeight: "bold",
    color: "#254890",
    fontSize: 15,
    marginBottom: 2,
  },
  title: {
    fontSize: 16,
    fontWeight: "600",
    marginBottom: 4,
    color: "#333",
  },
  note: {
    fontSize: 14,
    color: "#555",
  },
  // Farveindikation (optional)
  typeAffald: { borderLeftWidth: 6, borderLeftColor: "#3CB371" },
  typeEvent: { borderLeftWidth: 6, borderLeftColor: "#0074D9" },
  typeAdvarsel: { borderLeftWidth: 6, borderLeftColor: "#FF851B" },
  typeForening: { borderLeftWidth: 6, borderLeftColor: "#9C27B0" },
  typeArrangement: { borderLeftWidth: 6, borderLeftColor: "#9B59B6" },
  typeService: { borderLeftWidth: 6, borderLeftColor: "#009688" },
});
