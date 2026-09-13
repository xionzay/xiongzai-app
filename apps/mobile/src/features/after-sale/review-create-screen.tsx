import { useState } from "react";
import { ChevronLeftIcon } from "@/components/ui-icons";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { ApiClientError } from "@/api/api-error";
import { AppScreen } from "@/components/app-screen";
import { FileImage } from "@/components/file-image";
import { NoticeBanner } from "@/components/notice-banner";
import { PageHeader } from "@/components/page-header";
import { StateView } from "@/components/state-view";
import { createReview } from "@/features/after-sale/after-sale-api";
import { useOrderDetail } from "@/features/checkout/order-api";
import { useOnlineStatus } from "@/hooks/use-online-status";
import { queryClient } from "@/query/query-client";
import { colors } from "@/theme/tokens";

const reviewTags = ["技术靠谱", "准时接单", "沟通舒服", "耐心教学"] as const;
const ratingLabels = ["很差", "较差", "一般", "满意", "非常满意"] as const;

const pageBands = Array.from({ length: 64 }, (_, index) => {
  const ratio = index / 63;
  const firstStop = 0.55;
  const from = ratio <= firstStop ? [238, 248, 255] : [255, 250, 240];
  const to = ratio <= firstStop ? [255, 250, 240] : [247, 251, 255];
  const progress = ratio <= firstStop ? ratio / firstStop : (ratio - firstStop) / (1 - firstStop);
  const channel = (value: number, target: number) => Math.round(value + (target - value) * progress);
  return `rgb(${channel(from[0]!, to[0]!)}, ${channel(from[1]!, to[1]!)}, ${channel(from[2]!, to[2]!)})`;
});

