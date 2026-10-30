import { useRef, useState } from "react";
import { Alert, Pressable, StyleSheet, Text, View } from "react-native";
import * as Crypto from "expo-crypto";
import { router } from "expo-router";
import { userFacingError } from "@/api/api-error";
import { useAuth } from "@/auth/auth-provider";
import { withdrawalIntentStore } from "@/auth/runtime";
import { FormField } from "@/components/form-field";
import { NativePage, nativeShadow } from "@/components/native-page";
import { NoticeBanner } from "@/components/notice-banner";
import { PrimaryButton } from "@/components/primary-button";
import { StateView } from "@/components/state-view";
import { createWithdrawal, financeKeys, previewWithdrawal, useFinanceSummary, usePayoutAccounts, useWithdrawalPolicy } from "@/features/seller/seller-finance-api";
import { formatBps, SingleFlightAction, validateWithdrawalCent, yuanInputToCent } from "@/features/seller/seller-finance-domain";
import { queryClient } from "@/query/query-client";
import { colors, radii, spacing, typography } from "@/theme/tokens";
import type { WithdrawalPreviewApiView } from "@/types/api";
import { formatCent } from "@/utils/money";

export function SellerWithdrawScreen() {
  const { user } = useAuth();
  const summary = useFinanceSummary(); const policy = useWithdrawalPolicy(); const accounts = usePayoutAccounts();
  const [accountId, setAccountId] = useState(""); const [amount, setAmount] = useState("");
  const [preview, setPreview] = useState<WithdrawalPreviewApiView | null>(null);
  const [busy, setBusy] = useState(false); const [notice, setNotice] = useState<string | null>(null);
  const singleFlight = useRef(new SingleFlightAction()).current;
  if (summary.isPending || policy.isPending || accounts.isPending) return <NativePage title="收益提现" subtitle="资金转入已验证的收款账户"><View style={styles.state}><StateView kind="loading" /></View></NativePage>;
  if (!summary.data || !policy.data || !accounts.data || summary.isError || policy.isError || accounts.isError) return <NativePage title="收益提现" subtitle="资金转入已验证的收款账户"><View style={styles.state}><StateView kind="error" onRetry={() => void Promise.all([summary.refetch(), policy.refetch(), accounts.refetch()])} /></View></NativePage>;

  const selectedAccountId = accountId || (accounts.data.find((item) => item.is_default) ?? accounts.data[0])?.id || "";
  const cent = yuanInputToCent(amount);
  const validation = cent ? validateWithdrawalCent(cent, summary.data.available_cent, policy.data.min_amount_cent, policy.data.max_amount_cent) : "请输入最多两位小数的提现金额";
  const loadPreview = async () => {
    if (!cent || validation || busy || !selectedAccountId) return;
    setBusy(true); setNotice(null);
    try { setPreview(await previewWithdrawal({ payout_account_id: selectedAccountId, amount_cent: cent })); }
    catch (error) { setNotice(userFacingError(error)); } finally { setBusy(false); }
  };
  const submit = async () => {
    if (!preview || busy || !user) return;
    setBusy(true); setNotice(null);
    try {
      const fingerprint = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, `${user.id}:${preview.payout_account.id}:${preview.amount_cent}`);
      const key = await withdrawalIntentStore.keyFor(fingerprint);
      const created = await singleFlight.run(() => createWithdrawal({ payout_account_id: preview.payout_account.id, amount_cent: preview.amount_cent }, key));
      await withdrawalIntentStore.clear();
      await Promise.all([queryClient.invalidateQueries({ queryKey: financeKeys.summary }), queryClient.invalidateQueries({ queryKey: financeKeys.incomes }), queryClient.invalidateQueries({ queryKey: financeKeys.withdrawals })]);
      router.replace({ pathname: "/seller/finance/withdrawals/[id]", params: { id: created.id } });
    } catch (error) { setNotice(`${userFacingError(error)}。未确认失败前会复用同一个提现幂等键，避免重复提现。`); }
    finally { setBusy(false); }
  };

  return <NativePage title="收益提现" subtitle="资金转入已验证的收款账户" contentStyle={styles.content}>
    <NoticeBanner message="本地测试提现：仅调用后端 Mock Payout Provider，不会向微信或支付宝真实打款。" />
    {notice ? <NoticeBanner tone="danger" message={notice} /> : null}
    {summary.data.withdrawal_paused ? <NoticeBanner tone="danger" message="服务端已暂停提现，请先处理欠款或风险事件。" /> : null}
    <View style={styles.card}><Row label="可提现" value={formatCent(summary.data.available_cent)} /><Row label="欠款" value={formatCent(summary.data.liability_cent)} /><Row label="最低提现" value={formatCent(policy.data.min_amount_cent)} /><Row label="最高提现" value={formatCent(policy.data.max_amount_cent)} /><Row label="手续费率" value={formatBps(policy.data.fee_bps)} /></View>
    <Text style={styles.heading}>选择脱敏收款账户</Text>
    {accounts.data.length ? <View accessibilityRole="radiogroup" style={styles.choices}>{accounts.data.map((item) => <Pressable accessibilityRole="radio" accessibilityState={{ checked: selectedAccountId === item.id }} key={item.id} onPress={() => { setAccountId(item.id); setPreview(null); }} style={[styles.choice, selectedAccountId === item.id && styles.choiceActive]}><Text style={styles.title}>{item.account_type === "WECHAT" ? "微信" : "支付宝"}</Text><Text style={styles.meta}>{item.display_mask}</Text></Pressable>)}</View> : <><NoticeBanner tone="danger" message="尚未添加本地测试收款账户。" /><PrimaryButton tone="plain" label="添加微信或支付宝账户" onPress={() => router.push("/seller/finance/accounts")} /></>}
    <FormField label="测试提现金额（元）" value={amount} onChangeText={(value) => { setAmount(value); setPreview(null); }} keyboardType="decimal-pad" placeholder="0.00" error={amount && validation ? validation : undefined} />
    <PrimaryButton tone="plain" label="服务端校验并预览" loading={busy} disabled={busy || Boolean(validation) || !selectedAccountId || summary.data.withdrawal_paused} onPress={() => void loadPreview()} />
    {preview ? <View style={styles.card}><Text style={styles.heading}>确认测试提现</Text><Row label="提现金额" value={formatCent(preview.amount_cent)} /><Row label="手续费" value={formatCent(preview.fee_cent)} /><Row label="模拟到账" value={formatCent(preview.actual_amount_cent)} /><Row label="到账账户" value={preview.payout_account.display_mask} /><PrimaryButton label="提交 Mock 提现" loading={busy} disabled={busy} onPress={() => Alert.alert("确认测试提现", `Mock 模拟到账 ${formatCent(preview.actual_amount_cent)}，不会真实打款。确认提交？`, [{ text: "取消", style: "cancel" }, { text: "确认提交", onPress: () => void submit() }])} /></View> : null}
  </NativePage>;
}

