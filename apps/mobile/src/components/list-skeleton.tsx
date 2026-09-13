import { StyleSheet, View } from "react-native";
import { colors, radii, spacing } from "@/theme/tokens";

export function ListSkeleton({ rows = 3 }: { rows?: number }) {
  return <View style={styles.list} accessibilityLabel="列表内容加载中">{Array.from({ length: rows }, (_, index) => <View key={index} style={styles.card}><View style={styles.image} /><View style={styles.copy}><View style={styles.title} /><View style={styles.line} /><View style={styles.short} /></View></View>)}</View>;
}

const styles = StyleSheet.create({ list: { gap: spacing.md }, card: { minHeight: 116, flexDirection: "row", gap: spacing.md, padding: spacing.md, borderRadius: radii.lg, backgroundColor: colors.surfaceCard }, image: { width: 92, borderRadius: radii.md, backgroundColor: colors.surfaceBlue }, copy: { flex: 1, gap: spacing.sm, paddingTop: spacing.sm }, title: { height: 20, width: "70%", borderRadius: radii.sm, backgroundColor: colors.border }, line: { height: 14, width: "95%", borderRadius: radii.sm, backgroundColor: colors.surfaceBlue }, short: { height: 14, width: "45%", borderRadius: radii.sm, backgroundColor: colors.surfaceBlue } });
