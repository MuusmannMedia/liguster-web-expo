import { Head } from "expo-router";
import React, { PropsWithChildren } from "react";
import { Platform, StyleSheet, View } from "react-native";

type Props = PropsWithChildren<{
  title?: string;
  description?: string;
}>;

export default function WebPage({ title, description, children }: Props) {
  return (
    <View style={styles.page}>
      {/* SEO / meta (head virker også i native, men ignoreres) */}
      {title && (
        <Head>
          <title>{title}</title>
          {description ? <meta name="description" content={description} /> : null}
          <meta name="viewport" content="width=device-width, initial-scale=1" />
        </Head>
      )}

      <View style={styles.container}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  page: {
    flex: 1,
    backgroundColor: "#0f1623",
    ...(Platform.OS === "web" ? { minHeight: "calc(100vh - 64px)" } : null),
  },
  container: {
    flex: 1,
    width: "100%",
    maxWidth: 1120,
    alignSelf: "center",
    paddingHorizontal: 24,
    paddingVertical: 24,
    gap: 16,
  },
});