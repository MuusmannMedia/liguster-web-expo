// components/SvarModal.tsx
import React, { useEffect, useState } from "react";
import {
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

type Props = {
  visible: boolean;
  onClose: () => void;
  onSend: (text: string) => void;
};

export default function SvarModal({ visible, onClose, onSend }: Props) {
  const [svar, setSvar] = useState("");
  const insets = useSafeAreaInsets();

  useEffect(() => {
    if (visible) setSvar("");
  }, [visible]);

  const handleSend = () => {
    const trimmed = svar.trim();
    if (trimmed) onSend(trimmed);
  };

  const behavior = Platform.OS === "ios" ? "padding" : "height";
  const keyboardOffset = Platform.OS === "ios" ? Math.max(0, insets.top) : 0;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        style={styles.overlay}
        behavior={behavior}
        keyboardVerticalOffset={keyboardOffset}
      >
        <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
          <View style={styles.tapCatcher}>
            <View style={styles.box}>
              <Text style={styles.title}>Skriv dit svar</Text>

              <TextInput
                style={styles.input}
                placeholder="Skriv dit svar her..."
                value={svar}
                onChangeText={setSvar}
                multiline
                autoFocus
                // vigtig ændring:
                returnKeyType="default" // viser normal retur, ikke "send"
                blurOnSubmit={false}    // lader dig lave linjeskift
              />

              <View style={styles.btnRow}>
                <TouchableOpacity onPress={onClose}>
                  <Text style={styles.btnText}>Annuller</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={handleSend}>
                  <Text style={[styles.btnText, styles.sendText]}>Send</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </TouchableWithoutFeedback>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.78)",
    justifyContent: "center",
    alignItems: "center",
  },
  tapCatcher: {
    flex: 1,
    width: "100%",
    justifyContent: "center",
    alignItems: "center",
  },
  box: {
    width: "92%",
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 22,
  },
  title: {
    fontWeight: "bold",
    fontSize: 18,
    marginBottom: 16,
    color: "#111",
  },
  input: {
    backgroundColor: "#f0f0f0",
    minHeight: 60,
    maxHeight: 180,
    borderRadius: 8,
    padding: 10,
    fontSize: 15,
    marginBottom: 18,
    textAlignVertical: "top",
  },
  btnRow: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  btnText: {
    fontWeight: "bold",
    fontSize: 16,
    color: "#111",
  },
  sendText: {
    color: "#254890",
  },
});