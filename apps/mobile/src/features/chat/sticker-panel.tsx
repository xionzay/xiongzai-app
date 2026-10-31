import { useEffect, useState } from "react";
import { AccessibilityInfo, Image, Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { bearStickers, getBearSticker } from "@xiongzai/contracts/bear-stickers";
import type { ConversationApiView } from "@/types/api";
import { useAppActivity } from "@/hooks/use-app-activity";
import { colors } from "@/theme/tokens";
import { stickerSources } from "./sticker-assets";
import { stickerPosters } from "./sticker-posters";
import { ChatControlIcon } from "@/components/chat-control-icon";

export function StickerPicture({ id }: { id?: string }) {
  const sticker = id ? getBearSticker(id) : undefined;
  const [playing, setPlaying] = useState(false);
  const [failed, setFailed] = useState(false);
  const [reduced, setReduced] = useState(true);
  const active = useAppActivity() === "active";
  useEffect(() => {
    let live = true;
    void AccessibilityInfo.isReduceMotionEnabled().then(value => { if (live) setReduced(value); }).catch(() => undefined);
    const subscription = AccessibilityInfo.addEventListener("reduceMotionChanged", setReduced);
    return () => { live = false; subscription.remove(); };
  }, []);
  if (!sticker || !stickerSources[sticker.id] || failed) return <Text>表情暂不可用</Text>;
  return <Pressable accessibilityRole="button" accessibilityLabel={`${sticker.name}，${playing ? "暂停动画" : "播放动画"}`} onPress={() => setPlaying(!playing)} style={({ pressed }) => [styles.preview, pressed && styles.pressed]}>
    <Image source={playing && active && !reduced ? stickerSources[sticker.id] : stickerPosters[sticker.id]} style={styles.image} resizeMode="contain" onError={() => setFailed(true)} accessibilityLabel={sticker.name} />
    <Text style={styles.hint}>{reduced ? "已按系统设置减少动态效果" : playing ? "点击暂停" : "点击播放熊崽动画"}</Text>
  </Pressable>;
}

export function StickerPanel({ conversation, disabled, onSend }: { conversation: ConversationApiView; disabled: boolean; onSend(id: string): Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const stickers = bearStickers.filter(item => conversation.conversation_type === "SUPPORT" || item.side === (conversation.member_role === "SELLER" ? "seller" : "buyer"));
  return <>
    <Pressable accessibilityRole="button" accessibilityLabel="选择熊崽表情" disabled={disabled} accessibilityState={{ disabled, expanded: open }} onPress={() => setOpen(true)} style={({ pressed }) => [styles.iconAction, pressed && styles.pressed, disabled && styles.disabled]}><ChatControlIcon kind="smile" /></Pressable>
    <Modal visible={open} transparent animationType="none" onRequestClose={() => setOpen(false)}>
      <View style={styles.scrim}><Pressable style={styles.dismiss} accessibilityRole="button" accessibilityLabel="收起表情面板" onPress={() => setOpen(false)} />
      <SafeAreaView style={styles.page}>
        <View style={styles.row}><Text style={styles.title}>熊崽表情</Text><Pressable accessibilityRole="button" onPress={() => setOpen(false)} style={styles.action}><Text style={styles.label}>关闭</Text></Pressable></View>
        <ScrollView contentContainerStyle={styles.grid}>{stickers.map(item => <Pressable key={item.id} accessibilityRole="button" accessibilityLabel={`预览${item.name}`} accessibilityState={{ selected: selected === item.id }} onPress={() => setSelected(item.id)} style={({ pressed }) => [styles.tile, selected === item.id && styles.selected, pressed && styles.pressed]}><Image source={stickerPosters[item.id]} style={styles.thumbnail} resizeMode="contain" accessible={false} /><Text style={styles.tileLabel}>{item.name}</Text></Pressable>)}</ScrollView>
        {selected ? <View style={styles.selection}><StickerPicture key={selected} id={selected} /><Pressable accessibilityRole="button" accessibilityLabel="发送所选熊崽表情" accessibilityState={{ disabled }} disabled={disabled} style={[styles.action, disabled && styles.disabled]} onPress={() => { setOpen(false); void onSend(selected); }}><Text style={styles.label}>发送表情</Text></Pressable></View> : <Text style={styles.hint}>选择表情后预览并发送</Text>}
      </SafeAreaView>
      </View>
    </Modal>
  </>;
}
const styles = StyleSheet.create({
  page: { maxHeight: "75%", backgroundColor: colors.surfaceBlue, padding: 12, borderTopLeftRadius: 20, borderTopRightRadius: 20 },
  scrim: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(16,38,83,0.16)" },
  dismiss: { flex: 1 },
  iconAction: { width: 48, minHeight: 48, alignItems: "center", justifyContent: "center" },
  thumbnail: { width: "100%", aspectRatio: 1 },
  tileLabel: { color: colors.text, fontSize: 11, lineHeight: 16, textAlign: "center" },
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  title: { fontSize: 20, color: colors.text, fontWeight: "700" },
  label: { color: colors.text, fontSize: 16, textAlign: "center" },
  hint: { color: colors.textSecondary, fontSize: 12, textAlign: "center", padding: 8 },
  grid: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", paddingVertical: 8 },
  tile: { width: "24%", minHeight: 72, padding: 4, borderWidth: 2, borderColor: "transparent", borderRadius: 12, justifyContent: "center" },
  selected: { borderColor: colors.brand, borderWidth: 2 },
  action: { minHeight: 48, padding: 12, justifyContent: "center" },
  selection: { alignItems: "center" }, preview: { alignItems: "center", minHeight: 80, justifyContent: "center", maxWidth: 180 }, image: { width: 140, height: 140 },
  pressed: { opacity: 0.7 }, disabled: { opacity: 0.45 }
});
