import { useEffect, useRef, useState } from "react";
import { router, useLocalSearchParams } from "expo-router";
import { Pressable, StyleSheet, Text } from "react-native";
import { ApiClientError } from "@/api/api-error";
import { useAuth } from "@/auth/auth-provider";
import { AppScreen } from "@/components/app-screen";
import { PageHeader } from "@/components/page-header";
import { StateView } from "@/components/state-view";
import { createConsultation } from "@/features/chat/chat-api";
import { getCompanionVoiceAccess, useCompanionDetail } from "@/features/discovery/discovery-api";
import { VoiceAudioControls } from "@/features/files/voice-audio-controls";
import { shouldExpireAccess } from "@/features/files/voice-native-domain";
import { FavoriteButton } from "@/features/favorites/favorite-button";
import { colors } from "@/theme/tokens";
import { useOnlineStatus } from "@/hooks/use-online-status";
import { ApprovedIllustration } from "@/components/approved-illustration";
import { StorefrontView } from "./storefront-view";


export function CompanionDetailScreen({ preview = false, sellerId }: { preview?: boolean; sellerId?: string } = {}) {
  const params = useLocalSearchParams<{ id: string }>();
  const id = sellerId ?? params.id ?? "";
  const { status, user } = useAuth();
  const online = useOnlineStatus();
  const [notice, setNotice] = useState<string | null>(null);
  const [voiceAccess, setVoiceAccess] = useState<{ sellerId: string; url: string } | null>(null);
  const [voiceLoading, setVoiceLoading] = useState(false);
  const [consulting, setConsulting] = useState(false);
  const consultation = useRef(false);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
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
      if (voiceRequest.current === controller && !controller.signal.aborted) { voiceRequest.current = null; setVoiceLoading(false); }
    }
  };

  const consult = async () => {
    if (consultation.current || preview) return;
    if (status !== "authenticated") {
      router.push({ pathname: "/(auth)/required", params: { returnTo: `/companions/${item.id}`, action: "咨询陪玩" } });
      return;
    }
    const service = item.services.find(service => service.status === "ON_SALE");
    if (!service) { setNotice("该陪玩暂时没有可咨询的在售服务。"); return; }
    consultation.current = true;
    setConsulting(true); setNotice(null);
    try { const conversation = await createConsultation(service.id); if (mounted.current) router.push(`/conversations/${conversation.id}`); }
    catch { if (mounted.current) setNotice("暂时无法创建咨询会话，请稍后重试。"); }
    finally { consultation.current = false; if (mounted.current) setConsulting(false); }
  };

  return <StorefrontView key={item.id} item={item} owner={user?.id === item.user_id} preview={preview} notice={notice} refreshing={query.isRefetching} onRefresh={() => void query.refetch()} consulting={consulting} onContact={() => void consult()}
    favorite={<FavoriteButton type="SELLER" id={item.id} returnTo={`/companions/${item.id}`} onError={setNotice} appearance="storefront" />}
    voice={item.voice_file_id ? <><Pressable accessibilityRole="button" accessibilityLabel={voiceLoading ? "正在申请试听地址" : "试听声音名片"} disabled={voiceLoading} onPress={() => void loadVoice()} style={voiceStyles.button}><ApprovedIllustration kind="service" size={24} /><Text style={voiceStyles.label}>{voiceLoading ? "正在读取…" : "试听声音"} · {item.voice_duration_ms ? Math.round(item.voice_duration_ms / 1000) + " 秒" : "10–30 秒"}</Text></Pressable>{voiceUrl ? <VoiceAudioControls url={voiceUrl} label={`${item.seller_nickname}声音名片`} /> : null}</> : null}
  />;
}
const voiceStyles = StyleSheet.create({ button: { minHeight: 44, flexDirection: "row", alignItems: "center", gap: 8, marginTop: 8 }, label: { fontSize: 13, color: colors.brand } });
