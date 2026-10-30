import { useCallback, useState, type ReactNode } from "react";
import { isFulfillmentOrder } from "@xiongzai/contracts/commerce";
import { FulfillmentEvidence, FulfillmentEvidencePicker } from "@/features/checkout/fulfillment-evidence";
import { Alert, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { ApiClientError, userFacingError } from "@/api/api-error";
import { FormField } from "@/components/form-field";
import { FileImage } from "@/components/file-image";
import { NativePage, nativeShadow } from "@/components/native-page";
import { NoticeBanner } from "@/components/notice-banner";
import { PrimaryButton } from "@/components/primary-button";
import { StateView } from "@/components/state-view";
import { createOrderConversation } from "@/features/chat/chat-api";
import { formatServiceTime } from "@/features/checkout/checkout-domain";
import { rejectSellerOrder, sellerOrderAction, useSellerOrder } from "@/features/seller/seller-order-api";
import { scheduledStartReached, sellerActionError, sellerActions, sellerOrderStatusLabel } from "@/features/seller/seller-order-domain";
import { queryClient } from "@/query/query-client";
import { colors, spacing, typography } from "@/theme/tokens";
import type { SellerOrderAction } from "@/types/api";
import { formatCent } from "@/utils/money";

export function SellerOrderDetailScreen({ id }: { id: string }) {
  const [evidence, setEvidence] = useState<string[]>([]), [evidenceReady, setEvidenceReady] = useState(false);
  const chooseEvidence = useCallback((ids: string[], ready: boolean) => { setEvidence(ids); setEvidenceReady(ready); }, []);
  const query = useSellerOrder(id); const [busy, setBusy] = useState(false); const [reason, setReason] = useState(""); const [notice, setNotice] = useState<string | null>(null);
  if (query.isPending) return <NativePage title="卖家订单详情" subtitle="订单快照、履约与售后"><View style={styles.state}><StateView kind="loading" /></View></NativePage>;
  if (!query.data || query.isError) return <NativePage title="卖家订单详情" subtitle="订单快照、履约与售后"><View style={styles.state}><StateView kind="error" title="订单无法加载" onRetry={() => void query.refetch()} /></View></NativePage>;
  const order = query.data; const actions = sellerActions(order);
  const newOrder = isFulfillmentOrder(order);
  const refresh = async () => { await query.refetch(); await queryClient.invalidateQueries({ queryKey: ["seller-orders"] }); };
  const run = async (action: SellerOrderAction) => {
    if (busy) return; setBusy(true); setNotice(null);
    try {
      if (action === "REJECT") { if (reason.trim().length < 2) { setNotice("请填写至少 2 个字的拒单原因"); return; } await rejectSellerOrder(id, order.version, reason.trim()); }
      else if (action === "ACCEPT" || action === "START" || action === "COMPLETE") await sellerOrderAction(id, action.toLowerCase() as "accept" | "start" | "complete", order.version, action === "COMPLETE" && newOrder ? evidence : undefined);
      await refresh(); setNotice("操作已由服务端确认");
    } catch (error) { if (error instanceof ApiClientError) { if (error.code === "RESOURCE_VERSION_CONFLICT") await query.refetch(); setNotice(sellerActionError(error.code)); } else setNotice(userFacingError(error)); }
    finally { setBusy(false); }
  };
  const chat = async () => { if (busy) return; setBusy(true); try { const conversation = await createOrderConversation(id); router.push({ pathname: "/conversations/[id]", params: { id: conversation.id } }); } catch (error) { setNotice(userFacingError(error)); } finally { setBusy(false); } };
  return <NativePage title="卖家订单详情" subtitle="订单快照、履约与售后" contentStyle={styles.content}>
    <NoticeBanner tone={order.after_sale_status === "IN_PROGRESS" ? "danger" : "info"} message={`${sellerOrderStatusLabel(order)} · 操作权限和状态均来自服务端`} />
    {notice ? <NoticeBanner tone={notice.includes("确认") ? "success" : "danger"} message={notice} /> : null}
    {order.status === "ACCEPTED" && !scheduledStartReached(order) ? <NoticeBanner message={`S19 待开始：预约时间为 ${formatServiceTime(order.service_starts_at)}，到时由服务端开放开始操作。`} /> : null}
    {newOrder ? <Card title="付款起算的新订单"><Row label="履约截止" value={formatServiceTime(order.fulfillment_due_at)} /><Row label="自动收货截止" value={formatServiceTime(order.auto_confirm_at)} /><Row label="延期" value={order.receipt_extension_used ? "已使用一次 24 小时" : "尚未使用"} /><Row label="最近催促" value={formatServiceTime(order.last_reminded_at)} />{order.after_sale_status === "IN_PROGRESS" || order.evidence_review_pending ? <NoticeBanner message="售后或证据核查期间，完成和结算暂停。" /> : null}<FulfillmentEvidence orderId={id} files={order.fulfillment_evidence ?? []} />{actions.includes("COMPLETE") ? <FulfillmentEvidencePicker paidCent={order.paid_amount_cent} onChange={chooseEvidence} /> : null}</Card> : null}<Card title="不可变订单快照"><FileImage fileId={order.product_image || null} style={{ width: 96, height: 96, borderRadius: 12 }} label={`${order.product_title}商品图片`} /><Row label="订单号" value={order.order_no} /><Row label="买家" value={order.buyer?.nickname ?? "买家"} /><Row label="服务" value={order.product_title} /><Row label="规格" value={order.sku_name} />{!newOrder ? <><Row label="预约开始" value={formatServiceTime(order.service_starts_at)} /><Row label="预约结束" value={formatServiceTime(order.service_ends_at)} /></> : null}<Row label="订单金额" value={formatCent(order.payable_amount_cent)} /><Row label="平台佣金" value={formatCent(order.platform_fee_cent)} /><Row label="预计收益" value={formatCent(order.seller_income_cent)} /><Row label="版本" value={String(order.version)} /></Card>
    {order.buyer_note ? <Card title="买家备注"><Text style={styles.body}>{order.buyer_note}</Text></Card> : null}
    <Card title="状态记录">{order.status_logs.map((log, index) => <Text key={`${log.created_at}:${index}`} style={styles.meta}>{new Date(log.created_at).toLocaleString("zh-CN")} · {log.action} · {log.remark ?? log.new_status}</Text>)}</Card>
    {actions.includes("REJECT") ? <FormField label="拒单原因" value={reason} onChangeText={setReason} maxLength={1000} placeholder="请填写真实原因" /> : null}
    {actions.includes("ACCEPT") ? <PrimaryButton label="接单" loading={busy} disabled={busy} onPress={() => Alert.alert("确认接单", "接单后请按预约时间履约。", [{ text: "取消", style: "cancel" }, { text: "确认", onPress: () => void run("ACCEPT") }])} /> : null}
    {actions.includes("REJECT") ? <PrimaryButton tone="plain" label="拒绝订单" loading={busy} disabled={busy || reason.trim().length < 2} onPress={() => void run("REJECT")} /> : null}
    {actions.includes("START") ? <PrimaryButton label="开始服务" loading={busy} disabled={busy} onPress={() => Alert.alert("开始服务", newOrder ? "完成期限从付款起算，开始不会重置期限。" : "请确认已到预约时间并准备履约。", [{ text: "取消", style: "cancel" }, { text: "确认", onPress: () => void run("START") }])} /> : null}
    {actions.includes("COMPLETE") ? <PrimaryButton label={newOrder ? "提交完成凭证" : "提交服务完成"} loading={busy} disabled={busy || (newOrder && !evidenceReady)} onPress={() => Alert.alert("提交完成", "提交后等待买家确认。", [{ text: "取消", style: "cancel" }, { text: "确认", onPress: () => void run("COMPLETE") }])} /> : null}
    {actions.includes("PROCESS_REFUND") ? <PrimaryButton tone="plain" label="处理售后退款" onPress={() => order.refunds[0] ? router.push({ pathname: "/seller/refunds/[id]", params: { id: order.refunds[0].id } }) : router.push("/seller/refunds")} /> : null}
    {actions.includes("CONTACT_BUYER") ? <PrimaryButton tone="plain" label="联系买家" loading={busy} onPress={() => void chat()} /> : null}
  </NativePage>;
}
function Card({ title, children }: { title: string; children: ReactNode }) { return <View style={styles.card}><Text style={styles.cardTitle}>{title}</Text>{children}</View>; }
function Row({ label, value }: { label: string; value: string }) { return <View style={styles.row}><Text style={styles.meta}>{label}</Text><Text style={styles.value}>{value}</Text></View>; }
const styles = StyleSheet.create({ content: { gap: spacing.md }, state: { minHeight: 240, justifyContent: "center", borderRadius: 18, backgroundColor: "rgba(255,253,248,0.96)", ...nativeShadow }, card: { gap: spacing.sm, padding: spacing.lg, ...nativeShadow, backgroundColor: "transparent", borderWidth: 0, borderLeftWidth: 0, borderRightWidth: 0, borderTopWidth: 0, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: colors.divider, borderBottomColor: colors.divider, borderRadius: 0, shadowOpacity: 0, elevation: 0 }, cardTitle: { ...typography.cardTitle, color: colors.text }, row: { flexDirection: "row", justifyContent: "space-between", gap: spacing.md }, meta: { ...typography.caption, color: colors.textSecondary }, value: { ...typography.body, color: colors.text, flexShrink: 1, textAlign: "right" }, body: { ...typography.body, color: colors.text } });
