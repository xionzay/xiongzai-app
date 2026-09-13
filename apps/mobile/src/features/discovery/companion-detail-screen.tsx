import { useEffect, useRef, useState } from "react";
import { ChevronLeftIcon } from "@/components/ui-icons";
import { router, useLocalSearchParams } from "expo-router";
import { Pressable, RefreshControl, ScrollView, Share, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { ApiClientError } from "@/api/api-error";
import { useAuth } from "@/auth/auth-provider";
import { AppScreen } from "@/components/app-screen";
import { FileImage } from "@/components/file-image";
import { NoticeBanner } from "@/components/notice-banner";
import { PageHeader } from "@/components/page-header";
import { StateView } from "@/components/state-view";
import { createConsultation } from "@/features/chat/chat-api";
import { getCompanionVoiceAccess, useCompanionDetail } from "@/features/discovery/discovery-api";
import { VoiceAudioControls } from "@/features/files/voice-audio-controls";
import { shouldExpireAccess } from "@/features/files/voice-native-domain";
import { FavoriteButton } from "@/features/favorites/favorite-button";
import { ServiceCard } from "@/features/home/catalog-card";
import { colors } from "@/theme/tokens";
import { useOnlineStatus } from "@/hooks/use-online-status";
import { MessageActionIcon } from "@/components/tab-icons";

const pageBands = Array.from({ length: 64 }, (_, index) => {
  const ratio = index / 63;
  const from = ratio <= 0.56 ? [255, 250, 240] : [255, 253, 247];
  const to = ratio <= 0.56 ? [255, 253, 247] : [248, 241, 231];
  const progress = ratio <= 0.56 ? ratio / 0.56 : (ratio - 0.56) / 0.44;
  const channel = (value: number, target: number) => Math.round(value + (target - value) * progress);
  return `rgb(${channel(from[0]!, to[0]!)}, ${channel(from[1]!, to[1]!)}, ${channel(from[2]!, to[2]!)})`;
});

export function CompanionDetailScreen({ preview = false, sellerId }: { preview?: boolean; sellerId?: string } = {}) {
  const params = useLocalSearchParams<{ id: string }>();
  const id = sellerId ?? params.id ?? "";
  const { status } = useAuth();
  const online = useOnlineStatus();
  const [notice, setNotice] = useState<string | null>(null);
  const [voiceAccess, setVoiceAccess] = useState<{ sellerId: string; url: string } | null>(null);
  const [voiceLoading, setVoiceLoading] = useState(false);
  const [consulting, setConsulting] = useState(false);
  const voiceRequest = useRef<AbortController | null>(null);
  const voiceExpiryTimer = useRef<ReturnType<typeof globalThis.setTimeout> | null>(null);

  useEffect(() => {
    if (voiceExpiryTimer.current) globalThis.clearTimeout(voiceExpiryTimer.current);
    voiceExpiryTimer.current = null;
    return () => {
      voiceRequest.current?.abort();
      if (voiceExpiryTimer.current) globalThis.clearTimeout(voiceExpiryTimer.current);
    };
  }, [id]);

  const voiceUrl = voiceAccess?.sellerId === id ? voiceAccess.url : null;
  const query = useCompanionDetail(id, status !== "booting");
  if (status === "booting" || query.isPending) return <AppScreen><PageHeader title="陪玩主页" /><StateView kind="loading" /></AppScreen>;
  if (!online) return <AppScreen><PageHeader title="陪玩主页" /><StateView kind="offline" onRetry={() => void query.refetch()} /></AppScreen>;
  if (query.isError) { const unavailable = query.error instanceof ApiClientError && [403, 404].includes(query.error.status); return <AppScreen><PageHeader title="陪玩主页" /><StateView kind="error" title={unavailable ? "陪玩主页不可用" : undefined} message={unavailable ? "资源不存在、已删除或当前无权访问" : undefined} onRetry={() => void query.refetch()} /></AppScreen>; }
  const item = query.data;

  const loadVoice = async () => {
    voiceRequest.current?.abort();
    if (voiceExpiryTimer.current) globalThis.clearTimeout(voiceExpiryTimer.current);
    voiceExpiryTimer.current = null;
    const controller = new AbortController(); voiceRequest.current = controller; setVoiceLoading(true); setNotice(null); setVoiceAccess(null);
    try {
      const access = await getCompanionVoiceAccess(item.id, controller.signal);
      if (controller.signal.aborted) return;
      setVoiceAccess({ sellerId: item.id, url: access.access.url });
      if (access.access.expires_at) {
        const delay = Math.min(shouldExpireAccess(access.access.expires_at) ?? 0, 2_147_483_647);
        voiceExpiryTimer.current = globalThis.setTimeout(() => !controller.signal.aborted && setVoiceAccess(null), delay);
      }
    } catch (error) {
      if (!controller.signal.aborted) setNotice(error instanceof ApiClientError && error.status === 404 ? "该陪玩暂无可试听的声音名片。" : "声音名片临时地址获取失败，请稍后重试。");
    } finally {
      if (voiceRequest.current === controller) { voiceRequest.current = null; setVoiceLoading(false); }
    }
  };

  const consult = async () => {
    if (status !== "authenticated") {
      router.push({ pathname: "/(auth)/required", params: { returnTo: `/companions/${item.id}`, action: "咨询陪玩" } });
      return;
    }
    const service = item.services[0];
    if (!service) { setNotice("该陪玩暂时没有可咨询的在售服务。"); return; }
    setConsulting(true); setNotice(null);
    try { const conversation = await createConsultation(service.id); router.push(`/conversations/${conversation.id}`); }
    catch { setNotice("暂时无法创建咨询会话，请稍后重试。"); }
    finally { setConsulting(false); }
  };

  const tags = [item.preferred_mode, item.play_style].filter((value): value is string => Boolean(value));
  return (
    <SafeAreaView style={styles.safe} edges={["top", "left", "right"]}>
      <CompanionBackdrop />
      <ScrollView contentContainerStyle={[styles.content, preview && styles.previewContent]} refreshControl={<RefreshControl refreshing={query.isRefetching} onRefresh={() => void query.refetch()} tintColor={colors.accent} />}>
        <View style={styles.header}><Pressable accessibilityRole="button" accessibilityLabel="返回" onPress={() => router.back()} style={[styles.headerButton, styles.backButton]}><ChevronLeftIcon size={28} /></Pressable><Text style={styles.headerTitle}>陪玩主页</Text><Pressable accessibilityRole="button" accessibilityLabel="分享陪玩主页" onPress={() => void Share.share({ message: `熊崽电竞陪玩：${item.seller_nickname}` })} style={styles.headerButton}><Text style={styles.share}>↗</Text></Pressable></View>
        {preview ? <NoticeBanner message="这是买家看到的公开主页效果；预览模式不会显示收藏或购买操作。" /> : null}
        {notice ? <NoticeBanner tone="danger" message={notice} /> : null}
        <View style={styles.hero}>
          <FileImage fileId={item.cover_file_id ?? item.seller_avatar_file_id} style={styles.heroImage} label={`${item.seller_nickname}封面`} />
          <Text style={[styles.online, !item.accepting_orders && styles.offline]}>{item.accepting_orders ? "在线接单" : "暂停接单"}</Text>
          <View style={styles.identity}><Text style={styles.nickname}>{item.seller_nickname}</Text><Text style={styles.rank}>{item.game_rank ?? "和平精英陪玩"}</Text>{tags.length ? <View style={styles.tags}>{tags.map((tag) => <Text key={tag} style={styles.tag}>{tag}</Text>)}</View> : null}</View>
        </View>

        <View style={styles.stats}><Stat value={item.rating_avg} label="综合评分" /><Stat value={item.completed_order_count} label="完成订单" /><Stat value={item.services.length} label="在售服务" /><Stat value={item.favorite_count} label="被收藏" last /></View>

        {item.voice_file_id ? <><Pressable accessibilityRole="button" accessibilityLabel={voiceLoading ? "正在申请试听地址" : "试听声音名片"} disabled={voiceLoading} onPress={() => void loadVoice()} style={({ pressed }) => [styles.voiceCard, pressed && styles.pressed]}><View style={styles.voiceCopy}><Text style={styles.voiceTitle}>声音名片 · {item.voice_duration_ms ? `${Math.round(item.voice_duration_ms / 1_000)} 秒` : "10–30 秒"}</Text></View><View style={styles.play}><Text style={styles.playText}>{voiceLoading ? "…" : "▶"}</Text></View><View style={styles.wave}>{Array.from({ length: 18 }, (_, index) => <View key={index} style={[styles.waveBar, { height: 8 + (index % 5) * 3 }]} />)}</View></Pressable>{voiceUrl ? <View style={styles.voiceControls}><VoiceAudioControls url={voiceUrl} label={`${item.seller_nickname}声音名片`} /></View> : null}</> : null}

        <View style={styles.panel}><SectionTitle title="关于我" note="主页介绍" /><Text style={styles.introduction}>{item.introduction ?? "该陪玩暂未填写介绍"}</Text><View style={styles.gameInfo}><View style={styles.gameCopy}><Text style={styles.gameTitle}>和平精英资料</Text><Text style={styles.gameMeta}>{[item.game_rank, item.preferred_mode, item.play_style].filter(Boolean).join(" · ") || "暂未填写游戏资料"}</Text></View><Text style={styles.verified}>已认证</Text></View></View>

        <View style={styles.section}><SectionTitle title="全部服务" note={`${item.services.length} 个服务在售`} />{item.services.length ? <View style={styles.serviceGrid}>{item.services.map((service) => <View key={service.id} style={styles.serviceItem}><ServiceCard item={service} pressable={!preview} grid /></View>)}</View> : <Text style={styles.empty}>暂无在售服务</Text>}</View>

        <View style={styles.panel}><SectionTitle title="买家评价" note={`${item.review_count} 条真实订单评价`} action="全部 ›" onAction={() => router.push(`/companions/${item.id}/reviews`)} /><Text style={styles.reviewText}>{item.review_count > 0 ? `综合评分 ★ ${item.rating_avg}，评价内容均来自平台真实订单。` : "完成订单并提交评价后会显示在这里。"}</Text></View>
      </ScrollView>
      {!preview ? <SafeAreaView edges={["bottom"]} style={styles.bottomSafe}><View style={styles.actions}><FavoriteButton type="SELLER" id={item.id} returnTo={`/companions/${item.id}`} onError={setNotice} appearance="companion-action" /><Pressable accessibilityRole="button" disabled={consulting} onPress={() => void consult()} style={styles.consult}><MessageActionIcon size={34} /><Text style={styles.consultLabel}>{consulting ? "正在连接…" : "咨询陪玩"}</Text></Pressable></View></SafeAreaView> : null}
    </SafeAreaView>
  );
}

function CompanionBackdrop() { return <View pointerEvents="none" style={styles.backdrop}>{pageBands.map((color, index) => <View key={`${index}-${color}`} style={[styles.band, { backgroundColor: color }]} />)}</View>; }

function Stat({ value, label, last = false }: { value: string | number; label: string; last?: boolean }) { return <View style={[styles.stat, !last && styles.statBorder]}><Text style={styles.statValue}>{value}</Text><Text style={styles.statLabel}>{label}</Text></View>; }

function SectionTitle({ title, note, action, onAction }: { title: string; note?: string; action?: string; onAction?: () => void }) { return <View style={styles.sectionHead}><View style={styles.sectionCopy}><Text style={styles.sectionTitle}>{title}</Text>{note ? <Text style={styles.sectionNote}>{note}</Text> : null}</View>{action && onAction ? <Pressable accessibilityRole="button" onPress={onAction} style={styles.sectionAction}><Text style={styles.sectionActionText}>{action}</Text></Pressable> : null}</View>; }

const softShadow = { shadowColor: "#4B3920", shadowOffset: { width: 0, height: 5 }, shadowOpacity: 0.08, shadowRadius: 14, elevation: 3 } as const;

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#FFFAF0" },
  bottomSafe: { backgroundColor: "#FFFCF5" },
  backdrop: { position: "absolute", top: 0, bottom: 0, left: 0, right: 0 },
  band: { flex: 1 },
  content: { paddingBottom: 20 },
  previewContent: { paddingBottom: 32 },
  header: { height: 67, flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 9, paddingBottom: 10 },
  headerButton: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  backButton: { width: 48, height: 48, borderWidth: 1, borderColor: "rgba(102,92,76,0.1)", borderRadius: 16, backgroundColor: "rgba(255,255,255,0.8)", shadowColor: "#4C3D28", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.08, shadowRadius: 10, elevation: 2 },
  back: { color: colors.text, fontSize: 38, lineHeight: 40 },
  share: { color: colors.text, fontSize: 25, lineHeight: 30, fontWeight: "700" },
  headerTitle: { flex: 1, color: colors.text, fontSize: 25, lineHeight: 31, fontWeight: "800", textAlign: "center" },
  hero: { position: "relative", aspectRatio: 1, overflow: "hidden", marginHorizontal: 13, marginBottom: 11, borderRadius: 23, backgroundColor: "#A9C9E8", shadowColor: "#4B3920", shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.11, shadowRadius: 24, elevation: 5 },
  heroImage: { width: "100%", height: "100%" },
  online: { position: "absolute", left: 11, top: 13, overflow: "hidden", paddingHorizontal: 9, paddingVertical: 6, borderRadius: 9, backgroundColor: colors.lime, color: "#2D3E0B", fontSize: 12, fontWeight: "900" },
  offline: { backgroundColor: "#E5E5E5", color: "#666B75" },
  identity: { position: "absolute", left: 18, right: 18, bottom: 16 },
  nickname: { color: colors.white, fontSize: 28, lineHeight: 34, fontWeight: "900" },
  rank: { marginTop: 4, marginBottom: 8, color: colors.white, fontSize: 12 },
  tags: { flexDirection: "row", gap: 6 },
  tag: { overflow: "hidden", paddingHorizontal: 7, paddingVertical: 4, borderRadius: 7, backgroundColor: "rgba(255,255,255,0.88)", color: "#20252D", fontSize: 12 },
  stats: { flexDirection: "row", marginHorizontal: 12, marginBottom: 10, paddingVertical: 12, borderWidth: 1, borderColor: "rgba(62,57,47,0.11)", borderRadius: 16, backgroundColor: "#FFFDF8", ...softShadow },
  stat: { flex: 1, alignItems: "center" },
  statBorder: { borderRightWidth: StyleSheet.hairlineWidth, borderRightColor: "rgba(62,57,47,0.11)" },
  statValue: { color: colors.text, fontSize: 14, fontWeight: "800" },
  statLabel: { marginTop: 2, color: "#7B7D83", fontSize: 12 },
  voiceCard: { minHeight: 74, flexDirection: "row", alignItems: "center", gap: 9, marginHorizontal: 12, marginBottom: 10, paddingHorizontal: 13, paddingVertical: 11, borderWidth: 1, borderColor: "rgba(62,57,47,0.11)", borderRadius: 17, backgroundColor: "#FFFDF8", ...softShadow },
  voiceCopy: { minWidth: 120 },
  voiceTitle: { color: colors.text, fontSize: 14, lineHeight: 19, fontWeight: "800" },
  play: { width: 44, height: 44, alignItems: "center", justifyContent: "center", borderRadius: 22, backgroundColor: "#7D62F2", shadowColor: "#7754E7", shadowOffset: { width: 0, height: 5 }, shadowOpacity: 0.25, shadowRadius: 10, elevation: 3 },
  playText: { color: colors.white, fontSize: 14, fontWeight: "900" },
  wave: { flex: 1, height: 30, flexDirection: "row", alignItems: "center", gap: 3, overflow: "hidden" },
  waveBar: { width: 3, borderRadius: 2, backgroundColor: "#B9B8B5" },
  voiceControls: { marginHorizontal: 12, marginTop: -3, marginBottom: 10, padding: 12, borderRadius: 15, backgroundColor: "#FFFDF8" },
  panel: { marginHorizontal: 12, marginBottom: 10, padding: 13, borderWidth: 1, borderColor: "rgba(62,57,47,0.11)", borderRadius: 17, backgroundColor: "rgba(255,253,248,0.96)", ...softShadow },
  section: { marginHorizontal: 12, marginBottom: 11, paddingHorizontal: 12, paddingVertical: 13, borderWidth: 1, borderColor: "rgba(62,57,47,0.11)", borderRadius: 18, backgroundColor: "rgba(255,253,248,0.94)", ...softShadow },
  sectionHead: { minHeight: 38, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  sectionCopy: { flex: 1, flexDirection: "row", alignItems: "baseline", gap: 8 },
  sectionTitle: { color: colors.text, fontSize: 16, fontWeight: "800" },
  sectionNote: { flexShrink: 1, color: "#7B7D83", fontSize: 12 },
  sectionAction: { minHeight: 44, justifyContent: "center", paddingHorizontal: 6 },
  sectionActionText: { color: "#767A82", fontSize: 12, fontWeight: "800" },
  introduction: { marginVertical: 11, color: "#606267", fontSize: 13, lineHeight: 22 },
  gameInfo: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10, padding: 10, borderRadius: 12, backgroundColor: "#F5F1E9" },
  gameCopy: { flex: 1 },
  gameTitle: { color: colors.text, fontSize: 13, fontWeight: "800" },
  gameMeta: { marginTop: 5, color: "#7B7D83", fontSize: 12 },
  verified: { overflow: "hidden", paddingHorizontal: 7, paddingVertical: 4, borderRadius: 7, backgroundColor: "#E9F8C9", color: "#587219", fontSize: 12 },
  serviceGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginTop: 11 },
  serviceItem: { width: "48.4%" },
  empty: { paddingVertical: 24, color: "#7B7D83", fontSize: 12, textAlign: "center" },
  reviewText: { marginTop: 11, color: colors.text, fontSize: 13, lineHeight: 21 },
  actions: { minHeight: 72, flexDirection: "row", alignItems: "center", gap: 9, paddingHorizontal: 12, paddingTop: 9, paddingBottom: 11, borderTopWidth: 1, borderTopColor: "rgba(62,57,47,0.11)", backgroundColor: "rgba(255,252,245,0.97)", shadowColor: "#4B3A23", shadowOffset: { width: 0, height: -8 }, shadowOpacity: 0.06, shadowRadius: 24, elevation: 6 },
  consult: { flex: 1, minHeight: 49, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 9, paddingHorizontal: 10 },
  consultLabel: { minHeight: 34, color: "#2F8FE5", fontSize: 13, lineHeight: 34, fontWeight: "900" },
  pressed: { opacity: 0.76 }
});
