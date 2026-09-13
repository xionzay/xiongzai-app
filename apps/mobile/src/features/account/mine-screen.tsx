import { useState } from "react";
import { Image, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import type { ReactNode } from "react";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { useAuth } from "@/auth/auth-provider";
import { FileImage } from "@/components/file-image";
import { ChevronRightIcon, TargetIcon } from "@/components/ui-icons";
import { CouponActionIcon, FavoriteMenuIcon, MessageTabIcon, MineTabIcon, SettingsIcon, ShieldIcon } from "@/components/tab-icons";
import { useConversationUnread } from "@/features/chat/chat-api";
import { shouldPollChat } from "@/features/chat/chat-domain";
import { useFavorites } from "@/features/favorites/favorites-api";
import { useAppActivity } from "@/hooks/use-app-activity";
import { useOnlineStatus } from "@/hooks/use-online-status";
import { colors, spacing, typography } from "@/theme/tokens";
import xiongzaiIcon from "../../../assets/xiongzai-icon.png";

const skyBands = Array.from({ length: 64 }, (_, index) => {
  const ratio = index / 63;
  const transition = Math.max(0, Math.min(1, (ratio - 0.27) / 0.12));
  const from = [159, 210, 250];
  const to = [249, 243, 233];
  const channel = (value: number, target: number) => Math.round(value + (target - value) * transition);
  return `rgb(${channel(from[0]!, to[0]!)}, ${channel(from[1]!, to[1]!)}, ${channel(from[2]!, to[2]!)})`;
});

export function MineScreen() {
  const { user, refreshUser } = useAuth();
  const [refreshing, setRefreshing] = useState(false);
  const online = useOnlineStatus();
  const polling = shouldPollChat(useAppActivity(), online);
  const favorites = useFavorites(Boolean(user));
  const unread = useConversationUnread(Boolean(user), polling);
  if (!user) return null;

  const sellerFavorites = favorites.items.filter((item) => item.target_type === "SELLER").length;
  const serviceFavorites = favorites.items.filter((item) => item.target_type === "PRODUCT").length;
  const unreadCount = unread.data?.unread_count ?? 0;

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
            <Text style={styles.pageSubtitle}>个人资料与常用功能</Text>
          </View>
          <Pressable accessibilityRole="button" accessibilityLabel="打开设置" onPress={() => router.push("/settings")} style={styles.settingsButton}>
            <TargetIcon size={28} />
          </Pressable>
        </View>

        <View style={styles.profile}>
          <View style={styles.avatarWrap}>
            {user.profile?.avatar_file_id ? (
              <FileImage fileId={user.profile.avatar_file_id} style={styles.avatar} label="用户头像" />
            ) : (
              <Image source={xiongzaiIcon} style={styles.avatar} accessibilityLabel="熊崽默认头像" />
            )}
            <View style={styles.onlineDot} accessibilityLabel="当前在线" />
          </View>
          <View style={styles.profileCopy}>
            <Text style={styles.nickname} numberOfLines={1}>{user.profile?.nickname ?? "熊崽用户"}</Text>
            <Text style={styles.meta}>ID：{user.profile?.public_user_no ?? "待生成"}</Text>
          </View>
        </View>

        <View style={styles.assets}>
          <AssetCard icon={<FavoriteMenuIcon color="#FFB319" size={62} />} label="我的收藏" note={`陪玩 ${sellerFavorites} · 服务 ${serviceFavorites}`} onPress={() => router.push("/favorites")} />
          <AssetCard icon={<CouponActionIcon color="#2F8FE5" size={62} />} label="优惠券" note="0 张可用" onPress={() => router.push("/coupons")} />
        </View>

        <View style={styles.menu}>
          <MenuRow icon={<MineTabIcon color="#171A21" size={42} />} label="编辑个人资料" note="头像、昵称" onPress={() => router.push("/settings/profile")} />
          <MenuRow icon={<MessageTabIcon color="#171A21" size={42} />} label="文字消息" note={`${unreadCount} 条未读`} onPress={() => router.push("/(buyer-tabs)/messages")} />
          <MenuRow icon={<ShieldIcon color="#171A21" size={42} />} label="平台规则与售后" note="交易保障" onPress={() => router.push("/rules")} />
          <MenuRow icon={<SettingsIcon color="#171A21" size={42} />} label="设置与隐私" note="陪玩身份申请入口" last onPress={() => router.push("/settings")} />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function SkyBackdrop() {
  return (
    <View pointerEvents="none" style={styles.backdrop}>
      {skyBands.map((color, index) => <View key={`${index}-${color}`} style={[styles.skyBand, { backgroundColor: color }]} />)}
    </View>
  );
}

function AssetCard({ icon, label, note, onPress }: { icon: ReactNode; label: string; note: string; onPress(): void }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`${label}，${note}`} onPress={onPress} style={({ pressed }) => [styles.assetCard, pressed && styles.pressed]}>
      <View style={styles.assetIcon}>{icon}</View>
      <Text style={styles.assetLabel}>{label}</Text>
      <Text style={styles.assetNote}>{note}</Text>
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
  header: { minHeight: 76, flexDirection: "row", alignItems: "center", gap: spacing.md, paddingHorizontal: 15, paddingBottom: 10 },
  headerCopy: { flex: 1, gap: 3 },
  pageTitle: { ...typography.pageTitle, color: colors.text },
  pageSubtitle: { ...typography.caption, color: colors.textSecondary },
  settingsButton: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  profile: { height: 110, flexDirection: "row", alignItems: "center", gap: 10, marginHorizontal: 14, marginBottom: 10, padding: 16, borderWidth: 1, borderColor: "rgba(255,255,255,0.92)", borderRadius: 19, backgroundColor: "rgba(255,252,245,0.94)", shadowColor: "#4B3920", shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.11, shadowRadius: 24, elevation: 5 },
  avatarWrap: { position: "relative" },
  avatar: { width: 76, height: 76, borderRadius: 38, backgroundColor: colors.surfaceBlue },
  onlineDot: { position: "absolute", right: 1, bottom: 4, width: 15, height: 15, borderWidth: 3, borderColor: colors.surfaceCard, borderRadius: 8, backgroundColor: colors.success },
  profileCopy: { flex: 1, gap: 8 },
  nickname: { ...typography.sectionTitle, color: colors.text, fontWeight: "900" },
  meta: { ...typography.body, color: colors.textSecondary },
  assets: { height: 137, flexDirection: "row", gap: 10, marginHorizontal: 12, marginTop: 4, marginBottom: 11 },
  assetCard: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 8, paddingVertical: 13, borderWidth: 1, borderColor: colors.border, borderRadius: 15, backgroundColor: "#FFFDF8", shadowColor: "#4B3920", shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.11, shadowRadius: 24, elevation: 5 },
  assetIcon: { width: 62, height: 62, alignItems: "center", justifyContent: "center" },
  assetLabel: { color: colors.text, fontSize: 14, lineHeight: 19, fontWeight: "800", textAlign: "center" },
  assetNote: { marginTop: 4, color: colors.textSecondary, fontSize: 12, lineHeight: 17, textAlign: "center" },
  menu: { overflow: "hidden", marginHorizontal: 12, marginBottom: 10, paddingHorizontal: 12, borderWidth: 1, borderColor: colors.border, borderRadius: 17, backgroundColor: "#FFFFFF", shadowColor: "#4B3920", shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.11, shadowRadius: 24, elevation: 5 },
  menuRow: { height: 67, flexDirection: "row", alignItems: "center", gap: 11, paddingHorizontal: 6 },
  menuBorder: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  menuIcon: { width: 42, height: 42, alignItems: "center", justifyContent: "center" },
  menuCopy: { flex: 1, gap: 3 },
  menuLabel: { color: colors.text, fontSize: 14, lineHeight: 19, fontWeight: "800" },
  menuNote: { marginTop: 1, color: colors.textSecondary, fontSize: 12, lineHeight: 17 },
  pressed: { opacity: 0.72 }
});
