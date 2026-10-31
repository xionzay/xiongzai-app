import { StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { NativePage, nativeShadow } from "@/components/native-page";
import { NoticeBanner } from "@/components/notice-banner";
import { PrimaryButton } from "@/components/primary-button";
import { StateView } from "@/components/state-view";
import { useSellerProfile, useSellerService } from "@/features/seller/seller-api";
import { sellerServiceActions } from "@/features/seller/seller-domain";
import { colors, spacing, typography } from "@/theme/tokens";
import type { SellerProductStatus } from "@/types/api";
import { formatCent } from "@/utils/money";

const copy: Record<SellerProductStatus, { title: string; message: string }> = {
  DRAFT: { title: "服务草稿", message: "服务尚未提交平台审核。" },
  PENDING_REVIEW: { title: "审核中", message: "平台正在审核服务资料，期间暂不可编辑。" },
  ON_SALE: { title: "审核通过并在售", message: "买家端可看到并购买这项服务。" },
  REVIEW_REJECTED: { title: "审核未通过", message: "请根据平台原因修改后重新提交。" },
  OFF_SALE: { title: "已主动下架", message: "买家端不可购买，修改后可重新提交审核。" },
  ADMIN_OFF_SALE: { title: "平台下架", message: "当前不能自行恢复，请按平台说明处理。" },
  DELETED: { title: "已删除", message: "服务已经删除，不再提供经营操作。" }
};

export function SellerServiceReviewScreen({ id }: { id: string }) {
  const query = useSellerService(id);
  const seller = useSellerProfile();
  if (query.isPending || seller.isPending) return <NativePage title="服务审核详情" subtitle="平台审核状态与意见"><View style={styles.state}><StateView kind="loading" /></View></NativePage>;
  if (!seller.data || seller.data.status !== "APPROVED") return <NativePage title="服务审核详情" subtitle="平台审核状态与意见"><NoticeBanner tone="danger" message="G05 权限限制：只有 APPROVED 陪玩可以查看经营审核详情。" /><PrimaryButton tone="plain" label="查看陪玩身份" onPress={() => router.replace("/settings/switch-identity")} /></NativePage>;
  if (!query.data || query.isError) return <NativePage title="服务审核详情" subtitle="平台审核状态与意见"><View style={styles.state}><StateView kind="error" title="审核详情无法加载" onRetry={() => void query.refetch()} /></View></NativePage>;
  const product = query.data;
  const state = copy[product.status];
  const actions = sellerServiceActions(product.status);
  return <NativePage title="服务审核详情" subtitle="平台审核状态与意见" contentStyle={styles.content}>
    <NoticeBanner tone={product.status === "ON_SALE" ? "success" : product.status === "REVIEW_REJECTED" || product.status === "ADMIN_OFF_SALE" ? "danger" : "info"} message={`${state.title}：${state.message}`} />
    {product.rejection_reason ? <NoticeBanner tone="danger" message={`平台原因：${product.rejection_reason}`} /> : null}
    <View style={styles.card}><Text style={styles.title}>{product.title}</Text><Row label="共享状态" value={product.status} /><Row label="业务版本" value={String(product.version)} /><Row label="审核版本" value={String(product.current_version_no)} /><Row label="提交时间" value={dateText(product.submitted_at)} /><Row label="通过时间" value={dateText(product.approved_at)} /></View>
    <Text style={styles.heading}>规格快照</Text>
    {product.skus.filter((sku) => sku.status !== "DELETED").map((sku) => <View key={sku.id} style={styles.card}><Text style={styles.title}>{sku.sku_name}</Text><Row label="状态" value={sku.status} /><Row label="价格" value={formatCent(sku.price_cent)} /><Row label="时长" value={`${sku.duration_minutes} 分钟`} /><Row label="版本" value={String(sku.version)} /></View>)}
    {actions.includes("EDIT") ? <PrimaryButton label="修改服务" onPress={() => router.replace({ pathname: "/seller/services/[id]/edit", params: { id } })} /> : null}
    {!actions.includes("EDIT") ? <NoticeBanner message="当前状态未开放编辑入口，避免客户端发起非法状态转换。" /> : null}
  </NativePage>;
}

function Row({ label, value }: { label: string; value: string }) { return <View style={styles.row}><Text style={styles.label}>{label}</Text><Text style={styles.value}>{value}</Text></View>; }
function dateText(value: string | null) { return value ? new Date(value).toLocaleString("zh-CN") : "—"; }
const styles = StyleSheet.create({ content: { gap: spacing.md }, state: { minHeight: 230, justifyContent: "center", borderRadius: 18, backgroundColor: "rgba(255,253,248,0.96)", ...nativeShadow }, card: { gap: spacing.sm, padding: spacing.lg, ...nativeShadow, backgroundColor: "transparent", borderWidth: 0, borderLeftWidth: 0, borderRightWidth: 0, borderTopWidth: 0, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: colors.divider, borderBottomColor: colors.divider, borderRadius: 0, shadowOpacity: 0, elevation: 0 }, title: { ...typography.cardTitle, color: colors.text }, heading: { ...typography.sectionTitle, color: colors.text }, row: { flexDirection: "row", justifyContent: "space-between", gap: spacing.md }, label: { ...typography.caption, color: colors.textSecondary }, value: { ...typography.body, color: colors.text, flexShrink: 1, textAlign: "right" } });
