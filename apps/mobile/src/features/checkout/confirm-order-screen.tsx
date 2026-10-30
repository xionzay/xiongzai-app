import { BrandBackdrop } from "@/components/brand-backdrop";
import { JellyIcon } from "../../components/jelly-icon";
import * as Crypto from "expo-crypto";
import { ChevronLeftIcon, ChevronRightIcon } from "@/components/ui-icons";
import { useCallback, useMemo, useRef, useState } from "react";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { ApiClientError } from "@/api/api-error";
import { useAuth } from "@/auth/auth-provider";
import { checkoutSessionStore } from "@/auth/runtime";
import { AppScreen } from "@/components/app-screen";
import { FileImage } from "@/components/file-image";
import { NoticeBanner } from "@/components/notice-banner";
import { PageHeader } from "@/components/page-header";
import { StateView } from "@/components/state-view";
import { acceptPolicies, usePolicies } from "@/features/account/account-api";
import { checkoutFingerprint, formatServiceTime, orderErrorMessage, previewFingerprint, SingleFlight } from "@/features/checkout/checkout-domain";
import { createOrder, previewOrder, useOrderPreview } from "@/features/checkout/order-api";
import { useOnlineStatus } from "@/hooks/use-online-status";
import { queryClient } from "@/query/query-client";
import { colors } from "@/theme/tokens";
import type { OrderDraftApi, OrderPreviewApiView } from "@/types/api";
import { formatCent } from "@/utils/money";



