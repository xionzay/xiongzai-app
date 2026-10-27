import { packageLabel } from "@/features/catalog/service-catalog";
import * as Crypto from "expo-crypto";
import { ChevronLeftIcon, ChevronRightIcon } from "@/components/ui-icons";
import { useEffect, useMemo, useRef, useState } from "react";
import { router, useLocalSearchParams } from "expo-router";
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
import { usePolicies } from "@/features/account/account-api";
import { checkoutFingerprint, formatServiceTime, orderErrorMessage, previewFingerprint, SingleFlight } from "@/features/checkout/checkout-domain";
import { createOrder, previewOrder, useOrderPreview } from "@/features/checkout/order-api";
import { useOnlineStatus } from "@/hooks/use-online-status";
import { queryClient } from "@/query/query-client";
import { colors } from "@/theme/tokens";
import type { OrderDraftApi, OrderPreviewApiView } from "@/types/api";
import { formatCent } from "@/utils/money";

const pageBands = Array.from({ length: 64 }, (_, index) => {
  const ratio = index / 63;
  const from = ratio <= 0.56 ? [255, 250, 240] : [255, 253, 247];
  const to = ratio <= 0.56 ? [255, 253, 247] : [248, 241, 231];
  const progress = ratio <= 0.56 ? ratio / 0.56 : (ratio - 0.56) / 0.44;
  const channel = (value: number, target: number) => Math.round(value + (target - value) * progress);
  return `rgb(${channel(from[0]!, to[0]!)}, ${channel(from[1]!, to[1]!)}, ${channel(from[2]!, to[2]!)})`;
});

