import { BrandBackdrop } from "@/components/brand-backdrop";
import { useRef, useState } from "react";
import { ShortcutScrollbar, scrollProgress } from "@/components/shortcut-scrollbar";
import { Image, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import type { ReactNode } from "react";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { useAuth } from "@/auth/auth-provider";
import { secureStoreAdapter } from "@/auth/runtime";
import { FileImage } from "@/components/file-image";
import { ChevronRightIcon } from "@/components/ui-icons";
import { ApprovedIllustration } from "@/components/approved-illustration";
import { useConversationUnread } from "@/features/chat/chat-api";
import { shouldPollChat } from "@/features/chat/chat-domain";
import { useAppActivity } from "@/hooks/use-app-activity";
import { useOnlineStatus } from "@/hooks/use-online-status";
import { colors, typography } from "@/theme/tokens";
import { approvedLayout, orderEntryWidth } from "@/theme/approved-layout";
import xiongzaiIcon from "../../../assets/xiongzai-icon.png";
import couponIcon from "../../../assets/reference-jelly-v5/coupon-center-original-shape.png";

export const mineOrderEntries = [
  { label: "全部订单", status: "ALL", icon: "order" },
  { label: "待付款", status: "PENDING_PAYMENT", icon: "wallet" },
  { label: "待服务", status: "PENDING_SERVICE", icon: "mine-wait" },
  { label: "服务中", status: "IN_SERVICE", icon: "service" },
  { label: "待收货", status: "PENDING_BUYER_CONFIRM", icon: "order" },
  { label: "待评价", status: "PENDING_REVIEW", icon: "message" },
  { label: "售后中", status: "AFTER_SALE", icon: "shield" }
] as const;


export function MineScreen() {
  const { user, refreshUser } = useAuth();
  const [refreshing, setRefreshing] = useState(false);
  const online = useOnlineStatus();
  const polling = shouldPollChat(useAppActivity(), online);
  const unread = useConversationUnread(Boolean(user), polling);
  const { width, fontScale } = useWindowDimensions();
  const orderScroll = useRef<ScrollView>(null);
  const [orderOffset, setOrderOffset] = useState(0);
  const entryWidth = orderEntryWidth(width, fontScale);
  const orderViewport = width - 28;
  const orderContent = entryWidth * mineOrderEntries.length;
  if (!user) return null;

  const unreadCount = unread.data?.unread_count;

  const refresh = async () => {
    setRefreshing(true);
    try { await refreshUser(); }
    finally { setRefreshing(false); }
  };

  return (
    <SafeAreaView style={styles.safe} edges={["top", "left", "right"]}>
      <SkyBackdrop />
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void refresh()} tintColor={colors.accent} />}
      >
        <View style={styles.header}>
          <View style={styles.headerCopy}>
            <Text style={styles.pageTitle}>我的</Text>
          </View>
          <Pressable accessibilityRole="button" accessibilityLabel="打开设置" onPress={() => router.push("/settings")} style={styles.settingsButton}>
            <ApprovedIllustration kind="setting" size={28} />
          </Pressable>
        </View>

        <Pressable accessibilityRole="button" accessibilityLabel="编辑个人资料" onPress={() => router.push("/settings/profile")} style={({ pressed }) => [styles.profile, pressed && styles.pressed]}>
          <View style={styles.avatarWrap}>
            {user.profile?.avatar_file_id ? (
              <FileImage fileId={user.profile.avatar_file_id} style={styles.avatar} label="用户头像" />
            ) : (
              <Image source={xiongzaiIcon} style={styles.avatar} accessibilityLabel="熊崽默认头像" />
            )}
          </View>
          <View style={styles.profileCopy}>
            <Text style={styles.nickname} numberOfLines={1}>{user.profile?.nickname ?? "熊崽用户"}</Text>
            <Text style={styles.meta}>查看与编辑个人资料</Text>
          </View>
          <ChevronRightIcon size={20} />
        </Pressable>

        {secureStoreAdapter.isTemporaryStorage() ? <View accessibilityRole="alert" style={styles.storageWarning}><Text style={styles.menuNote}>当前模拟器安全存储不可用，登录仅保存在进程内存。重载或退出开发客户端后需重新登录，真机不会使用此降级。</Text></View> : null}

        <View style={styles.orderPanel}>
          <View style={styles.orderHeading}><Text style={styles.menuLabel}>我的订单</Text></View>
          <ScrollView ref={orderScroll} horizontal showsHorizontalScrollIndicator={false} scrollEventThrottle={16} onScroll={event => setOrderOffset(event.nativeEvent.contentOffset.x)} contentContainerStyle={styles.orderEntries}>
            {mineOrderEntries.map(item => <Pressable key={item.status} accessibilityRole="button" accessibilityLabel={item.status === "ALL" ? "查看全部订单" : `查看${item.label}订单`} onPress={() => router.push({ pathname: "/(buyer-tabs)/orders", params: { filter: item.status } })} style={({ pressed }) => [styles.orderEntry, { width: orderEntryWidth(width, fontScale) }, pressed && styles.pressed]}><ApprovedIllustration kind={item.icon} size={32} /><Text style={styles.orderEntryText}>{item.label}</Text></Pressable>)}
          </ScrollView>
          <ShortcutScrollbar progress={scrollProgress(orderOffset, orderContent, orderViewport)} onChange={value => orderScroll.current?.scrollTo({ x: value * Math.max(0, orderContent - orderViewport), animated: false })} />
        </View>

        <View style={styles.assets}>
          <AssetCard icon={<ApprovedIllustration kind="favorite" size={36} />} label="我的收藏" note="店铺与商品" onPress={() => router.push("/favorites")} />
          <AssetCard icon={<Image source={couponIcon} style={styles.assetIcon} accessible={false} />} label="优惠券" note="前往领券中心" onPress={() => router.push("/coupons")} />
        </View>

        <View style={styles.menu}>
          <MenuRow icon={<ApprovedIllustration kind="message" size={32} />} label="消息" note={unread.isError ? "读取失败，点此重试" : unreadCount === undefined ? "正在读取未读消息…" : `${unreadCount} 条未读`} onPress={() => router.push("/(buyer-tabs)/messages")} />
          <MenuRow icon={<ApprovedIllustration kind="app-rules" size={32} />} label="平台规则" note="交易、售后与评价说明" last onPress={() => router.push("/rules")} />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function SkyBackdrop() { return <BrandBackdrop />; }

function AssetCard({ icon, label, note, onPress }: { icon: ReactNode; label: string; note: string; onPress(): void }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`${label}，${note}`} onPress={onPress} style={({ pressed }) => [styles.assetCard, pressed && styles.pressed]}>
      <View style={styles.assetIcon}>{icon}</View>
      <View style={styles.menuCopy}><Text style={styles.assetLabel}>{label}</Text><Text style={styles.assetNote}>{note}</Text></View>
    </Pressable>
  );
}

