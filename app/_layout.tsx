// app/_layout.tsx  (WEB VERSION)

import React from "react";
import { Stack } from "expo-router";
import { View, StyleSheet } from "react-native";

export default function RootLayoutWebOnly() {
  return (
    <View style={styles.root}>
      <Stack
        screenOptions={{
          headerShown: false,
          animation: "fade",
        }}
      >
        {/* Forside (landing page) */}
        <Stack.Screen name="index" />

        {/* Login flow */}
        <Stack.Screen name="LoginScreen" />

        {/* Diverse sider der ikke kræver auth bare for at virke */}
        <Stack.Screen name="OpretBruger" />
        <Stack.Screen name="privacy" />
        <Stack.Screen name="disclaimer" />
        <Stack.Screen name="+not-found" />
      </Stack>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#0f1622", // matcher landing baggrund
  },
});