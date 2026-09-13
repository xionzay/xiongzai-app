import { Image, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { colors, spacing, typography } from "@/theme/tokens";
import { PrimaryButton } from "@/components/primary-button";
import { NativeBackdrop, PaperCard } from "@/components/native-page";
import xiongzaiLogo from "../../../assets/xiongzai-logo.png";

export function SplashScreen({ error = null, onRetry }: { error?: string | null; onRetry?: () => void }) {
  return (
    <SafeAreaView style={styles.safe}>
      <NativeBackdrop />
      <View style={styles.hero}>
        <Image source={xiongzaiLogo} style={styles.logo} resizeMode="contain" />
        <Text style={styles.slogan}>让每一位玩家享受游戏的乐趣</Text>
      </View>
      <View style={styles.features}>
        {[
          ["真人陪玩", "资料认证，真实可靠"],
          ["快速响应", "随时下单，及时接单"],
          ["交易保障", "平台担保，售后无忧"]
        ].map(([label, note], index) => (
          <PaperCard key={label} style={styles.feature}>
            <Text style={[styles.number, index === 1 && styles.numberBlue]}>{`0${index + 1}`}</Text>
            <View style={styles.featureCopy}>
              <Text style={styles.featureText}>{label}</Text>
              <Text style={styles.featureNote}>{note}</Text>
            </View>
          </PaperCard>
        ))}
      </View>
      <View style={styles.status}>
        <Text style={[styles.loading, error && styles.error]} accessibilityLiveRegion="polite">{error ?? "正在安全恢复登录状态…"}</Text>
        <PrimaryButton label={error ? "重新连接" : "开始使用"} onPress={() => onRetry?.()} />
        <Text style={styles.footer}>找陪玩 · 选服务 · 安心下单</Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, alignItems: "center", backgroundColor: "#DEF0FF", paddingHorizontal: 22 },
  hero: { width: "100%", alignItems: "center", gap: 8, marginTop: 46 },
  logo: { width: 236, height: 168 },
  slogan: { ...typography.body, color: colors.brandDeep, fontWeight: "800", textAlign: "center" },
  features: { width: "100%", gap: 10, marginTop: 38 },
  feature: { minHeight: 74, flexDirection: "row", alignItems: "center", gap: 14, paddingHorizontal: 18, paddingVertical: 12 },
  number: { width: 38, color: colors.accent, fontSize: 18, lineHeight: 24, fontWeight: "900" },
  numberBlue: { color: colors.brand },
  featureCopy: { flex: 1 },
  featureText: { ...typography.cardTitle, color: colors.text, fontWeight: "900" },
  featureNote: { ...typography.caption, color: colors.textSecondary, marginTop: 3 },
  status: { position: "absolute", left: 22, right: 22, bottom: 34, gap: spacing.md },
  loading: { ...typography.caption, color: colors.textSecondary, textAlign: "center" },
  error: { color: colors.danger },
  footer: { ...typography.caption, color: colors.textSecondary, textAlign: "center", fontWeight: "700" }
});