export function ConfirmOrderScreen() {
  const params = useLocalSearchParams<{ productId: string; skuId?: string; slotId?: string; startsAt?: string; flow?: string }>();
  const { status, user } = useAuth();
  const online = useOnlineStatus();
  const [note, setNote] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [notice, setNotice] = useState<string | null>(null);
  const [displayPreview, setDisplayPreview] = useState<OrderPreviewApiView | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [policyIds, setPolicyIds] = useState<string[]>([]);
  const flight = useRef(new SingleFlight()).current;
  const draft = useMemo<OrderDraftApi | null>(() => {
    if (!params.productId) return null;
    if (params.flow === "fulfillment") return { product_id: params.productId, ...(params.skuId ? { sku_id: params.skuId } : {}), quantity };
    return params.skuId && params.slotId && params.startsAt ? { product_id: params.productId, sku_id: params.skuId, slot_id: params.slotId, quantity: 1, service_starts_at: params.startsAt } : null;
  }, [params.productId, params.skuId, params.slotId, params.startsAt, params.flow, quantity]);
  const newFlow = params.flow === "fulfillment"; const preview = useOrderPreview(status === "authenticated" ? draft : null);
  const transactionPolicies = usePolicies("ORDER_PAYMENT");

  useFocusEffect(useCallback(() => {
    if (status === "anonymous" && draft) {
      const returnTo = `/checkout/confirm?${new URLSearchParams({ productId: draft.product_id, ...(draft.sku_id ? { skuId: draft.sku_id } : {}), ...(draft.slot_id ? { slotId: draft.slot_id } : {}), ...(draft.service_starts_at ? { startsAt: draft.service_starts_at } : {}), ...(params.flow ? { flow: params.flow } : {}) })}`;
      router.replace({ pathname: "/(auth)/required", params: { action: "确认订单", returnTo } });
    }
  }, [draft, status, params.flow]));

  if (!draft || status === "booting" || preview.isPending || transactionPolicies.isPending) return <AppScreen><PageHeader title="确认订单" /><StateView kind="loading" title="正在生成服务端订单预览并读取交易规则" /></AppScreen>;
  if (!online) return <AppScreen><PageHeader title="确认订单" /><StateView kind="offline" onRetry={() => void preview.refetch()} /></AppScreen>;
  const currentPreview = displayPreview ?? preview.data;
  if (preview.isError || !preview.data || !currentPreview) {
    const code = preview.error instanceof ApiClientError ? preview.error.code : "";
    if (code === "POLICY_ACCEPTANCE_REQUIRED" && transactionPolicies.data?.length) return <AppScreen><PageHeader title="确认交易协议" /><Text>创建订单前须主动同意当前交易规则，不会默认勾选。</Text>{transactionPolicies.data.map(policy => <View key={policy.id}><Text>{policy.title} V{policy.version_no}</Text><Text>{policy.content}</Text><Pressable accessibilityRole="checkbox" accessibilityState={{ checked: policyIds.includes(policy.id) }} onPress={() => setPolicyIds(ids => ids.includes(policy.id) ? ids.filter(id => id !== policy.id) : [...ids, policy.id])}><Text>{policyIds.includes(policy.id) ? "已选择" : "未选择"} · 我已阅读并同意</Text></Pressable></View>)}{notice ? <NoticeBanner message={notice} /> : null}<Pressable accessibilityRole="button" disabled={submitting || !transactionPolicies.data.every(policy => policyIds.includes(policy.id))} onPress={async () => { if (flight.busy) return; await flight.run(async () => { setSubmitting(true); try { await acceptPolicies(policyIds, "ORDER_PAYMENT"); await preview.refetch(); } catch { setNotice("协议确认失败，请重试。"); } finally { setSubmitting(false); } }); }}><Text>{submitting ? "确认中…" : "确认协议并重新读取价格"}</Text></Pressable></AppScreen>;
    return <AppScreen><PageHeader title="确认订单" /><StateView kind="error" title="订单预览失败" message={orderErrorMessage(code)} onRetry={() => void preview.refetch()} /></AppScreen>;
  }
  if (transactionPolicies.isError || !transactionPolicies.data?.length) return <AppScreen><PageHeader title="确认订单" /><StateView kind="error" title="交易与售后规则加载失败" message="协议不可用时不能继续创建订单或支付。" onRetry={() => void transactionPolicies.refetch()} /></AppScreen>;

  const submit = () => {
    if (flight.busy || !user) return;
    if (!transactionPolicies.data.every(policy => policyIds.includes(policy.id))) { setNotice("请主动阅读并确认所有当前交易协议。"); return; }
    void flight.run(async () => {
      setSubmitting(true);
      setNotice(null);
      try {
        const latestDraft = { ...draft, ...(params.flow === "fulfillment" ? {} : { buyer_note: note.trim() || null }) };
        const latest = await previewOrder(latestDraft);
        if (previewFingerprint(latest) !== previewFingerprint(currentPreview)) {
          setDisplayPreview(latest);
          setNotice("价格或服务时间已变化，请核对最新订单预览后再次确认。");
          return;
        }
        const finalDraft = { ...latestDraft, expected_payable_amount_cent: latest.payable_amount_cent };
        await acceptPolicies(policyIds, "ORDER_PAYMENT");
        const session = await checkoutSessionStore.getOrCreateOrderIntent(user.id, checkoutFingerprint(latestDraft), () => `order-${Crypto.randomUUID()}`);
        const order = await createOrder(finalDraft, session.orderKey);
        await checkoutSessionStore.attachOrder(order.id);
        await queryClient.invalidateQueries({ queryKey: ["buyer-orders"] });
        router.replace({ pathname: "/orders/[id]/pay", params: { id: order.id } });
      } catch (error) {
        const code = error instanceof ApiClientError ? error.code : "";
        setNotice(orderErrorMessage(code));
      } finally {
        setSubmitting(false);
      }
    });
  };

  return (
    <SafeAreaView style={styles.safe} edges={["top", "left", "right", "bottom"]}>
      <CheckoutBackdrop />
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === "ios" ? "padding" : "height"} keyboardVerticalOffset={0}>
      <ScrollView
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}
        automaticallyAdjustKeyboardInsets={Platform.OS === "ios"}
        contentContainerStyle={styles.content}
      >
        <View style={styles.header}>
          <Pressable accessibilityRole="button" accessibilityLabel="返回" onPress={() => router.back()} style={styles.headerButton}><ChevronLeftIcon size={23} /></Pressable>
          <View style={styles.headerCopy}><Text style={styles.headerTitle}>确认订单</Text><Text style={styles.headerSubtitle}>{newFlow ? "确认商品与完成期限" : "确认服务与预约时间"}</Text></View>
          <View style={styles.headerButton} />
        </View>

        {notice ? <NoticeBanner tone="danger" message={notice} /> : null}

        <View style={styles.serviceCard}>
          <FileImage fileId={currentPreview.product_image_file_id} style={styles.image} label={`${currentPreview.product_title}图片`} />
          <View style={styles.serviceCopy}><Text style={styles.serviceTitle} numberOfLines={2}>{currentPreview.product_title}</Text><Text style={styles.serviceSku}>{currentPreview.sku_name} · {currentPreview.sku_duration_minutes==null?"按完成时限交付":`约 ${currentPreview.sku_duration_minutes} 分钟`}</Text><Text style={styles.seller}>陪玩：{currentPreview.seller_name}</Text></View>
          <Text style={styles.servicePrice}>{formatCent(currentPreview.sku_price_cent)}</Text>
        </View>

        <View style={styles.panel}>
          {currentPreview.fulfillment_seconds != null ? <Text style={styles.scheduleValue}>付款后 {currentPreview.fulfillment_seconds / 3600} 小时内完成；无需预约或卖家接单。</Text> : <><Text style={styles.fieldLabel}>期望服务时间</Text>
          <Pressable accessibilityRole="button" accessibilityLabel={`重新选择预约时间，当前${formatServiceTime(currentPreview.service_starts_at)}`} onPress={() => router.push({ pathname: "/checkout/schedule", params: { productId: draft.product_id, skuId: draft.sku_id } })} style={styles.scheduleEntry}><Text style={styles.scheduleValue} numberOfLines={2}>{formatServiceTime(currentPreview.service_starts_at)}</Text><ChevronRightIcon size={20} /></Pressable></>}
          {params.flow !== "fulfillment" ? <><Text style={[styles.fieldLabel, styles.noteLabel]}>订单备注</Text>
          <View style={styles.inputWrap}><TextInput value={note} onChangeText={setNote} maxLength={100} multiline placeholder="填写段位、沟通方式等备注（选填）" placeholderTextColor="#9A978F" style={styles.input} accessibilityLabel="订单备注" /><Text style={styles.count}>{note.length}/100</Text></View></> : null}
        </View>

        <View style={styles.priceCard}>
          <MoneyRow label="服务金额" value={currentPreview.total_amount_cent} />
          <MoneyRow label="优惠" value={currentPreview.discount_cent} muted />
          <View style={styles.totalRow}><Text style={styles.totalLabel}>合计</Text><Text style={styles.totalAmount}>{formatCent(currentPreview.payable_amount_cent)}</Text></View>
        </View>

        <View style={styles.policyCard}>
          <Text style={styles.fieldLabel}>交易与售后规则</Text>
          <Text style={styles.policyHint}>以下为后端当前已发布的本地测试草案。创建订单前逐份主动确认，不默认勾选。</Text>
          {transactionPolicies.data.map((policy) => <Pressable key={policy.id} accessibilityRole="link" accessibilityLabel={`查看${policy.title}V${policy.version_no}`} onPress={() => router.push({ pathname: "/policies/[id]", params: { id: policy.id } })} style={styles.policyLink}><Text style={styles.policyLinkText}>《{policy.title}》V{policy.version_no}</Text><ChevronRightIcon size={18} /></Pressable>)}
          {transactionPolicies.data.map(policy => <Pressable key={`accept-${policy.id}`} accessibilityRole="checkbox" accessibilityState={{ checked: policyIds.includes(policy.id) }} disabled={submitting} onPress={() => setPolicyIds(ids => ids.includes(policy.id) ? ids.filter(id => id !== policy.id) : [...ids, policy.id])} style={styles.policyLink}><View style={styles.policyAcceptance}>{policyIds.includes(policy.id) ? <JellyIcon kind="check" size={20} /> : <View style={styles.policyUnchecked} />}<Text style={styles.policyAcceptanceText}>我已阅读并同意《{policy.title}》V{policy.version_no}</Text></View></Pressable>)}
          {params.flow === "fulfillment" ? <View><Text>购买数量 {quantity}（不重置完成期限）</Text><Pressable disabled={submitting || quantity <= 1} onPress={() => { setDisplayPreview(null); setQuantity(value => value - 1); }} accessibilityRole="button" accessibilityLabel="减少数量"><Text>－</Text></Pressable><Pressable disabled={submitting || quantity >= 20} onPress={() => { setDisplayPreview(null); setQuantity(value => value + 1); }} accessibilityRole="button" accessibilityLabel="增加数量"><Text><JellyIcon kind="plus" label="添加" /></Text></Pressable></View> : null}
        </View>
      </ScrollView>

      <View style={styles.checkoutBar}>
        <View><Text style={styles.payLabel}>实付</Text><Text style={styles.payAmount}>{formatCent(currentPreview.payable_amount_cent)}</Text></View>
        <Pressable accessibilityRole="button" accessibilityLabel={`提交订单并支付${formatCent(currentPreview.payable_amount_cent)}`} disabled={submitting || note.length > 100 || !transactionPolicies.data.every(policy => policyIds.includes(policy.id))} onPress={submit} style={[styles.submit, submitting && styles.submitDisabled]}><Text style={styles.submitText}>{submitting ? "正在创建订单…" : "提交订单"}</Text></Pressable>
      </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function CheckoutBackdrop() { return <BrandBackdrop />; }