export function ConfirmOrderScreen() {
  const params = useLocalSearchParams<{ productId: string; skuId: string; slotId: string; startsAt: string }>();
  const { status, user } = useAuth();
  const online = useOnlineStatus();
  const [note, setNote] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [displayPreview, setDisplayPreview] = useState<OrderPreviewApiView | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const flight = useRef(new SingleFlight()).current;
  const draft = useMemo<OrderDraftApi | null>(() => params.productId && params.skuId && params.slotId && params.startsAt ? ({ product_id: params.productId, sku_id: params.skuId, slot_id: params.slotId, quantity: 1, service_starts_at: params.startsAt, buyer_note: null }) : null, [params.productId, params.skuId, params.slotId, params.startsAt]);
  const preview = useOrderPreview(status === "authenticated" ? draft : null);
  const transactionPolicies = usePolicies("ORDER_PAYMENT");

  useEffect(() => {
    if (status === "anonymous" && draft) {
      const returnTo = `/checkout/confirm?productId=${encodeURIComponent(draft.product_id)}&skuId=${encodeURIComponent(draft.sku_id)}&slotId=${encodeURIComponent(draft.slot_id)}&startsAt=${encodeURIComponent(draft.service_starts_at)}`;
      router.replace({ pathname: "/(auth)/required", params: { action: "确认订单", returnTo } });
    }
  }, [draft, status]);

  if (!draft || status === "booting" || preview.isPending || transactionPolicies.isPending) return <AppScreen><PageHeader title="确认订单" /><StateView kind="loading" title="正在生成服务端订单预览并读取交易规则" /></AppScreen>;
  if (!online) return <AppScreen><PageHeader title="确认订单" /><StateView kind="offline" onRetry={() => void preview.refetch()} /></AppScreen>;
  const currentPreview = displayPreview ?? preview.data;
  if (preview.isError || !preview.data || !currentPreview) {
    const code = preview.error instanceof ApiClientError ? preview.error.code : "";
    return <AppScreen><PageHeader title="确认订单" /><StateView kind="error" title="订单预览失败" message={orderErrorMessage(code)} onRetry={() => void preview.refetch()} /></AppScreen>;
  }
  if (transactionPolicies.isError || !transactionPolicies.data?.length) return <AppScreen><PageHeader title="确认订单" /><StateView kind="error" title="交易与售后规则加载失败" message="协议不可用时不能继续创建订单或支付。" onRetry={() => void transactionPolicies.refetch()} /></AppScreen>;

  const submit = () => {
    if (flight.busy || !user) return;
    void flight.run(async () => {
      setSubmitting(true);
      setNotice(null);
      try {
        const latestDraft = { ...draft, buyer_note: note.trim() || null };
        const latest = await previewOrder(latestDraft);
        if (previewFingerprint(latest) !== previewFingerprint(currentPreview)) {
          setDisplayPreview(latest);
          setNotice("价格或服务时间已变化，请核对最新订单预览后再次确认。");
          return;
        }
        const finalDraft = { ...latestDraft, expected_payable_amount_cent: latest.payable_amount_cent };
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
          <View style={styles.headerCopy}><Text style={styles.headerTitle}>确认订单</Text><Text style={styles.headerSubtitle}>确认服务与预约时间</Text></View>
          <View style={styles.headerButton} />
        </View>

        {notice ? <NoticeBanner tone="danger" message={notice} /> : null}

        <View style={styles.serviceCard}>
          <FileImage fileId={currentPreview.product_image_file_id} style={styles.image} label={`${currentPreview.product_title}图片`} />
          <View style={styles.serviceCopy}><Text style={styles.serviceTitle} numberOfLines={2}>{currentPreview.product_title}</Text><Text style={styles.serviceSku}>{currentPreview.sku_name} · {packageLabel(currentPreview)} / 份 · 约 {currentPreview.sku_duration_minutes} 分钟</Text><Text style={styles.seller}>陪玩：{currentPreview.seller_name}</Text></View>
          <Text style={styles.servicePrice}>{formatCent(currentPreview.sku_price_cent)}</Text>
        </View>

        <View style={styles.panel}>
          <Text style={styles.fieldLabel}>期望服务时间</Text>
          <Pressable accessibilityRole="button" accessibilityLabel={`重新选择预约时间，当前${formatServiceTime(currentPreview.service_starts_at)}`} onPress={() => router.push({ pathname: "/checkout/schedule", params: { productId: draft.product_id, skuId: draft.sku_id } })} style={styles.scheduleEntry}><Text style={styles.scheduleValue} numberOfLines={2}>{formatServiceTime(currentPreview.service_starts_at)}</Text><ChevronRightIcon size={20} /></Pressable>
          <Text style={[styles.fieldLabel, styles.noteLabel]}>订单备注</Text>
          <View style={styles.inputWrap}><TextInput value={note} onChangeText={setNote} maxLength={100} multiline placeholder="填写段位、沟通方式等备注（选填）" placeholderTextColor="#9A978F" style={styles.input} accessibilityLabel="订单备注" /><Text style={styles.count}>{note.length}/100</Text></View>
        </View>

        <View style={styles.priceCard}>
          <MoneyRow label="服务金额" value={currentPreview.total_amount_cent} />
          <MoneyRow label="优惠" value={currentPreview.discount_cent} muted />
          <View style={styles.totalRow}><Text style={styles.totalLabel}>合计</Text><Text style={styles.totalAmount}>{formatCent(currentPreview.payable_amount_cent)}</Text></View>
        </View>

        <View style={styles.policyCard}>
          <Text style={styles.fieldLabel}>交易与售后规则</Text>
          <Text style={styles.policyHint}>以下为后端当前已发布的本地测试草案。进入收银台后需逐份在线确认，未同意不能创建支付。</Text>
          {transactionPolicies.data.map((policy) => <Pressable key={policy.id} accessibilityRole="link" accessibilityLabel={`查看${policy.title}V${policy.version_no}`} onPress={() => router.push({ pathname: "/policies/[id]", params: { id: policy.id } })} style={styles.policyLink}><Text style={styles.policyLinkText}>《{policy.title}》V{policy.version_no}</Text><ChevronRightIcon size={18} /></Pressable>)}
        </View>
      </ScrollView>

      <View style={styles.checkoutBar}>
        <View><Text style={styles.payLabel}>实付</Text><Text style={styles.payAmount}>{formatCent(currentPreview.payable_amount_cent)}</Text></View>
        <Pressable accessibilityRole="button" accessibilityLabel={`提交订单并支付${formatCent(currentPreview.payable_amount_cent)}`} disabled={submitting || note.length > 100} onPress={submit} style={[styles.submit, submitting && styles.submitDisabled]}><Text style={styles.submitText}>{submitting ? "正在创建订单…" : "提交订单"}</Text></Pressable>
      </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function CheckoutBackdrop() { return <View pointerEvents="none" style={styles.backdrop}>{pageBands.map((color, index) => <View key={`${index}-${color}`} style={[styles.band, { backgroundColor: color }]} />)}</View>; }

function MoneyRow({ label, value, muted = false }: { label: string; value: string; muted?: boolean }) { return <View style={styles.moneyRow}><Text style={styles.moneyLabel}>{label}</Text><Text style={[styles.moneyValue, muted && styles.moneyMuted]}>{formatCent(value)}</Text></View>; }

const softShadow = { shadowColor: "#4B3920", shadowOffset: { width: 0, height: 5 }, shadowOpacity: 0.08, shadowRadius: 14, elevation: 3 } as const;

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#F6EFE4" },
  flex: { flex: 1 },
  backdrop: { position: "absolute", top: 0, bottom: 0, left: 0, right: 0 },
  band: { flex: 1 },
  content: { paddingBottom: 20 },
  header: { minHeight: 84, flexDirection: "row", alignItems: "center", paddingHorizontal: 9, paddingBottom: 11 },
  headerButton: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  back: { color: colors.text, fontSize: 38, lineHeight: 40 },
  headerCopy: { flex: 1, alignItems: "center" },
  headerTitle: { color: colors.text, fontSize: 23, lineHeight: 30, fontWeight: "900", textAlign: "center" },
  headerSubtitle: { marginTop: 3, color: "#74767B", fontSize: 12, lineHeight: 16, textAlign: "center" },
  serviceCard: { minHeight: 122, flexDirection: "row", alignItems: "center", gap: 10, marginHorizontal: 12, marginBottom: 10, padding: 10, borderWidth: 1, borderColor: "rgba(62,57,47,0.11)", borderRadius: 17, backgroundColor: "#FFFDF8", ...softShadow },
  image: { width: 100, height: 100, borderRadius: 13, backgroundColor: "#CBE4FA" },
  serviceCopy: { flex: 1 },
  serviceTitle: { color: colors.text, fontSize: 14, lineHeight: 20, fontWeight: "800" },
  serviceSku: { marginTop: 6, color: "#74767B", fontSize: 12, lineHeight: 17 },
  seller: { marginTop: 6, color: "#5947AD", fontSize: 12, lineHeight: 17 },
  servicePrice: { flexShrink: 0, color: colors.text, fontSize: 16, fontWeight: "900" },
  panel: { marginHorizontal: 12, marginBottom: 10, padding: 14, borderWidth: 1, borderColor: "rgba(62,57,47,0.11)", borderRadius: 17, backgroundColor: "rgba(255,253,248,0.96)", ...softShadow },
  fieldLabel: { marginBottom: 8, color: colors.text, fontSize: 14, fontWeight: "800" },
  scheduleEntry: { minHeight: 54, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10, borderWidth: 1, borderColor: "#7FB9E7", borderRadius: 13, paddingHorizontal: 14, paddingVertical: 9, backgroundColor: "#EDF7FF" },
  scheduleValue: { flex: 1, color: "#236FA9", fontSize: 13, lineHeight: 19, fontWeight: "800" },
  chevron: { color: "#236FA9", fontSize: 25, lineHeight: 29 },
  noteLabel: { marginTop: 15 },
  inputWrap: { position: "relative" },
  input: { minHeight: 82, paddingHorizontal: 11, paddingTop: 11, paddingBottom: 25, borderWidth: 1, borderColor: "rgba(62,57,47,0.13)", borderRadius: 12, backgroundColor: "#FAF7F0", color: colors.text, fontSize: 14, lineHeight: 20, textAlignVertical: "top" },
  count: { position: "absolute", right: 10, bottom: 9, color: "#74767B", fontSize: 12 },
  priceCard: { marginHorizontal: 12, marginBottom: 10, paddingHorizontal: 13, paddingVertical: 10, borderWidth: 1, borderColor: "rgba(62,57,47,0.11)", borderRadius: 17, backgroundColor: "rgba(255,253,248,0.96)", ...softShadow },
  policyCard: { marginHorizontal: 12, marginBottom: 10, padding: 14, borderWidth: 1, borderColor: "rgba(62,57,47,0.11)", borderRadius: 17, backgroundColor: "rgba(255,253,248,0.96)", ...softShadow },
  policyHint: { color: colors.textSecondary, fontSize: 12, lineHeight: 18 },
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
