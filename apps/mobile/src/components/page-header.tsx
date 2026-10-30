import { JellyLabel } from "./jelly-icon";
import { router } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { ChevronLeftIcon } from "@/components/ui-icons";
import { colors, spacing, typography } from "@/theme/tokens";

export function PageHeader({ title, actionLabel, onAction }: { title: string; actionLabel?: string; onAction?: () => void }) {
  return (
    <View style={styles.row}>
      <Pressable accessibilityRole="button" accessibilityLabel="返回" onPress={() => router.back()} style={styles.back}><ChevronLeftIcon size={23} /></Pressable>
      <Text accessibilityRole="header" style={styles.title}>{title}</Text>
      {actionLabel && onAction ? <Pressable accessibilityRole="button" accessibilityLabel={actionLabel} onPress={onAction} style={styles.action}><Text style={styles.actionText}><JellyLabel text={actionLabel} /></Text></Pressable> : <View style={styles.action} />}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { minHeight: 54, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.sm },
  back: { width: 48, minHeight: 48, alignItems: "center", justifyContent: "center" },
  title: { ...typography.sectionTitle, color: colors.text, flex: 1, textAlign: "center" },
  action: { width: 48, minHeight: 48, alignItems: "flex-end", justifyContent: "center" },
  actionText: { ...typography.caption, color: colors.brand, fontWeight: "800" }
});
