// app/(protected)/_layout.tsx
import React from "react";
import { Slot, Redirect } from "expo-router";
import { View, ActivityIndicator } from "react-native";
import { useSession } from "../../hooks/useSession";

function Splash() {
  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#0f1622" }}>
      <ActivityIndicator />
    </View>
  );
}

export default function ProtectedLayout() {
  const { isAuthed, loading } = useSession();

  if (loading) return <Splash />;
  if (!isAuthed) return <Redirect href="/LoginScreen" />;

  return <Slot />;
}