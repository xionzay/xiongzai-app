import { router } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { FileImage } from "@/components/file-image";
import { colors, radii, shadows, spacing, typography } from "@/theme/tokens";
import type { CompanionApiView, ServiceApiView } from "@/types/api";
import { formatCent } from "@/utils/money";

export function CompanionCard({ item, pressable = false, grid = false, wide = false, actionLabel }: { item: CompanionApiView; pressable?: boolean; grid?: boolean; wide?: boolean; actionLabel?: string }) {
  const content = (
    <>
      <View style={[styles.companionPhoto, grid && styles.gridCompanionPhoto, wide && styles.wideCompanionPhoto]}>
        <FileImage fileId={item.seller_avatar_file_id ?? item.cover_file_id} resizeMode="cover" style={styles.companionImage} label={`${item.seller_nickname}头像`} />
        {item.accepting_orders ? <Text style={styles.online}>在线</Text> : null}
      </View>
      <View style={[styles.copy, grid && styles.gridCopy, wide && styles.wideCopy]}>
        <View style={styles.titleRow}>
          <Text style={[styles.title, (grid || wide) && styles.compactTitle]} numberOfLines={1}>{item.seller_nickname}</Text>
          <Text style={[styles.rating, (grid || wide) && styles.compactRating]}>★ {item.rating_avg}</Text>
        </View>
        <Text style={[styles.subtitle, (grid || wide) && styles.compactSubtitle]} numberOfLines={1}>{item.game_rank ?? "和平精英陪玩"}</Text>
        <View style={styles.tags}>
          {[item.preferred_mode, item.play_style].filter(Boolean).slice(0, 2).map((tag) => <Text key={tag} style={[styles.tag, (grid || wide) && styles.compactTag]}>{tag}</Text>)}
        </View>
        <Text style={[styles.meta, (grid || wide) && styles.compactMeta]}>{item.completed_order_count} 单 · {item.accepting_orders ? "在线接单" : "暂不接单"}</Text>
      </View>
      {actionLabel ? <View style={styles.wideAction}><Text style={styles.wideActionText} numberOfLines={1}>{actionLabel}</Text></View> : null}
    </>
  );
  const cardStyle = [styles.card, grid && styles.gridCard, wide && styles.wideCard];
  if (pressable) return <Pressable accessibilityRole="button" accessibilityLabel={`查看陪玩${item.seller_nickname}，评分${item.rating_avg}`} onPress={() => router.push(`/companions/${item.id}`)} style={cardStyle}>{content}</Pressable>;
  return (
    <View style={cardStyle} accessibilityLabel={`${item.seller_nickname}，评分${item.rating_avg}`}>
      {content}
    </View>
  );
}

export function ServiceCard({ item, pressable = false, grid = false }: { item: ServiceApiView; pressable?: boolean; grid?: boolean }) {
  const content = <>
      <FileImage fileId={item.cover_file_id} resizeMode="cover" style={[styles.serviceImage, grid && styles.gridServiceImage]} label={`${item.title}封面`} />
      <View style={[styles.copy, grid && styles.gridCopy]}>
        <Text style={[styles.title, grid && styles.serviceGridTitle]} numberOfLines={grid ? 1 : 2} ellipsizeMode="tail">{item.title}</Text>
        <Text style={[styles.subtitle, grid && styles.serviceGridSubtitle]} numberOfLines={grid ? 1 : 2} ellipsizeMode="tail">{item.service_time_description ?? item.description}</Text>
        <View style={styles.priceRow}>
          <Text style={[styles.price, grid && styles.gridPrice]}>{formatCent(item.min_price_cent)}<Text style={[styles.priceSuffix, grid && styles.gridPriceSuffix]}> 起</Text></Text>
          <Text style={[styles.meta, grid && styles.compactMeta]}>已售 {item.sold_count} · ★ {item.rating_avg}</Text>
        </View>
        {grid && item.seller ? <View style={styles.seller}><FileImage fileId={item.seller.seller_avatar_file_id} style={styles.sellerAvatar} label={`${item.seller.seller_nickname}头像`} /><Text style={styles.sellerName} numberOfLines={1}>{item.seller.seller_nickname}</Text><Text style={styles.sellerRating}>★ {item.rating_avg}</Text></View> : null}
      </View>
    </>;
  const cardStyle = [styles.serviceCard, grid && styles.serviceGridCard];
  if (pressable) return <Pressable accessibilityRole="button" accessibilityLabel={`查看服务${item.title}，${formatCent(item.min_price_cent)}起`} onPress={() => router.push(`/services/${item.id}`)} style={cardStyle}>{content}</Pressable>;
  return <View accessibilityRole="summary" accessibilityLabel={`${item.title}，${formatCent(item.min_price_cent)}起`} style={cardStyle}>{content}</View>;
}

