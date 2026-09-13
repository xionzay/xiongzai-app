import { router } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { NoticeBanner } from "@/components/notice-banner";
import { StateView } from "@/components/state-view";
import { togglePolicyConfirmation } from "@/features/account/policy-confirmation-domain";
import { colors, radii, spacing, typography } from "@/theme/tokens";
import type { PolicyApiView } from "@/types/api";

export function PolicyConfirmationList({
  title,
  hint,
  policies,
  isPending,
  isError,
  confirmedIds,
  disabled = false,
  onChange,
  onRetry
}: {
  title: string;
  hint: string;
  policies?: PolicyApiView[];
  isPending: boolean;
  isError: boolean;
  confirmedIds: readonly string[];
  disabled?: boolean;
  onChange(ids: string[]): void;
  onRetry(): void;
}) {
  return (
    <View style={styles.card}>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.hint}>{hint}</Text>
      <NoticeBanner message="以下均为后端已发布的本地测试草案。请逐份阅读并主动选择‘在线确认并同意’，不会调用第三方电子签。" />
      {isPending ? <View style={styles.state}><StateView kind="loading" title="正在加载已发布协议" /></View> : null}
      {isError || (!isPending && !policies?.length) ? (
        <View style={styles.state}><StateView kind="error" title="协议加载失败，当前操作已阻断" message="协议不可用时不能继续提交。" onRetry={onRetry} /></View>
      ) : null}
      {policies?.map((policy) => {
        const checked = confirmedIds.includes(policy.id);
        return (
          <View key={policy.id} style={styles.row}>
            <Pressable
              accessibilityRole="checkbox"
              accessibilityLabel={`在线确认并同意${policy.title}V${policy.version_no}`}
              accessibilityState={{ checked, disabled }}
              disabled={disabled}
              onPress={() => onChange(togglePolicyConfirmation(confirmedIds, policy.id))}
              style={({ pressed }) => [styles.checkTarget, pressed && styles.pressed]}
            >
              <View style={[styles.checkbox, checked && styles.checkboxChecked]}>{checked ? <Text style={styles.checkmark}>✓</Text> : null}</View>
            </Pressable>
            <View style={styles.copy}>
              <Text style={styles.confirmCopy}>在线确认并同意</Text>
              <Pressable accessibilityRole="link" accessibilityLabel={`查看${policy.title}V${policy.version_no}`} onPress={() => router.push({ pathname: "/policies/[id]", params: { id: policy.id } })}>
                <Text style={styles.link}>《{policy.title}》V{policy.version_no}</Text>
              </Pressable>
            </View>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { gap: spacing.sm, padding: spacing.lg, borderWidth: 1, borderColor: "rgba(62,57,47,0.10)", borderRadius: radii.lg, backgroundColor: "rgba(255,253,248,0.96)" },
  title: { ...typography.sectionTitle, color: colors.text },
  hint: { ...typography.caption, color: colors.textSecondary },
  state: { minHeight: 150, justifyContent: "center" },
  row: { minHeight: 58, flexDirection: "row", alignItems: "center", gap: spacing.sm, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: "rgba(62,57,47,0.12)" },
  checkTarget: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  checkbox: { width: 22, height: 22, alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: colors.textSecondary, borderRadius: 7, backgroundColor: colors.white },
  checkboxChecked: { borderColor: colors.brand, backgroundColor: colors.brand },
  checkmark: { color: colors.white, fontSize: 13, fontWeight: "900" },
  copy: { flex: 1, paddingVertical: spacing.sm },
  confirmCopy: { ...typography.caption, color: colors.textSecondary },
  link: { marginTop: 3, ...typography.caption, color: colors.brandDeep, fontWeight: "800" },
  pressed: { opacity: 0.68 }
});
