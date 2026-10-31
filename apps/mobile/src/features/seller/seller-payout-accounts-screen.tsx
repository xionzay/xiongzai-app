import { useState } from "react";
import { Alert, Pressable, StyleSheet, Text, View } from "react-native";
import { ApiClientError, userFacingError } from "@/api/api-error";
import { FormField } from "@/components/form-field";
import { NativePage, nativeShadow } from "@/components/native-page";
import { NoticeBanner } from "@/components/notice-banner";
import { PrimaryButton } from "@/components/primary-button";
import { StateView } from "@/components/state-view";
import { createPayoutAccount, deletePayoutAccount, financeKeys, setDefaultPayoutAccount, usePayoutAccounts } from "@/features/seller/seller-finance-api";
import { payoutAccountSchema } from "@/features/seller/seller-finance-domain";
import { queryClient } from "@/query/query-client";
import { colors, radii, spacing, typography } from "@/theme/tokens";

export function SellerPayoutAccountsScreen() {
  const query = usePayoutAccounts();
  const [type, setType] = useState<"WECHAT" | "ALIPAY">("WECHAT");
  const [holder, setHolder] = useState("");
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  if (query.isPending) return <NativePage title="收款账户管理" subtitle="仅能提现至本人实名账户"><View style={styles.state}><StateView kind="loading" /></View></NativePage>;
  if (!query.data || query.isError) return <NativePage title="收款账户管理" subtitle="仅能提现至本人实名账户"><View style={styles.state}><StateView kind="error" onRetry={() => void query.refetch()} /></View></NativePage>;

  const refresh = async () => { await query.refetch(); await queryClient.invalidateQueries({ queryKey: financeKeys.summary }); };
  const add = async () => {
    const parsed = payoutAccountSchema.safeParse({ accountType: type, holderName: holder, accountToken: token });
    if (!parsed.success) { setNotice(parsed.error.issues[0]?.message ?? "请检查账户资料"); return; }
    if (busy) return;
    setBusy(true); setNotice(null);
    try {
      await createPayoutAccount({ account_type: type, holder_name: parsed.data.holderName, account_token: parsed.data.accountToken, is_default: query.data.length === 0 });
      setHolder(""); setToken(""); await refresh();
      setNotice("测试收款账户已由本地服务端保存；App 仅展示脱敏摘要。");
    } catch (error) { setNotice(userFacingError(error)); } finally { setBusy(false); }
  };
  const action = async (fn: () => Promise<unknown>) => {
    if (busy) return;
    setBusy(true); setNotice(null);
    try { await fn(); await refresh(); }
    catch (error) {
      if (error instanceof ApiClientError && error.code === "RESOURCE_VERSION_CONFLICT") { await query.refetch(); setNotice("账户已在其他设备更新，已重新加载。"); }
      else setNotice(userFacingError(error));
    } finally { setBusy(false); }
  };

  return <NativePage title="收款账户管理" subtitle="仅能提现至本人实名账户" contentStyle={styles.content}>
    {notice ? <NoticeBanner tone={notice.includes("已") ? "success" : "danger"} message={notice} /> : null}
    <NoticeBanner message="本地测试仅支持微信和支付宝，使用 Mock 验证，不连接真实收款渠道。完整账号不写入普通存储或日志。" />
    {query.data.map((item) => <View key={item.id} style={styles.card}>
      <View style={styles.row}><Text style={styles.title}>{item.account_type === "WECHAT" ? "微信" : "支付宝"}</Text><Text style={styles.status}>{item.is_default ? "默认" : item.verification_status}</Text></View>
      <Text accessibilityLabel={`脱敏收款账户 ${item.display_mask}`} style={styles.mask}>{item.display_mask}</Text>
      {!item.is_default ? <PrimaryButton tone="plain" label="设为默认" disabled={busy} onPress={() => void action(() => setDefaultPayoutAccount(item.id, item.version))} /> : null}
      <PrimaryButton tone="plain" label="删除账户" disabled={busy} onPress={() => Alert.alert("删除收款账户", "正在提现使用的账户不能删除。", [{ text: "取消", style: "cancel" }, { text: "删除", style: "destructive", onPress: () => void action(() => deletePayoutAccount(item.id, item.version)) }])} />
    </View>)}
    <Text style={styles.heading}>添加测试账户</Text>
    <View accessibilityRole="radiogroup" style={styles.switches}>{(["WECHAT", "ALIPAY"] as const).map((value) => <Pressable accessibilityRole="radio" accessibilityState={{ checked: type === value }} key={value} onPress={() => setType(value)} style={[styles.choice, type === value && styles.choiceActive]}><Text style={[styles.choiceText, type === value && styles.choiceTextActive]}>{value === "WECHAT" ? "微信" : "支付宝"}</Text></Pressable>)}</View>
    <FormField label="测试收款人姓名" value={holder} onChangeText={setHolder} autoComplete="off" maxLength={64} />
    <FormField label="测试收款账号" value={token} onChangeText={setToken} autoCapitalize="none" autoCorrect={false} autoComplete="off" secureTextEntry maxLength={128} />
    <PrimaryButton label="本地验证并添加" loading={busy} disabled={busy} onPress={() => void add()} />
  </NativePage>;
}

const styles = StyleSheet.create({
  content: { gap: spacing.md }, state: { minHeight: 240, justifyContent: "center", borderRadius: 18, backgroundColor: "rgba(255,253,248,0.96)", ...nativeShadow }, heading: { ...typography.sectionTitle, color: colors.text },
  card: { gap: spacing.md, padding: spacing.lg, ...nativeShadow, backgroundColor: "transparent", borderWidth: 0, borderLeftWidth: 0, borderRightWidth: 0, borderTopWidth: 0, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: colors.divider, borderBottomColor: colors.divider, borderRadius: 0, shadowOpacity: 0, elevation: 0 },
  row: { flexDirection: "row", justifyContent: "space-between" }, title: { ...typography.cardTitle, color: colors.text },
  status: { ...typography.caption, color: colors.brand, fontWeight: "900" }, mask: { ...typography.sectionTitle, color: colors.text },
  switches: { flexDirection: "row", gap: spacing.sm }, choice: { flex: 1, minHeight: 48, padding: spacing.md, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: "rgba(62,57,47,0.10)", borderRadius: radii.md, backgroundColor: "rgba(255,253,248,0.96)" },
  choiceActive: { backgroundColor: colors.brand }, choiceText: { ...typography.body, color: colors.text }, choiceTextActive: { color: colors.white, fontWeight: "800" }
});
