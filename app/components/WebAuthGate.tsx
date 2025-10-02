// app/components/WebAuthGate.tsx
import React from "react";
import { View } from "react-native";
import { Redirect } from "expo-router";
import { useSession } from "../../hooks/useSession"; // <-- VIGTIG: to '..'

type Props = { children: React.ReactNode };

export default function WebAuthGate({ children }: Props) {
  const { session, loading } = useSession();

  if (loading) return <View />;           // evt. spinner
  if (!session) return <Redirect href="/(public)" />;

  return <>{children}</>;
}