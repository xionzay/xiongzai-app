import { StyleSheet, Text, View } from "react-native";
import { colors, radii, spacing, typography } from "@/theme/tokens";

export function NoticeBanner({ message, tone = "info" }: { message: string; tone?: "info" | "danger" | "success" }) {
  return (
    <View style={[styles.wrap, styles[tone]]} accessibilityRole="alert">
      <Text style={[styles.text, tone === "danger" && styles.dangerText]}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { borderRadius: radii.md, padding: spacing.md },
  info: { backgroundColor: colors.surfaceBlue },
  danger: { backgroundColor: "#FFF0F0" },
  success: { backgroundColor: "#ECFAF3" },
  text: { ...typography.caption, color: colors.brandDeep },
  dangerText: { color: colors.danger }
});