export function ReviewCreateScreen() {
  const { orderId = "" } = useLocalSearchParams<{ orderId: string }>();
  const online = useOnlineStatus();
  const order = useOrderDetail(orderId);
  const [rating, setRating] = useState(0);
  const [content, setContent] = useState("");
  const [anonymous, setAnonymous] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  if (!online) return <AppScreen><PageHeader title="评价服务" /><StateView kind="offline" message="恢复网络后重新读取订单评价状态" onRetry={() => void order.refetch()} /></AppScreen>;
  if (order.isPending) return <AppScreen><PageHeader title="评价服务" /><StateView kind="loading" /></AppScreen>;
  if (!order.data || order.isError) return <AppScreen><PageHeader title="评价服务" /><StateView kind="error" onRetry={() => void order.refetch()} /></AppScreen>;

  const current = order.data;
  const allowed = current.available_actions.includes("CREATE_REVIEW");
  const valid = allowed && rating >= 1 && !busy;

  const addTag = (tag: (typeof reviewTags)[number]) => {
    if (busy || content.includes(tag)) return;
    setContent((value) => `${value}${value ? " " : ""}${tag}`.slice(0, 300));
  };

  const submit = async () => {
    if (!valid) return;
    setBusy(true);
    setNotice(null);
    try {
      const result = await createReview({ order_id: orderId, rating, ...(content.trim() ? { content: content.trim() } : {}), anonymous });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["order", orderId] }),
        queryClient.invalidateQueries({ queryKey: ["buyer-orders"] }),
        queryClient.invalidateQueries({ queryKey: ["my-reviews"] }),
        queryClient.invalidateQueries({ queryKey: ["reviews", current.product_id] }),
        queryClient.invalidateQueries({ queryKey: ["companion-reviews", current.seller_id] })
      ]);
      router.replace({ pathname: "/reviews/[id]", params: { id: result.id } });
    } catch (error) {
      setNotice(error instanceof ApiClientError ? error.message : "评价提交失败，请稍后重试");
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={["top", "left", "right", "bottom"]}>
      <ReviewBackdrop />
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === "ios" ? "padding" : "height"} keyboardVerticalOffset={0}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <View style={styles.header}>
            <Pressable accessibilityRole="button" accessibilityLabel="返回订单详情" onPress={() => router.replace({ pathname: "/orders/[id]", params: { id: orderId } })} style={styles.headerButton}><ChevronLeftIcon size={23} /></Pressable>
            <View style={styles.headerCopy}><Text style={styles.headerTitle}>评价服务</Text><Text style={styles.headerSubtitle}>真实评价帮助其他玩家选择</Text></View>
            <View style={styles.headerButton} />
          </View>

          {notice ? <View style={styles.notice}><NoticeBanner tone="danger" message={notice} /></View> : null}
          {!allowed ? <View style={styles.notice}><NoticeBanner tone="danger" message={current.review ? "该订单已经提交评价，不能重复评价。" : "当前订单状态暂不允许评价，请返回订单详情刷新状态。"} /></View> : null}

          <View style={styles.serviceCard}>
            <FileImage fileId={current.product_image || null} style={styles.serviceImage} label={`${current.product_title}图片`} />
            <View style={styles.serviceCopy}><Text style={styles.serviceTitle} numberOfLines={2}>{current.product_title}</Text><Text style={styles.serviceMeta}>陪玩：{current.seller_name}</Text><Text style={styles.serviceMeta}>{current.sku_name} · 约 {current.sku_duration_minutes * current.quantity} 分钟</Text></View>
          </View>

          <View style={styles.ratingCard}>
            <Text style={styles.ratingTitle}>本次服务体验如何？</Text>
            <View accessibilityRole="radiogroup" style={styles.stars}>{[1, 2, 3, 4, 5].map((star) => { const active = star <= rating; return <Pressable key={star} accessibilityRole="radio" accessibilityLabel={`${star}星`} accessibilityState={{ checked: rating === star }} disabled={!allowed || busy} onPress={() => setRating(star)} style={styles.starButton}><Text style={[styles.star, active && styles.starActive]}>{active ? "★" : "☆"}</Text></Pressable>; })}</View>
            <Text style={styles.ratingLabel}>{rating ? ratingLabels[rating - 1] : "请选择评分"}</Text>
          </View>

          <View style={styles.formCard}>
            <View style={styles.field}>
              <Text style={styles.fieldLabel}>评价内容</Text>
              <TextInput accessibilityLabel="评价内容" value={content} onChangeText={setContent} editable={allowed && !busy} multiline maxLength={300} placeholder="分享本次服务体验，帮助其他玩家做选择" placeholderTextColor="#9A978F" textAlignVertical="top" style={styles.reviewInput} />
              <Text style={styles.counter}>{content.length}/300</Text>
            </View>

            <View style={styles.tags}>{reviewTags.map((tag) => { const selected = content.includes(tag); return <Pressable key={tag} accessibilityRole="button" accessibilityState={{ selected }} disabled={!allowed || busy || selected} onPress={() => addTag(tag)} style={[styles.tag, selected && styles.tagSelected]}><Text style={[styles.tagText, selected && styles.tagTextSelected]}>{selected ? "✓ " : ""}{tag}</Text></Pressable>; })}</View>

            <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: anonymous }} disabled={!allowed || busy} onPress={() => setAnonymous((value) => !value)} style={styles.anonymousRow}><View style={[styles.checkbox, anonymous && styles.checkboxChecked]}><Text style={styles.checkmark}>{anonymous ? "✓" : ""}</Text></View><View style={styles.anonymousCopy}><Text style={styles.anonymousTitle}>匿名展示评价</Text><Text style={styles.anonymousNote}>公开时显示“匿名玩家”</Text></View></Pressable>
          </View>

          <View style={styles.ruleCard}><Text style={styles.ruleTitle}>评价规则</Text><Text style={styles.ruleText}>每个订单只能提交一次评价；提交后不能编辑或重复评价，违规内容可能由平台隐藏。</Text></View>

          <Pressable accessibilityRole="button" accessibilityLabel="发布评价" disabled={!valid} onPress={() => void submit()} style={[styles.submit, !valid && styles.disabled]}><Text style={styles.submitText}>{busy ? "正在发布…" : rating < 1 ? "请先选择评分" : "发布评价"}</Text></Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function ReviewBackdrop() { return <View pointerEvents="none" style={styles.backdrop}>{pageBands.map((color, index) => <View key={`${index}-${color}`} style={[styles.band, { backgroundColor: color }]} />)}</View>; }

