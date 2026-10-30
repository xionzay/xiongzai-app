import { useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { createVideoPlayer, VideoView, type VideoPlayer } from "expo-video";
import { colors, radii, spacing, typography } from "@/theme/tokens";

/** One native player per granted access; leaving this subtree releases it immediately. */
export function EvidenceVideo({ url, onFailure }: { url: string; onFailure(): void }) {
  const [player, setPlayer] = useState<VideoPlayer | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let active = true;
    let instance: VideoPlayer;
    try { instance = createVideoPlayer({ uri: url, contentType: "progressive", useCaching: false }); }
    catch {
      // Initialization failures must not crash the page or expose a native URL-bearing error.
      queueMicrotask(() => { if (active) onFailure(); });
      return () => { active = false; };
    }
    instance.staysActiveInBackground = false;
    instance.showNowPlayingNotification = false;
    const subscription = instance.addListener("statusChange", ({ status }) => {
      if (!active) return;
      setLoading(status === "loading");
      // Native error objects may contain signed URLs. Never retain or display them.
      if (status === "error") onFailure();
    });
    queueMicrotask(() => { if (active) { setPlayer(instance); setLoading(instance.status !== "readyToPlay"); } });
    return () => { active = false; subscription.remove(); instance.pause(); instance.release(); };
  }, [url, onFailure]);
  return <View style={styles.container}>
    {player ? <VideoView player={player} style={styles.video} contentFit="contain" nativeControls allowsPictureInPicture={false} allowsVideoFrameAnalysis={false} accessibilityLabel="受控订单连续录屏，使用播放、暂停和进度控件" /> : null}
    {loading ? <View accessibilityLiveRegion="polite" style={styles.loading}><ActivityIndicator color={colors.brand} /><Text style={styles.note}>正在加载录屏…</Text></View> : null}
    <Text style={styles.note}>点击播放；可暂停及拖动进度。返回、切换订单或进入后台会关闭本次预览。</Text>
  </View>;
}
const styles = StyleSheet.create({
  container: { gap: spacing.sm }, video: { width: "100%", aspectRatio: 16 / 9, borderRadius: radii.md, backgroundColor: colors.text },
  loading: { flexDirection: "row", gap: spacing.sm, alignItems: "center" }, note: { ...typography.caption, color: colors.textSecondary },
});
