import { JellyIcon } from "../../components/jelly-icon";
import { useCallback, useEffect, useState } from "react";
import { AppState, Linking, StyleSheet, Text, View } from "react-native";
import * as ImagePicker from "expo-image-picker";
import { getRecordingPermissionsAsync } from "expo-audio";
import { NativeButton, NativePage, NativeRow, PaperCard, nativeShadow } from "@/components/native-page";
import { permissionCopy } from "@/features/account/account-domain";
import { colors } from "@/theme/tokens";

type PermissionState = "granted" | "denied" | "undetermined" | "unavailable";

async function readPermissionSnapshot(): Promise<{ library: PermissionState; camera: PermissionState; microphone: PermissionState }> {
  try {
    const [media, photo, audio] = await Promise.all([
      ImagePicker.getMediaLibraryPermissionsAsync(),
      ImagePicker.getCameraPermissionsAsync(),
      getRecordingPermissionsAsync()
    ]);
    return { library: media.status, camera: photo.status, microphone: audio.status };
  } catch {
    return { library: "unavailable", camera: "unavailable", microphone: "unavailable" };
  }
}

export function PermissionsScreen() {
  const [library, setLibrary] = useState<PermissionState>("undetermined");
  const [camera, setCamera] = useState<PermissionState>("undetermined");
  const [microphone, setMicrophone] = useState<PermissionState>("undetermined");
  const [refreshing, setRefreshing] = useState(false);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const state = await readPermissionSnapshot();
      setLibrary(state.library);
      setCamera(state.camera);
      setMicrophone(state.microphone);
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    let mounted = true;
    void readPermissionSnapshot().then((state) => {
      if (!mounted) return;
      setLibrary(state.library);
      setCamera(state.camera);
      setMicrophone(state.microphone);
    });
    const subscription = AppState.addEventListener("change", (next) => {
      if (next === "active") void refresh();
    });
    return () => {
      mounted = false;
      subscription.remove();
    };
  }, [refresh]);

  return (
    <NativePage
      title="系统权限说明"
      subtitle="仅在使用对应功能时申请"
      contentStyle={styles.content}
      refreshing={refreshing}
      onRefresh={() => void refresh()}
    >
      <View style={styles.hero}>
        <Text style={styles.heroMark}><JellyIcon kind="check" label="已选" /></Text>
        <View style={styles.heroCopy}>
          <Text style={styles.heroTitle}>按需授权，随时可关闭</Text>
          <Text style={styles.heroText}>拒绝权限不会影响订单、聊天和账户浏览。</Text>
        </View>
      </View>

      <PaperCard>
        <NativeRow label="照片" note="选择头像、服务封面、售后凭证和聊天图片" value={permissionCopy(library)} />
        <NativeRow label="相机" note="拍摄头像、封面和现场凭证" value={permissionCopy(camera)} />
        <NativeRow label="麦克风" note="录制 10–30 秒声音名片或 1–60 秒聊天语音" value={permissionCopy(microphone)} />
        <NativeRow label="通知" note="仅使用站内通知" value="系统推送尚未接入" last />
      </PaperCard>

      <NativeButton label="打开系统设置" onPress={() => void Linking.openSettings()} />
      <NativeButton label={refreshing ? "正在刷新…" : "刷新权限状态"} tone="secondary" disabled={refreshing} onPress={() => void refresh()} />

      <View style={styles.explanation}>
        <Text style={styles.explanationTitle}>文件和隐私安全</Text>
        <Text style={styles.explanationText}>照片、相机和麦克风只在您选择图片、拍摄头像或主动录制声音名片、聊天语音时使用，不用于实时通话。本地路径不会作为服务端文件地址，只有服务端校验后的真实 file_id 可以绑定，聊天媒体还需审核通过后才能发送。</Text>
      </View>
    </NativePage>
  );
}

const styles = StyleSheet.create({
  content: { gap: 13 },
  hero: { minHeight: 92, flexDirection: "row", alignItems: "center", gap: 13, paddingHorizontal: 16, borderWidth: 1, borderColor: "rgba(39,143,232,0.13)", borderRadius: 19, backgroundColor: "rgba(220,238,255,0.95)", ...nativeShadow },
  heroMark: { width: 50, height: 50, borderRadius: 17, color: colors.white, backgroundColor: colors.success, fontSize: 27, lineHeight: 50, fontWeight: "900", textAlign: "center" },
  heroCopy: { flex: 1 },
  heroTitle: { color: colors.text, fontSize: 14, lineHeight: 19, fontWeight: "900" },
  heroText: { marginTop: 6, color: colors.textSecondary, fontSize: 12, lineHeight: 16 },
  explanation: { padding: 16, borderWidth: 1, borderColor: "rgba(245,158,11,0.18)", borderRadius: 17, backgroundColor: "rgba(255,248,221,0.95)", ...nativeShadow },
  explanationTitle: { color: colors.text, fontSize: 13, lineHeight: 18, fontWeight: "900" },
  explanationText: { marginTop: 7, color: colors.textSecondary, fontSize: 12, lineHeight: 17 }
});
