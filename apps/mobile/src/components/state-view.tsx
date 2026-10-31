import { Pressable, StyleSheet, Text, View } from "react-native";
import { StateBear, type BearStateKind } from './state-bear';
import { colors } from "@/theme/tokens";

type StateKind = Extract<BearStateKind, 'loading' | 'empty' | 'error' | 'offline'>;

interface StateViewProps {
  kind: StateKind;
  title?: string;
  message?: string;
  onRetry?: () => void;
  actionLabel?: string;
  illustrationSize?: number;
}

const defaults: Record<StateKind, { title: string; message: string }> = {
  loading: { title: "正在加载", message: "正在获取最新内容，请稍候" },
  empty: { title: "这里还没有内容", message: "真实数据产生后会显示在这里" },
  error: { title: "加载失败", message: "暂时无法获取内容，请稍后重试" },
  offline: { title: "网络已断开", message: "检查网络连接后重新加载" }
};

export function StateView({ kind, title, message, onRetry, actionLabel = "重新加载", illustrationSize = 160 }: StateViewProps) {
  const copy = defaults[kind];
  return (
    <View style={styles.card} accessibilityRole={kind === "loading" ? "progressbar" : kind === "error" || kind === "offline" ? "alert" : "summary"}>
      <View style={styles.art}><StateBear kind={kind} size={illustrationSize} /></View>
      <Text style={styles.title}>{title ?? copy.title}</Text>
      <Text style={styles.message}>{message ?? copy.message}</Text>
      {kind !== "loading" && onRetry ? <Pressable accessibilityRole="button" accessibilityLabel={actionLabel} onPress={onRetry} style={({ pressed }) => [styles.button, pressed && styles.pressed]}><Text style={styles.buttonLabel}>{actionLabel}</Text></Pressable> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { minHeight: 210, alignItems: "center", justifyContent: "center", backgroundColor: "#FFFFFF", borderRadius: 10, borderWidth: 1, borderColor: colors.divider, paddingVertical: 24, paddingHorizontal: 20 },
  art: { marginBottom: 12, maxWidth: '100%' },
  title: { fontSize: 20, lineHeight: 28, fontWeight: '800', marginVertical: 8, color: colors.text, textAlign: "center" },
  message: { fontSize: 12, lineHeight: 20, color: colors.textSecondary, textAlign: "center" },
  button: { minWidth: 132, maxWidth: '100%', minHeight: 44, marginTop: 20, paddingHorizontal: 16, paddingVertical: 10, alignItems: 'center', justifyContent: 'center', borderRadius: 14, backgroundColor: colors.accent },
  buttonLabel: { fontSize: 13, lineHeight: 19, color: colors.white, textAlign: 'center', fontWeight: '800' },
  pressed: { opacity: 0.85 },
});
