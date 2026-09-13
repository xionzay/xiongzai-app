import * as Crypto from "expo-crypto";
import { router } from "expo-router";
import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { ApiClientError, userFacingError } from "@/api/api-error";
import { FormField } from "@/components/form-field";
import { NativeButton, NativePage, NativeRow, PaperCard, SectionHeading, nativeShadow } from "@/components/native-page";
import { NoticeBanner } from "@/components/notice-banner";
import { StateView } from "@/components/state-view";
import { createAccountCancellation, revokeAccountCancellation, useAccountCancellationEligibility, useAccountCancellations } from "@/features/account/account-api";
import { colors } from "@/theme/tokens";
import type { AccountCancellationApiView } from "@/types/api";

const blockerLabels: Record<string, string> = { ACTIVE_ORDER: "存在进行中的订单", ACTIVE_REFUND: "存在处理中的退款", ACTIVE_COMPLAINT: "存在处理中的投诉", ACTIVE_WITHDRAWAL: "存在未完成提现", SELLER_BALANCE: "陪玩账户仍有可用或锁定余额", SELLER_LIABILITY: "陪玩账户仍有待偿责任" };

export function AccountCancellationScreen() {
  const eligibility = useAccountCancellationEligibility();
  const requests = useAccountCancellations();
  const [confirmed, setConfirmed] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const active = requests.data?.find((item) => item.status === "REQUESTED" || item.status === "PROCESSING") ?? null;
  const reload = async () => { await Promise.all([eligibility.refetch(), requests.refetch()]); };
  const apply = async () => {
    if (busy || !confirmed || reason.trim().length < 2) { setNotice("请填写至少2个字的注销原因并确认影响"); return; }
    setBusy(true); setNotice(null);
    try { await createAccountCancellation(reason.trim(), Crypto.randomUUID()); await reload(); setNotice("注销申请已由服务端受理，冷静期内可以撤销。"); }
    catch (error) { if (error instanceof ApiClientError && error.code === "ACCOUNT_CANCELLATION_BLOCKED") await eligibility.refetch(); setNotice(userFacingError(error)); }
    finally { setBusy(false); }
  };
  const revoke = async (item: AccountCancellationApiView) => {
    if (busy) return; setBusy(true); setNotice(null);
    try { await revokeAccountCancellation(item.id, item.version); await reload(); setNotice("注销申请已由服务端撤销。"); }
    catch (error) { if (error instanceof ApiClientError && error.code === "RESOURCE_VERSION_CONFLICT") await requests.refetch(); setNotice(userFacingError(error)); }
    finally { setBusy(false); }
  };
  if (eligibility.isPending || requests.isPending) return <NativePage title="注销账号" subtitle="该操作会永久影响账号使用"><StateView kind="loading" /></NativePage>;
  if ((eligibility.isError && !eligibility.data) || (requests.isError && !requests.data)) return <NativePage title="注销账号" subtitle="该操作会永久影响账号使用"><StateView kind="error" message={userFacingError(eligibility.error ?? requests.error)} onRetry={() => void reload()} /></NativePage>;
  const waitingDays = Math.max(1, Math.ceil((eligibility.data?.waiting_period_seconds ?? 0) / 86_400));
  return <NativePage title="注销账号" subtitle="服务端核验、冷静期和撤销均已接通" contentStyle={styles.content} refreshing={eligibility.isRefetching || requests.isRefetching} onRefresh={() => void reload()}>
    {notice ? <NoticeBanner tone={notice.includes("已") ? "success" : "danger"} message={notice} /> : null}
    <View style={styles.warning}><Text style={styles.warningMark}>!</Text><Text style={styles.warningTitle}>注销前请认真确认</Text><Text style={styles.warningText}>申请通过服务端条件检查后进入约{waitingDays}天冷静期；历史交易证据按规则留存。</Text></View>
    <PaperCard><SectionHeading title="服务端实时条件检查" note={eligibility.data?.checked_at ? `检查时间 ${formatTime(eligibility.data.checked_at)}` : undefined} />{eligibility.data?.blocker_codes.length ? eligibility.data.blocker_codes.map((code, index, rows) => <NativeRow key={code} label={blockerLabels[code] ?? "存在未完成业务"} value="需先处理" danger last={index === rows.length - 1} />) : <NativeRow label="当前未发现阻塞条件" note="提交时服务端会再次核验" value="可以申请" last />}</PaperCard>
    {active ? <PaperCard><SectionHeading title="进行中的注销申请" note={`申请编号 ${active.id.slice(0, 8)}…`} /><NativeRow label="状态" value={cancellationStatusLabel(active.status)} /><NativeRow label="申请原因" value={active.reason} /><NativeRow label="冷静期结束" value={formatTime(active.waiting_period_ends_at)} last />{active.status === "REQUESTED" ? <View style={styles.actionGap}><NativeButton label={busy ? "正在撤销…" : "撤销注销申请"} tone="secondary" disabled={busy} onPress={() => void revoke(active)} /></View> : null}</PaperCard> : <><FormField label="注销原因" value={reason} onChangeText={setReason} multiline maxLength={500} placeholder="请说明申请注销的原因" style={styles.reason} /><Pressable accessibilityRole="checkbox" accessibilityState={{ checked: confirmed }} onPress={() => setConfirmed((value) => !value)} style={styles.agreement}><View style={[styles.checkbox, confirmed && styles.checked]}><Text style={styles.check}>{confirmed ? "✓" : ""}</Text></View><Text style={styles.agreementText}>我已了解冷静期、数据处理范围和账号注销影响</Text></Pressable><NativeButton label={busy ? "正在提交…" : "申请注销账号"} tone="danger" disabled={busy || !confirmed || !eligibility.data?.eligible} onPress={() => void apply()} /></>}
    {requests.data?.filter((item) => item.id !== active?.id).length ? <PaperCard><SectionHeading title="历史申请" />{requests.data.filter((item) => item.id !== active?.id).map((item, index, rows) => <NativeRow key={item.id} label={formatTime(item.requested_at)} note={item.rejection_reason ?? item.reason} value={cancellationStatusLabel(item.status)} last={index === rows.length - 1} />)}</PaperCard> : null}
    <NativeButton label="联系平台客服" tone="secondary" onPress={() => router.push("/support")} />
  </NativePage>;
}
function cancellationStatusLabel(status: AccountCancellationApiView["status"]) { return ({ REQUESTED: "冷静期中", CANCELLED: "已撤销", PROCESSING: "处理中", COMPLETED: "已注销", REJECTED: "已驳回" } as const)[status]; }
function formatTime(value: string) { const date = new Date(value); return Number.isNaN(date.getTime()) ? "--" : date.toLocaleString("zh-CN", { hour12: false }); }
const styles = StyleSheet.create({ content: { gap: 13 }, warning: { alignItems: "center", padding: 20, borderWidth: 1, borderColor: "rgba(229,72,77,0.20)", borderRadius: 19, backgroundColor: "rgba(255,240,232,0.96)", ...nativeShadow }, warningMark: { width: 48, height: 48, borderRadius: 24, color: colors.white, backgroundColor: colors.danger, fontSize: 27, lineHeight: 48, fontWeight: "900", textAlign: "center" }, warningTitle: { marginTop: 12, color: colors.text, fontSize: 18, fontWeight: "900" }, warningText: { marginTop: 7, color: colors.textSecondary, fontSize: 12, lineHeight: 17, textAlign: "center" }, reason: { minHeight: 92, textAlignVertical: "top", paddingTop: 14 }, agreement: { minHeight: 48, flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 4 }, checkbox: { width: 22, height: 22, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: colors.border, borderRadius: 6, backgroundColor: "#FFFDF8" }, checked: { borderColor: colors.brand, backgroundColor: colors.brand }, check: { color: colors.white, fontWeight: "900" }, agreementText: { flex: 1, color: colors.text, fontSize: 12, lineHeight: 17 }, actionGap: { padding: 12 } });