const styles = StyleSheet.create({
  card: { width: 170, overflow: "hidden", borderWidth: 1, borderColor: colors.border, borderRadius: 15, backgroundColor: "#FFFDF8", ...shadows.card },
  gridCard: { width: "100%" },
  wideCard: { width: "100%", minHeight: 112, flexDirection: "row", alignItems: "stretch" },
  companionPhoto: { position: "relative", width: "100%", height: 140, overflow: "hidden", backgroundColor: colors.surfaceBlue },
  gridCompanionPhoto: { height: undefined, aspectRatio: 1 },
  wideCompanionPhoto: { width: 112, height: 112, aspectRatio: 1 },
  companionImage: { width: "100%", height: "100%", backgroundColor: colors.surfaceBlue },
  online: { position: "absolute", right: 7, bottom: 7, overflow: "hidden", paddingHorizontal: 7, paddingVertical: 3, borderRadius: 7, backgroundColor: colors.lime, color: "#33420D", fontSize: 12, fontWeight: "900" },
  serviceCard: { overflow: "hidden", flexDirection: "row", borderWidth: 1, borderColor: colors.border, borderRadius: radii.lg, backgroundColor: colors.surfaceCard, ...shadows.card },
  serviceGridCard: { width: "100%", flexDirection: "column", borderRadius: 15, backgroundColor: "#FFFDF8" },
  serviceImage: { width: 118, minHeight: 134, backgroundColor: colors.surfaceBlue },
  gridServiceImage: { width: "100%", minHeight: 0, aspectRatio: 1 },
  copy: { flex: 1, padding: spacing.md, gap: spacing.xs },
  gridCopy: { minHeight: 124, padding: 9, gap: 4 },
  wideCopy: { justifyContent: "center", padding: 10 },
  wideAction: { width: 72, alignItems: "center", justifyContent: "center", paddingHorizontal: 4 },
  wideActionText: { color: colors.accent, fontSize: 12, lineHeight: 17, fontWeight: "900" },
  titleRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.xs },
  title: { ...typography.cardTitle, flexShrink: 1, color: colors.text },
  rating: { ...typography.caption, color: colors.warning, fontWeight: "800" },
  subtitle: { ...typography.caption, color: colors.textSecondary },
  compactTitle: { fontSize: 13, lineHeight: 18 },
  serviceGridTitle: { height: 18, fontSize: 12, lineHeight: 18 },
  serviceGridSubtitle: { height: 18, color: colors.textSecondary, fontSize: 12, lineHeight: 18 },
  compactRating: { fontSize: 12, lineHeight: 16 },
  compactSubtitle: { fontSize: 12, lineHeight: 16 },
  tags: { flexDirection: "row", flexWrap: "wrap", gap: spacing.xs },
  tag: { fontSize: 12, color: colors.violet, backgroundColor: "#EEE9FF", paddingHorizontal: 7, paddingVertical: 4, borderRadius: radii.sm },
  compactTag: { paddingHorizontal: 5, paddingVertical: 3, borderRadius: 6, fontSize: 12 },
  meta: { ...typography.caption, color: colors.textSecondary },
  compactMeta: { fontSize: 12, lineHeight: 16 },
  priceRow: { marginTop: "auto", flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", gap: spacing.sm },
  price: { color: colors.accent, fontSize: 20, fontWeight: "900" },
  gridPrice: { fontSize: 16 },
  priceSuffix: { fontSize: 12, fontWeight: "600" },
  gridPriceSuffix: { fontSize: 12 },
  seller: { minHeight: 30, flexDirection: "row", alignItems: "center", gap: 5, marginTop: 4, paddingTop: 7, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  sellerAvatar: { width: 22, height: 22, borderRadius: 11 },
  sellerName: { flex: 1, color: colors.text, fontSize: 12, fontWeight: "700" },
  sellerRating: { color: "#D58A00", fontSize: 12 }
});