const softShadow = { shadowColor: "#526F86", shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.13, shadowRadius: 28, elevation: 4 } as const;
const card = { borderWidth: 1, borderColor: "rgba(62,57,47,0.11)", borderRadius: 17, backgroundColor: "rgba(255,253,248,0.96)", ...softShadow } as const;

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#EEF8FF" },
  flex: { flex: 1 },
  backdrop: { position: "absolute", top: 0, bottom: 0, left: 0, right: 0 },
  band: { flex: 1 },
  content: { paddingBottom: 30 },
  header: { minHeight: 84, flexDirection: "row", alignItems: "center", paddingHorizontal: 9, paddingBottom: 11 },
  headerButton: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  back: { color: colors.text, fontSize: 38, lineHeight: 40 },
  headerCopy: { flex: 1, alignItems: "center" },
  headerTitle: { color: colors.text, fontSize: 25, lineHeight: 31, fontWeight: "900", textAlign: "center" },
  headerSubtitle: { marginTop: 3, color: "#74767B", fontSize: 12, lineHeight: 16, textAlign: "center" },
  notice: { marginHorizontal: 12, marginBottom: 10 },
  serviceCard: { minHeight: 122, flexDirection: "row", alignItems: "center", gap: 14, marginHorizontal: 12, marginBottom: 10, padding: 11, ...card },
  serviceImage: { width: 100, height: 100, borderRadius: 14 },
  serviceCopy: { minWidth: 0, flex: 1 },
  serviceTitle: { color: colors.text, fontSize: 15, lineHeight: 21, fontWeight: "900" },
  serviceMeta: { marginTop: 7, color: "#74767B", fontSize: 12, lineHeight: 16 },
  ratingCard: { alignItems: "center", marginHorizontal: 12, marginBottom: 10, padding: 18, ...card },
  ratingTitle: { color: colors.text, fontSize: 16, lineHeight: 21, fontWeight: "900", textAlign: "center" },
  stars: { flexDirection: "row", justifyContent: "center", gap: 8, marginTop: 13 },
  starButton: { width: 48, height: 48, alignItems: "center", justifyContent: "center" },
  star: { color: "#FFB319", fontSize: 43, lineHeight: 48, fontWeight: "500" },
  starActive: { textShadowColor: "rgba(255,179,25,0.22)", textShadowOffset: { width: 0, height: 3 }, textShadowRadius: 7 },
  ratingLabel: { minHeight: 18, marginTop: 6, color: "#B06D00", fontSize: 13, lineHeight: 18, fontWeight: "800" },
  formCard: { marginHorizontal: 12, marginBottom: 10, padding: 15, ...card },
  field: { position: "relative" },
  fieldLabel: { marginBottom: 8, color: colors.text, fontSize: 14, lineHeight: 19, fontWeight: "900" },
  reviewInput: { minHeight: 112, borderWidth: 1, borderColor: "#D8D1C6", borderRadius: 15, padding: 13, paddingBottom: 30, backgroundColor: "#F7F3EC", color: colors.text, fontSize: 13, lineHeight: 19 },
  counter: { position: "absolute", right: 11, bottom: 9, color: "#74767B", fontSize: 12 },
  tags: { flexDirection: "row", flexWrap: "wrap", gap: 7, marginTop: 13 },
  tag: { minHeight: 44, justifyContent: "center", borderWidth: 1, borderColor: "#D5CFE7", borderRadius: 10, paddingHorizontal: 12, paddingVertical: 7, backgroundColor: "#F2EDFF" },
  tagSelected: { borderColor: "#A7CE47", backgroundColor: "#ECFFD0" },
  tagText: { color: "#6548BD", fontSize: 12, lineHeight: 16, fontWeight: "800" },
  tagTextSelected: { color: "#607D1B" },
  anonymousRow: { minHeight: 55, flexDirection: "row", alignItems: "center", gap: 10, marginTop: 13, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: "rgba(62,57,47,0.11)", paddingTop: 12 },
  checkbox: { width: 22, height: 22, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: "#B7B0A6", borderRadius: 7, backgroundColor: colors.white },
  checkboxChecked: { borderColor: colors.brand, backgroundColor: colors.brand },
  checkmark: { color: colors.white, fontSize: 12, fontWeight: "900" },
  anonymousCopy: { flex: 1 },
  anonymousTitle: { color: colors.text, fontSize: 13, lineHeight: 18, fontWeight: "900" },
  anonymousNote: { marginTop: 3, color: "#74767B", fontSize: 12, lineHeight: 16 },
  ruleCard: { marginHorizontal: 12, marginBottom: 10, padding: 15, ...card },
  ruleTitle: { color: colors.text, fontSize: 14, lineHeight: 19, fontWeight: "900" },
  ruleText: { marginTop: 7, color: "#74767B", fontSize: 12, lineHeight: 17 },
  submit: { minHeight: 50, alignItems: "center", justifyContent: "center", marginHorizontal: 12, marginTop: 5, marginBottom: 18, borderRadius: 16, backgroundColor: colors.accent, shadowColor: "#FF4F15", shadowOffset: { width: 0, height: 7 }, shadowOpacity: 0.25, shadowRadius: 16, elevation: 4 },
  submitText: { color: colors.white, fontSize: 14, fontWeight: "900" },
  disabled: { opacity: 0.48 }
});
