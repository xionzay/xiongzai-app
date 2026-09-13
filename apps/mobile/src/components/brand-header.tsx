import { Image, StyleSheet, Text, View } from "react-native";
import { colors, spacing, typography } from "@/theme/tokens";
import xiongzaiIcon from "../../assets/xiongzai-icon.png";

export function BrandHeader({ subtitle = "找陪玩 · 选服务 · 安心下单" }: { subtitle?: string }) {
  return (
    <View style={styles.row}>
      <Image source={xiongzaiIcon} style={styles.logo} accessibilityLabel="熊崽电竞" />
      <View style={styles.copy}>
        <Text style={styles.name}>熊崽电竞</Text>
        <Text style={styles.subtitle}>{subtitle}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  logo: { width: 46, height: 42, borderRadius: 12 },
  copy: { flex: 1 },
  name: { ...typography.cardTitle, color: colors.text, fontWeight: "900" },
  subtitle: { ...typography.caption, color: colors.brandDeep }
});
