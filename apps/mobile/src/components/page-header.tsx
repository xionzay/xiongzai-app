import { router } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { ChevronLeftIcon } from "@/components/ui-icons";
import { nativeShadow } from "@/components/native-page";
import { colors, spacing, typography } from "@/theme/tokens";

export function PageHeader({ title, actionLabel, onAction }: { title: string; actionLabel?: string; onAction?: () => void }) {
  return (
    <View style={styles.row}>
      <Pressable accessibilityRole="button" accessibilityLabel="返回" onPress={() => router.back()} style={styles.back}><ChevronLeftIcon size={23} /></Pressable>
      <Text style={styles.title} numberOfLines={1}>{title}</Text>
      {actionLabel && onAction ? <Pressable accessibilityRole="button" onPress={onAction} style={styles.action}><Text style={styles.actionText}>{actionLabel}</Text></Pressable> : <View style={styles.action} />}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { minHeight: 54, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.sm },
  back: { width: 44, height: 44, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: "rgba(62,57,47,0.10)", borderRadius: 14, backgroundColor: "#FFFDF8", ...nativeShadow },
  title: { ...typography.sectionTitle, color: colors.text, flex: 1, textAlign: "center" },
  action: { width: 64, minHeight: 44, alignItems: "flex-end", justifyContent: "center" },
  actionText: { ...typography.caption, color: colors.brand, fontWeight: "800" }
});