function Row({ label, value }: { label: string; value: string }) { return <View style={styles.row}><Text style={styles.meta}>{label}</Text><Text style={styles.value}>{value}</Text></View>; }
const styles = StyleSheet.create({
  content: { gap: spacing.md }, state: { minHeight: 240, justifyContent: "center", borderRadius: 18, backgroundColor: "rgba(255,253,248,0.96)", ...nativeShadow }, card: { gap: spacing.md, padding: spacing.lg, ...nativeShadow, backgroundColor: "transparent", borderWidth: 0, borderLeftWidth: 0, borderRightWidth: 0, borderTopWidth: 0, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: colors.divider, borderBottomColor: colors.divider, borderRadius: 0, shadowOpacity: 0, elevation: 0 },
  row: { flexDirection: "row", justifyContent: "space-between", gap: spacing.md }, heading: { ...typography.sectionTitle, color: colors.text },
  title: { ...typography.cardTitle, color: colors.text }, meta: { ...typography.caption, color: colors.textSecondary }, value: { ...typography.body, color: colors.text, fontWeight: "800" },
  choices: { gap: spacing.sm }, choice: { minHeight: 60, gap: spacing.xs, padding: spacing.lg, borderRadius: radii.md, backgroundColor: colors.surfaceCard, borderWidth: 1, borderColor: colors.border },
  choiceActive: { borderColor: colors.brand, backgroundColor: colors.surfaceBlue }
});