function MoneyRow({ label, value, muted = false }: { label: string; value: string; muted?: boolean }) { return <View style={styles.moneyRow}><Text style={styles.moneyLabel}>{label}</Text><Text style={[styles.moneyValue, muted && styles.moneyMuted]}>{formatCent(value)}</Text></View>; }

const softShadow = { shadowColor: "#4B3920", shadowOffset: { width: 0, height: 5 }, shadowOpacity: 0.08, shadowRadius: 14, elevation: 3 } as const;

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.canvas },
  flex: { flex: 1 },
  backdrop: { position: "absolute", top: 0, bottom: 0, left: 0, right: 0 },
  band: { flex: 1 },
  content: { paddingBottom: 20 },
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: 9, minHeight: 60, paddingBottom: 4, height: undefined },
  headerButton: { alignItems: "center", justifyContent: "center", backgroundColor: "transparent", borderWidth: 0, borderLeftWidth: 0, borderRightWidth: 0, borderTopWidth: 0, borderBottomWidth: 0, borderColor: colors.divider, borderBottomColor: colors.divider, borderRadius: 0, shadowOpacity: 0, elevation: 0, width: 48, height: undefined, minHeight: 48 },
  back: { color: colors.text, fontSize: 38, lineHeight: 40 },
  headerCopy: { flex: 1, alignItems: "center", marginLeft: 0, minWidth: 0 },
  headerTitle: { color: colors.text, fontSize: 19, lineHeight: 26, fontWeight: "600", textAlign: "center" },
  headerSubtitle: { marginTop: 3, fontSize: 12, lineHeight: 16, textAlign: "center", color: colors.textSecondary },
  serviceCard: { minHeight: 122, flexDirection: "row", alignItems: "center", gap: 10, marginHorizontal: 12, marginBottom: 10, padding: 10, ...softShadow, backgroundColor: "transparent", borderWidth: 0, borderLeftWidth: 0, borderRightWidth: 0, borderTopWidth: 0, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: colors.divider, borderBottomColor: colors.divider, borderRadius: 0, shadowOpacity: 0, elevation: 0 },
  image: { width: 100, height: 100, borderRadius: 13, backgroundColor: "#CBE4FA" },
  serviceCopy: { flex: 1 },
  serviceTitle: { color: colors.text, fontSize: 14, lineHeight: 20, fontWeight: "800" },
  serviceSku: { marginTop: 6, color: "#74767B", fontSize: 12, lineHeight: 17 },
  seller: { marginTop: 6, color: "#5947AD", fontSize: 12, lineHeight: 17 },
  servicePrice: { flexShrink: 0, color: colors.text, fontSize: 16, fontWeight: "900" },
  panel: { marginHorizontal: 12, marginBottom: 10, padding: 14, ...softShadow, backgroundColor: "transparent", borderWidth: 0, borderLeftWidth: 0, borderRightWidth: 0, borderTopWidth: 0, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: colors.divider, borderBottomColor: colors.divider, borderRadius: 0, shadowOpacity: 0, elevation: 0 },
  fieldLabel: { marginBottom: 8, color: colors.text, fontSize: 14, fontWeight: "800" },
  scheduleEntry: { minHeight: 54, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10, borderWidth: 1, borderColor: "#7FB9E7", borderRadius: 13, paddingHorizontal: 14, paddingVertical: 9, backgroundColor: "#EDF7FF" },
  scheduleValue: { flex: 1, color: "#236FA9", fontSize: 13, lineHeight: 19, fontWeight: "800" },
  chevron: { color: "#236FA9", fontSize: 25, lineHeight: 29 },
  noteLabel: { marginTop: 15 },
  inputWrap: { position: "relative" },
  input: { paddingHorizontal: 11, paddingTop: 11, paddingBottom: 25, borderWidth: 1, color: colors.text, lineHeight: 20, textAlignVertical: "top", backgroundColor: colors.input, borderColor: colors.controlBorder, borderRadius: 10, fontSize: 16, minHeight: 48, shadowOpacity: 0, elevation: 0 },
  count: { position: "absolute", right: 10, bottom: 9, color: "#74767B", fontSize: 12 },
  priceCard: { marginHorizontal: 12, marginBottom: 10, paddingHorizontal: 13, paddingVertical: 10, ...softShadow, backgroundColor: "transparent", borderWidth: 0, borderLeftWidth: 0, borderRightWidth: 0, borderTopWidth: 0, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: colors.divider, borderBottomColor: colors.divider, borderRadius: 0, shadowOpacity: 0, elevation: 0 },
  policyCard: { marginHorizontal: 12, marginBottom: 10, padding: 14, ...softShadow, backgroundColor: "transparent", borderWidth: 0, borderLeftWidth: 0, borderRightWidth: 0, borderTopWidth: 0, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: colors.divider, borderBottomColor: colors.divider, borderRadius: 0, shadowOpacity: 0, elevation: 0 },
  policyHint: { color: colors.textSecondary, fontSize: 12, lineHeight: 18 },
  policyAcceptance: { flexDirection: "row", alignItems: "center", gap: 6, flex: 1 },
  policyAcceptanceText: { flex: 1 },
  policyUnchecked: { width: 18, height: 18, borderRadius: 5, borderWidth: 1, borderColor: colors.textSecondary },
  policyLink: { minHeight: 46, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: "rgba(62,57,47,0.11)" },
  policyLinkText: { flex: 1, color: colors.brandDeep, fontSize: 12, lineHeight: 17, fontWeight: "800" },
  moneyRow: { minHeight: 43, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: "rgba(62,57,47,0.11)" },
  moneyLabel: { color: colors.text, fontSize: 13 },
  moneyValue: { color: colors.text, fontSize: 14, fontWeight: "800" },
  moneyMuted: { color: "#74767B" },
  totalRow: { minHeight: 50, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
  totalLabel: { color: colors.text, fontSize: 20, fontWeight: "900" },
  totalAmount: { color: colors.accent, fontSize: 20, fontWeight: "900" },
  checkoutBar: { minHeight: 74, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10, paddingHorizontal: 13, paddingVertical: 10, borderTopWidth: 1, borderTopColor: "rgba(62,57,47,0.11)", backgroundColor: "rgba(255,252,245,0.97)", shadowColor: "#4B3A23", shadowOffset: { width: 0, height: -8 }, shadowOpacity: 0.06, shadowRadius: 24, elevation: 6 },
  payLabel: { color: colors.text, fontSize: 12 },
  payAmount: { marginTop: 2, color: colors.accent, fontSize: 18, fontWeight: "900" },
  submit: { height: 48, alignItems: "center", justifyContent: "center", borderRadius: 15, paddingHorizontal: 30, backgroundColor: colors.accent, shadowColor: colors.accent, shadowOffset: { width: 0, height: 7 }, shadowOpacity: 0.24, shadowRadius: 14, elevation: 4 },
  submitDisabled: { backgroundColor: "#C9C8C4", shadowOpacity: 0 },
  submitText: { color: colors.white, fontSize: 12, fontWeight: "900" }
});
