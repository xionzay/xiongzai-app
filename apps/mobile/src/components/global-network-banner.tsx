import { StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useOnlineStatus } from "@/hooks/use-online-status";
import { colors, spacing, typography } from "@/theme/tokens";

export function GlobalNetworkBanner() {
  const online = useOnlineStatus();
  const insets = useSafeAreaInsets();
  if (online) return null;
  return <View pointerEvents="none" accessibilityRole="alert" accessibilityLiveRegion="polite" style={[styles.banner, { paddingTop: insets.top + spacing.xs }]}><Text style={styles.copy}>当前断网；已禁止写请求自动重试，恢复后会安全同步读数据</Text></View>;
}

const styles = StyleSheet.create({ banner: { position: "absolute", zIndex: 900, top: 0, left: 0, right: 0, paddingBottom: spacing.xs, paddingHorizontal: spacing.md, backgroundColor: colors.danger }, copy: { ...typography.caption, color: colors.white, textAlign: "center", fontWeight: "800" } });
