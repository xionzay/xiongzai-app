import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { PrimaryButton } from "@/components/primary-button";
import { nativeShadow } from "@/components/native-page";
import { colors, radii, spacing, typography } from "@/theme/tokens";

type StateKind = "loading" | "empty" | "error" | "offline";

interface StateViewProps {
  kind: StateKind;
  title?: string;
  message?: string;
  onRetry?: () => void;
  actionLabel?: string;
}

const defaults: Record<StateKind, { title: string; message: string; mark: string }> = {
  loading: { title: "正在加载", message: "正在获取最新内容，请稍候", mark: "" },
  empty: { title: "这里还没有内容", message: "真实数据产生后会显示在这里", mark: "—" },
  error: { title: "加载失败", message: "暂时无法获取内容，请稍后重试", mark: "!" },
  offline: { title: "网络已断开", message: "检查网络连接后重新加载", mark: "×" }
};

export function StateView({ kind, title, message, onRetry, actionLabel = "重新加载" }: StateViewProps) {
  const copy = defaults[kind];
  return (
    <View style={styles.card} accessibilityRole={kind === "loading" ? "progressbar" : kind === "error" || kind === "offline" ? "alert" : "summary"}>
      {kind === "loading" ? <ActivityIndicator size="large" color={colors.brand} /> : <Text style={styles.mark}>{copy.mark}</Text>}
      <Text style={styles.title}>{title ?? copy.title}</Text>
      <Text style={styles.message}>{message ?? copy.message}</Text>
      {kind !== "loading" && onRetry ? <View style={styles.button}><PrimaryButton tone="plain" label={actionLabel} onPress={onRetry} /></View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { minHeight: 210, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: "rgba(62,57,47,0.10)", borderRadius: radii.lg, backgroundColor: "rgba(255,253,248,0.96)", padding: spacing.xl, gap: spacing.sm, ...nativeShadow },
  mark: { fontSize: 38, color: colors.brand, fontWeight: "800" },
  title: { ...typography.sectionTitle, color: colors.text, textAlign: "center" },
  message: { ...typography.caption, color: colors.textSecondary, textAlign: "center" },
  button: { minWidth: 150, marginTop: spacing.sm }
});
