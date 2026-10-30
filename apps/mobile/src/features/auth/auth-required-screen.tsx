import { StyleSheet, Text, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { resolveInternalReturnTo } from "@/auth/return-to";
import { NativeButton, NativePage, nativeShadow } from "@/components/native-page";
import { colors } from "@/theme/tokens";

export function AuthRequiredScreen() {
  const params = useLocalSearchParams<{ returnTo?: string; action?: string }>();
  const returnTo = resolveInternalReturnTo(params.returnTo);
  const leave = () => {
    if (router.canGoBack()) router.back();
    else router.replace("/(buyer-tabs)");
  };
  return (
    <NativePage title="需要登录" subtitle="账号数据将在登录后安全同步" contentStyle={styles.content}>
      <View style={styles.card}>
        <View style={styles.markWrap}><Text style={styles.mark}>人</Text></View>
        <Text style={styles.title}>登录后继续{params.action ?? "当前操作"}</Text>
        <Text style={styles.copy}>登录成功后会返回原页面，并继续刚才的操作。</Text>
        <View style={styles.actions}>
          <NativeButton label="手机号登录" onPress={() => router.replace({ pathname: "/(auth)/login", params: { returnTo } })} />
          <NativeButton tone="secondary" label="暂不登录" onPress={leave} />
        </View>
      </View>
      <View style={styles.notice}><Text style={styles.noticeTitle}>为什么需要登录？</Text><Text style={styles.noticeText}>收藏、订单、消息、个人资料和陪玩经营数据属于账号数据，游客状态不会生成虚假记录。</Text></View>
    </NativePage>
  );
}

const styles = StyleSheet.create({
  content: { gap: 13 },
  card: { alignItems: "center", padding: 22, ...nativeShadow, backgroundColor: "transparent", borderWidth: 0, borderLeftWidth: 0, borderRightWidth: 0, borderTopWidth: 0, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: colors.divider, borderBottomColor: colors.divider, borderRadius: 0, shadowOpacity: 0, elevation: 0 },
  markWrap: { width: 74, height: 74, alignItems: "center", justifyContent: "center", borderRadius: 25, backgroundColor: "#DCEEFF" },
  mark: { color: colors.brandDeep, fontSize: 28, lineHeight: 34, fontWeight: "900" },
  title: { marginTop: 17, color: colors.text, fontSize: 19, lineHeight: 25, fontWeight: "900", textAlign: "center" },
  copy: { marginTop: 8, color: colors.textSecondary, fontSize: 12, lineHeight: 18, textAlign: "center" },
  actions: { alignSelf: "stretch", gap: 10, marginTop: 20 },
  notice: { padding: 16, borderWidth: 1, borderColor: "rgba(39,143,232,0.13)", borderRadius: 17, backgroundColor: "rgba(220,238,255,0.94)", ...nativeShadow },
  noticeTitle: { color: colors.text, fontSize: 13, lineHeight: 18, fontWeight: "900" },
  noticeText: { marginTop: 7, color: colors.textSecondary, fontSize: 12, lineHeight: 17 }
});
