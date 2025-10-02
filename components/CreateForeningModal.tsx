// components/CreateForeningModal.tsx
import React, { useState } from "react";
import { KeyboardAvoidingView, Platform, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { supabase } from "../utils/supabase";

export default function CreateForeningModal({ visible, onClose, userId, onCreated }: {
  visible: boolean;
  onClose: () => void;
  userId?: string;
  onCreated?: () => void;
}) {
  const [navn, setNavn] = useState("");
  const [sted, setSted] = useState("");
  const [beskrivelse, setBeskrivelse] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleOpret() {
    if (!navn || !sted || !beskrivelse || !userId) return;
    setLoading(true);

    // Opret forening (uden billede_url)
    const { data, error } = await supabase
      .from("foreninger")
      .insert([{ navn, sted, beskrivelse, oprettet_af: userId }])
      .select()
      .single();

    // Tilføj bruger som medlem
    if (data && data.id) {
      await supabase.from("foreningsmedlemmer").insert([{ forening_id: data.id, user_id: userId }]);
    }

    setLoading(false);
    if (!error) {
      setNavn("");
      setSted("");
      setBeskrivelse("");
      onCreated?.();
      onClose();
    } else {
      alert("Noget gik galt: " + error.message);
    }
  }

  if (!visible) return null;

  return (
    <KeyboardAvoidingView
      style={styles.modalBackdrop}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      keyboardVerticalOffset={80}
    >
      <View style={styles.modalContent}>
        <Text style={styles.modalTitle}>Opret ny forening</Text>
        <Text style={styles.fieldLabel}>Navn</Text>
        <TextInput
          style={styles.modalInput}
          placeholder="Navn på foreningen"
          value={navn}
          onChangeText={setNavn}
        />
        <Text style={styles.fieldLabel}>Sted</Text>
        <TextInput
          style={styles.modalInput}
          placeholder="F.eks. København"
          value={sted}
          onChangeText={setSted}
        />
        <Text style={styles.fieldLabel}>Beskrivelse</Text>
        <TextInput
          style={styles.modalInput}
          placeholder="Kort beskrivelse"
          value={beskrivelse}
          onChangeText={setBeskrivelse}
          multiline
        />
        <View style={{ flexDirection: "row", gap: 12, marginTop: 15 }}>
          <TouchableOpacity
            onPress={onClose}
            style={[styles.modalBtn, { backgroundColor: "#aaa" }]}
          >
            <Text style={{ color: "#fff" }}>Annullér</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={handleOpret}
            style={styles.modalBtn}
            disabled={loading}
          >
            <Text style={{ color: "#fff" }}>
              {loading ? "Opretter..." : "Opret"}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  modalBackdrop: {
    position: "absolute",
    top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: "rgba(40,50,60,0.43)",
    alignItems: "center", justifyContent: "center", zIndex: 100,
  },
  modalContent: {
    width: 320, backgroundColor: "#fff", borderRadius: 12, padding: 20,
    shadowColor: "#000", shadowOpacity: 0.18, shadowRadius: 10, elevation: 7,
  },
  modalTitle: { fontWeight: "bold", fontSize: 28, color: "#254890", marginBottom: 16, textAlign: "center" },
  fieldLabel: { fontSize: 18, fontWeight: "bold", color: "#254890", marginBottom: 2, marginTop: 10 },
  modalInput: {
    backgroundColor: "#f3f3f7", borderRadius: 7, padding: 9,
    fontSize: 17, color: "#222", borderWidth: 1, borderColor: "#dde1e8", marginBottom: 8,
  },
  modalBtn: {
    flex: 1, backgroundColor: "#254890", borderRadius: 7, padding: 13, alignItems: "center",
  },
});
