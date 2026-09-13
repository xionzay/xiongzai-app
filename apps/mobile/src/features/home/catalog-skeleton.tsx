import { StyleSheet, View } from "react-native";
import { colors, radii, spacing } from "@/theme/tokens";

export function CatalogSkeleton() {
  return (
    <View style={styles.wrap} accessibilityLabel="首页内容加载中">
      <View style={[styles.block, styles.hero]} />
      <View style={styles.row}>
        <View style={[styles.block, styles.companion]} />
        <View style={[styles.block, styles.companion]} />
      </View>
      <View style={[styles.block, styles.service]} />
      <View style={[styles.block, styles.service]} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.md },
  block: { backgroundColor: colors.border, opacity: 0.6, borderRadius: radii.lg },
  hero: { height: 168 },
  row: { flexDirection: "row", gap: spacing.md },
  companion: { width: 170, height: 235 },
  service: { height: 134 }
});
