import { StyleSheet, Text, View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { NativePage, PaperCard, nativeShadow } from "@/components/native-page";
import { StateView } from "@/components/state-view";
import { usePolicy } from "@/features/account/account-api";
import { colors } from "@/theme/tokens";

export function PolicyDetailScreen() {
  const { id = "" } = useLocalSearchParams<{ id: string }>();
  const query = usePolicy(id);

  return (
    <NativePage
      title={query.data?.title ?? "协议详情"}
      subtitle={query.data ? `本地测试草案 · 服务端已发布 V${query.data.version_no}` : "本地测试协议草案正文"}
      refreshing={query.isRefetching}
      onRefresh={() => void query.refetch()}
      contentStyle={styles.content}
    >
      {query.isPending ? <View style={styles.state}><StateView kind="loading" /></View> : null}
      {query.isError || (!query.isPending && !query.data) ? <View style={styles.state}><StateView kind="error" title="协议不存在或尚未发布" onRetry={() => void query.refetch()} /></View> : null}
      {query.data ? (
        <>
          <View style={styles.hero}>
            <Text style={styles.eyebrow}>LOCAL TEST POLICY</Text>
            <Text style={styles.title}>{query.data.title}</Text>
            <Text style={styles.meta}>版本 V{query.data.version_no} · 发布于 {new Date(query.data.published_at).toLocaleString("zh-CN")}</Text>
          </View>
          <PaperCard style={styles.card}><Text selectable style={styles.body}>{query.data.content}</Text></PaperCard>
          <Text style={styles.footer}>正文来自本地测试后端已发布版本，不代表正式商业签署、第三方电子签或真实渠道授权。</Text>
        </>
      ) : null}
    </NativePage>
  );
}

const styles = StyleSheet.create({
  content: { gap: 13 },
  state: { minHeight: 220, justifyContent: "center", borderRadius: 18, backgroundColor: "rgba(255,253,248,0.96)", ...nativeShadow },
  hero: { padding: 19, borderWidth: 1, borderColor: "rgba(39,143,232,0.13)", borderRadius: 19, backgroundColor: "rgba(220,238,255,0.95)", ...nativeShadow },
  eyebrow: { color: colors.brandDeep, fontSize: 12, lineHeight: 16, fontWeight: "800", letterSpacing: 1.2 },
  title: { marginTop: 8, color: colors.text, fontSize: 20, lineHeight: 26, fontWeight: "900" },
  meta: { marginTop: 8, color: colors.textSecondary, fontSize: 12, lineHeight: 16 },
  card: { padding: 18, backgroundColor: "transparent", borderWidth: 0, borderLeftWidth: 0, borderRightWidth: 0, borderTopWidth: 0, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: colors.divider, borderBottomColor: colors.divider, borderRadius: 0, shadowOpacity: 0, elevation: 0 },
  body: { color: colors.text, fontSize: 12, lineHeight: 23 },
  footer: { color: colors.textSecondary, fontSize: 12, lineHeight: 16, textAlign: "center" }
});