function MenuRow({ icon, label, note, onPress, last = false }: { icon: ReactNode; label: string; note: string; onPress(): void; last?: boolean }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`${label}，${note}`} onPress={onPress} style={({ pressed }) => [styles.menuRow, !last && styles.menuBorder, pressed && styles.pressed]}>
      <View style={styles.menuIcon}>{icon}</View>
      <View style={styles.menuCopy}>
        <Text style={styles.menuLabel}>{label}</Text>
        <Text style={styles.menuNote}>{note}</Text>
      </View>
      <ChevronRightIcon size={20} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.surface },
  backdrop: { position: "absolute", top: 0, bottom: 0, left: 0, right: 0 },
  skyBand: { flex: 1 },
  content: { paddingTop: 2, paddingBottom: 22 },
  header: { minHeight: approvedLayout.headerHeight, flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 14, paddingBottom: 8 },
  headerCopy: { flex: 1, gap: 3, paddingLeft: 44 },
  pageTitle: { fontSize: approvedLayout.titleSize, lineHeight: 28, fontWeight: "600", color: colors.text, textAlign: "center" },
  pageSubtitle: { ...typography.caption, color: colors.textSecondary },
  settingsButton: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  profile: { minHeight: 104, flexDirection: "row", alignItems: "center", gap: 12, marginHorizontal: 14, paddingVertical: 16, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: approvedLayout.divider },
  orderPanel: { marginHorizontal: 14, paddingBottom: 16, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: approvedLayout.divider },
  orderHeading: { minHeight: 40, justifyContent: "center" },
  orderEntries: { flexDirection: "row" },
  orderEntry: { minHeight: 68, paddingVertical: 4, gap: 6, alignItems: "center", justifyContent: "center" },
  orderEntryText: { color: colors.text, fontSize: 13, lineHeight: 19, textAlign: "center" },
  storageWarning: { marginHorizontal: 12, marginBottom: 10, padding: 12, borderRadius: 12, backgroundColor: "#FFF4CC" },
  avatarWrap: { position: "relative" },
  avatar: { width: 64, height: 64, borderRadius: 16, backgroundColor: colors.surfaceBlue },
  onlineDot: { position: "absolute", right: 1, bottom: 4, width: 15, height: 15, borderWidth: 3, borderColor: colors.surfaceCard, borderRadius: 8, backgroundColor: colors.success },
  profileCopy: { flex: 1, gap: 8 },
  nickname: { fontSize: 17, lineHeight: 24, color: colors.text, fontWeight: "700" },
  meta: { ...typography.caption, color: colors.textSecondary },
  assets: { minHeight: 88, flexDirection: "row", marginHorizontal: 14, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: approvedLayout.divider },
  assetCard: { flex: 1, flexDirection: "row", gap: 10, alignItems: "center", paddingHorizontal: 6, paddingVertical: 16 },
  assetIcon: { width: 36, height: 36, alignItems: "center", justifyContent: "center" },
  assetLabel: { color: colors.text, fontSize: 14, lineHeight: 19, fontWeight: "700" },
  assetNote: { marginTop: 4, color: colors.textSecondary, fontSize: 12, lineHeight: 17 },
  menu: { marginHorizontal: 14, marginBottom: 10 },
  menuRow: { minHeight: 72, flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 4, paddingVertical: 12 },
  menuBorder: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: approvedLayout.divider },
  menuIcon: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  identityTitle: { fontSize: 12, lineHeight: 18, color: colors.textSecondary, marginTop: 16 },
  menuCopy: { flex: 1, gap: 3 },
  menuLabel: { color: colors.text, fontSize: 14, lineHeight: 19, fontWeight: "800" },
  menuNote: { marginTop: 1, color: colors.textSecondary, fontSize: 12, lineHeight: 17 },
  pressed: { opacity: 0.72 }
});
