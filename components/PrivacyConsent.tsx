// components/PrivacyConsent.tsx
import React from "react";
import { Linking, Modal, StyleSheet, Text, TouchableOpacity, View } from "react-native";

export default function PrivacyConsent({
  visible,
  onAccept,
}: {
  visible: boolean;
  onAccept: () => void;
}) {
  const openPrivacyPage = () => {
    Linking.openURL("https://liguster-app.dk/privacy");
  };

  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <Text style={styles.title}>Privacy Policy</Text>
          <Text style={styles.text}>
            Vi beskytter dine data og bruger dem kun til at levere Liguster-tjenesten. 
            Vi deler aldrig dine oplysninger uden dit samtykke.{"\n\n"}
            Du kan læse den fulde politik{" "}
            <Text style={styles.link} onPress={openPrivacyPage}>
              her
            </Text>
            .
          </Text>

          <TouchableOpacity style={styles.button} onPress={onAccept}>
            <Text style={styles.buttonText}>Jeg accepterer</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.8)",
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
  },
  card: { backgroundColor: "#fff", borderRadius: 12, padding: 20, width: "100%", maxWidth: 400 },
  title: { fontSize: 18, fontWeight: "700", marginBottom: 10 },
  text: { fontSize: 14, color: "#333", marginBottom: 20, lineHeight: 20 },
  link: { color: "#0066cc", textDecorationLine: "underline" },
  button: {
    backgroundColor: "#171C22",
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: "center",
  },
  buttonText: { color: "#fff", fontWeight: "700" },
});