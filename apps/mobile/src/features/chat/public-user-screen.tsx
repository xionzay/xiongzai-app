import { BrandBackdrop } from "@/components/brand-backdrop";
import { JellyIcon } from "../../components/jelly-icon";
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { ChevronLeftIcon } from "@/components/ui-icons";
import { router, useLocalSearchParams } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuth } from "@/auth/auth-provider";
import { AppScreen } from "@/components/app-screen";
import { FileImage } from "@/components/file-image";
import { PageHeader } from "@/components/page-header";
import { StateView } from "@/components/state-view";
import { usePublicUser } from "@/features/chat/chat-api";
import { colors } from "@/theme/tokens";
import type { PublicUserApiView } from "@/types/api";



export function PublicUserScreen() {
  const { id = "" } = useLocalSearchParams<{ id: string }>();
  const { status } = useAuth();
  const query = usePublicUser(id);

  if (query.isPending) return <AppScreen><PageHeader title="买家主页" /><StateView kind="loading" /></AppScreen>;
  if (!query.data || query.isError) return <AppScreen><PageHeader title="买家主页" /><StateView kind="error" title="主页不可访问" message="用户不存在、账号不可用或未公开主页" onRetry={() => void query.refetch()} /></AppScreen>;

  const user = query.data;
  const publicReviews = user.public_reviews ?? [];
  const complain = () => {
    if (status !== "authenticated") {
      router.push({ pathname: "/(auth)/required", params: { action: "投诉用户", returnTo: `/users/${user.id}` } });
      return;
    }
    router.push({ pathname: "/complaints/new", params: { targetType: "USER", targetId: user.id } });
  };

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom", "left", "right"]}>
      <ProfileBackdrop />
      <ScrollView contentContainerStyle={styles.content} refreshControl={<RefreshControl refreshing={query.isRefetching} onRefresh={() => void query.refetch()} tintColor={colors.brand} />}>
        <View style={styles.header}>
          <Pressable accessibilityRole="button" accessibilityLabel="返回" onPress={() => router.back()} style={({ pressed }) => [styles.back, pressed && styles.pressed]}><ChevronLeftIcon size={23} /></Pressable>
          <View style={styles.headerCopy}><Text style={styles.pageTitle}>买家主页</Text><Text style={styles.pageSubtitle}>其他用户可见的公开资料</Text></View>
        </View>

        <View style={styles.profileCard}>
          <View style={styles.avatarWrap}>
            <FileImage fileId={user.avatar_file_id} style={styles.avatar} label={`${user.nickname}头像`} />
            {user.online_status ? <View accessibilityLabel={user.online_status === "ONLINE" ? "在线" : "离线"} style={[styles.onlineDot, user.online_status === "OFFLINE" && styles.offlineDot]} /> : null}
          </View>
          <View style={styles.profileCopy}>
            <Text style={styles.nickname}>{user.nickname}</Text>
            <Text style={styles.userNo}>ID：{user.public_user_no}</Text>
            <Text style={styles.bio}>{user.bio || "这位玩家还没有填写公开简介"}</Text>
          </View>
        </View>

        <View style={styles.statsCard}>
          <ProfileStat value={String(user.following_count ?? 0)} label="关注" />
          <View style={styles.statDivider} />
          <ProfileStat value={String(user.public_review_count ?? 0)} label="公开评价" />
          <View style={styles.statDivider} />
          <ProfileStat value={joinedDays(user.created_at)} label="加入平台" suffix="天" />
        </View>

        <View style={styles.reviewSection}>
          <View style={styles.sectionHeading}><Text style={styles.sectionTitle}>公开评价</Text><Text style={styles.sectionMeta}>仅展示已公开内容</Text></View>
          {publicReviews.length > 0 ? publicReviews.map((review) => <PublicReview key={review.id} review={review} />) : <View style={styles.emptyReview}><Text style={styles.emptyReviewTitle}>暂无公开评价</Text><Text style={styles.emptyReviewText}>该用户公开发布的评价会显示在这里</Text></View>}
        </View>

        <Pressable accessibilityRole="button" accessibilityLabel={`投诉用户${user.nickname}`} onPress={complain} style={({ pressed }) => [styles.report, pressed && styles.pressed]}><Text style={styles.reportText}>投诉该用户</Text></Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

function ProfileBackdrop() { return <BrandBackdrop />; }

function ProfileStat({ value, label, suffix }: { value: string; label: string; suffix?: string }) {
  return <View style={styles.stat}><Text style={styles.statValue}>{value}{suffix ? <Text style={styles.statSuffix}> {suffix}</Text> : null}</Text><Text style={styles.statLabel}>{label}</Text></View>;
}

function PublicReview({ review }: { review: PublicUserApiView["public_reviews"][number] }) {
  const rating = Math.max(0, Math.min(5, review.rating));
  return (
    <View style={styles.reviewCard}>
      <Text style={styles.reviewTitle}><Text style={styles.stars}>{Array.from({ length: rating }, (_, index) => <JellyIcon key={`star-${index}`} kind="star" />)}{Array.from({ length: 5 - rating }, (_, index) => <JellyIcon key={`outline-${index}`} kind="outline" />)}</Text> {ratingLabel(rating)}</Text>
      <Text style={styles.reviewBody}>{review.content || "该用户只留下了星级评价"}</Text>
      <Text style={styles.reviewContext}>评价了 {review.seller_name} 的{review.service_title}</Text>
    </View>
  );
}

function ratingLabel(rating: number) {
  if (rating === 5) return "非常满意";
  if (rating === 4) return "体验不错";
  if (rating === 3) return "体验一般";
  if (rating === 2) return "有待改善";
  return "体验不佳";
}

function joinedDays(createdAt: string) {
  const timestamp = Date.parse(createdAt);
  if (!Number.isFinite(timestamp)) return "—";
  return String(Math.max(1, Math.ceil((Date.now() - timestamp) / 86_400_000)));
}

const softShadow = { shadowColor: "#4B3920", shadowOffset: { width: 0, height: 5 }, shadowOpacity: 0.08, shadowRadius: 14, elevation: 3 } as const;

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.canvas },
  backdrop: { position: "absolute", top: 0, right: 0, bottom: 0, left: 0 },
  band: { flex: 1 },
  content: { flexGrow: 1, gap: 11, paddingHorizontal: 12, paddingBottom: 24 },
  header: { flexDirection: "row", alignItems: "center", minHeight: 60, paddingBottom: 4, height: undefined },
  back: { alignItems: "center", justifyContent: "center", ...softShadow, backgroundColor: "transparent", borderWidth: 0, borderLeftWidth: 0, borderRightWidth: 0, borderTopWidth: 0, borderBottomWidth: 0, borderColor: colors.divider, borderBottomColor: colors.divider, borderRadius: 0, shadowOpacity: 0, elevation: 0, width: 48, height: undefined, minHeight: 48 },
  backText: { marginTop: -3, color: colors.text, fontSize: 34, lineHeight: 38, fontWeight: "500" },
  headerCopy: { marginLeft: 0, minWidth: 0 },
  pageTitle: { color: colors.text, fontSize: 19, lineHeight: 26, fontWeight: "600", textAlign: "center" },
  pageSubtitle: { marginTop: 3, fontSize: 12, lineHeight: 16, textAlign: "center", color: colors.textSecondary },
  profileCard: { minHeight: 110, flexDirection: "row", alignItems: "center", gap: 14, paddingHorizontal: 16, paddingVertical: 14, ...softShadow, backgroundColor: "transparent", borderWidth: 0, borderLeftWidth: 0, borderRightWidth: 0, borderTopWidth: 0, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: colors.divider, borderBottomColor: colors.divider, borderRadius: 0, shadowOpacity: 0, elevation: 0 },
  avatarWrap: { position: "relative" },
  avatar: { width: 82, height: 82, borderWidth: 3, borderColor: "#FFFFFF", borderRadius: 41 },
  onlineDot: { position: "absolute", right: 2, bottom: 5, width: 16, height: 16, borderWidth: 3, borderColor: "#FFFFFF", borderRadius: 8, backgroundColor: "#45C86B" },
  offlineDot: { backgroundColor: "#AAA59D" },
  profileCopy: { flex: 1, minWidth: 0 },
  nickname: { color: colors.text, fontSize: 18, lineHeight: 23, fontWeight: "800" },
  userNo: { marginTop: 5, color: colors.textSecondary, fontSize: 12, lineHeight: 16 },
  bio: { marginTop: 9, color: colors.text, fontSize: 12, lineHeight: 16 },
  statsCard: { minHeight: 70, flexDirection: "row", alignItems: "center", paddingVertical: 10, ...softShadow, backgroundColor: "transparent", borderWidth: 0, borderLeftWidth: 0, borderRightWidth: 0, borderTopWidth: 0, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: colors.divider, borderBottomColor: colors.divider, borderRadius: 0, shadowOpacity: 0, elevation: 0 },
  stat: { flex: 1, alignItems: "center", justifyContent: "center" },
  statValue: { color: colors.text, fontSize: 15, lineHeight: 20, fontWeight: "900" },
  statSuffix: { fontSize: 12, fontWeight: "800" },
  statLabel: { marginTop: 4, color: colors.textSecondary, fontSize: 12, lineHeight: 16 },
  statDivider: { width: StyleSheet.hairlineWidth, height: 35, backgroundColor: "rgba(62,57,47,0.14)" },
  reviewSection: { padding: 13, borderWidth: 1, borderColor: "rgba(62,57,47,0.10)", borderRadius: 18, backgroundColor: "rgba(255,253,248,0.94)", ...softShadow },
  sectionHeading: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 11 },
  sectionTitle: { color: colors.text, fontSize: 16, lineHeight: 21, fontWeight: "900" },
  sectionMeta: { color: colors.textSecondary, fontSize: 12 },
  reviewCard: { marginTop: 7, padding: 13, backgroundColor: "transparent", borderWidth: 0, borderLeftWidth: 0, borderRightWidth: 0, borderTopWidth: 0, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: colors.divider, borderBottomColor: colors.divider, borderRadius: 0, shadowOpacity: 0, elevation: 0 },
  reviewTitle: { color: colors.text, fontSize: 12, lineHeight: 16, fontWeight: "800" },
  stars: { color: "#121212", letterSpacing: 1 },
  reviewBody: { marginTop: 8, color: colors.text, fontSize: 12, lineHeight: 16 },
  reviewContext: { marginTop: 10, color: colors.textSecondary, fontSize: 12, lineHeight: 16 },
  emptyReview: { alignItems: "center", paddingVertical: 22, borderRadius: 13, backgroundColor: "#F6F1E9" },
  emptyReviewTitle: { color: colors.text, fontSize: 12, fontWeight: "800" },
  emptyReviewText: { marginTop: 6, color: colors.textSecondary, fontSize: 12 },
  report: { alignSelf: "center", minWidth: 100, alignItems: "center", paddingHorizontal: 14, paddingVertical: 10 },
  reportText: { color: colors.textSecondary, fontSize: 12, textDecorationLine: "underline" },
  pressed: { opacity: 0.72 },
});
