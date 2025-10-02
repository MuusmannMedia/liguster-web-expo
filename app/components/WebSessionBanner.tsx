// app/components/WebSessionBanner.tsx
import React from "react";
import { Platform, Text, View } from "react-native";

type Props = {
  message?: string;
};

/**
 * Viser en lille info-bar øverst på siden.
 * Rendér kun på web (returnerer null på iOS/Android).
 */
export default function WebSessionBanner({ message }: Props) {
  if (Platform.OS !== "web") return null;

  return (
    <View
      style={{
        width: "100%",
        paddingVertical: 8,
        paddingHorizontal: 16,
        backgroundColor: "#111827",
        borderBottomWidth: 1,
        borderBottomColor: "#374151",
      }}
    >
      <Text
        style={{
          color: "#e5e7eb",
          fontSize: 13,
          textAlign: "center",
        }}
      >
        {message ?? "Du kører web-preview. Funktioner kan være begrænsede."}
      </Text>
    </View>
  );
}