import { Pressable, StyleSheet, Text, View } from "react-native";
import { ChevronLeftIcon } from "@/components/ui-icons";
import { CouponActionIcon } from "@/components/tab-icons";
import { router } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { colors } from "@/theme/tokens";

const backgroundBands = Array.from({ length: 52 }, (_, index) => {
  const ratio = index / 51;
  const from = ratio < 0.20 ? [222, 240, 255] : [255, 252, 246];
  const to = ratio < 0.20 ? [255, 252, 246] : [249, 244, 235];
  const progress = ratio < 0.20 ? ratio / 0.20 : (ratio - 0.20) / 0.80;
  const channel = (value: number, target: number) => Math.round(value + (target - value) * progress);
  return `rgb(${channel(from[0]!, to[0]!)}, ${channel(from[1]!, to[1]!)}, ${channel(from[2]!, to[2]!)})`;
});

export default function CouponsRoute() {
  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom", "left", "right"]}>
      <CouponBackdrop />
      <View style={styles.content}>
        <View style={styles.header}>
          <Pressable accessibilityRole="button" accessibilityLabel="返回" onPress={() => router.back()} style={({ pressed }) => [styles.back, pressed && styles.pressed]}><ChevronLeftIcon size={23} /></Pressable>
          <View style={styles.headerCopy}><Text style={styles.pageTitle}>优惠券</Text><Text style={styles.pageSubtitle}>第一阶段暂不开放使用</Text></View>
        </View>

        <View style={styles.summaryCard}>
          <Text style={styles.available}><Text style={styles.availableNumber}>0</Text> 张可用</Text>
          <Text style={styles.summaryNote}>优惠券入口保留，后续版本开放领取与核销</Text>
        </View>

        <View style={styles.empty}>
          <View style={styles.couponIcon}><CouponActionIcon color="#2F8FE5" surfaceColor="#DDECFF" size={64} /></View>
          <Text style={styles.emptyTitle}>暂无可用优惠券</Text>
          <Text style={styles.emptyText}>第一阶段订单按服务实际价格结算，不展示虚假优惠信息。</Text>
          <Pressable accessibilityRole="button" accessibilityLabel="去看看服务" onPress={() => router.replace("/(buyer-tabs)")} style={({ pressed }) => [styles.exploreButton, pressed && styles.pressed]}><Text style={styles.exploreText}>去看看服务</Text></Pressable>
        </View>
      </View>
    </SafeAreaView>
  );
}

function CouponBackdrop() {
  return <View pointerEvents="none" style={styles.backdrop}>{backgroundBands.map((color, index) => <View key={`${index}-${color}`} style={[styles.band, { backgroundColor: color }]} />)}</View>;
}

const softShadow = { shadowColor: "#4B3920", shadowOffset: { width: 0, height: 5 }, shadowOpacity: 0.08, shadowRadius: 14, elevation: 3 } as const;

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#DEF0FF" },
  backdrop: { position: "absolute", top: 0, right: 0, bottom: 0, left: 0 },
  band: { flex: 1 },
  content: { flex: 1, paddingHorizontal: 12 },
  header: { minHeight: 76, flexDirection: "row", alignItems: "center" },
  back: { width: 44, height: 44, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: "rgba(62,57,47,0.10)", borderRadius: 14, backgroundColor: "#FFFDF8", ...softShadow },
  backText: { marginTop: -3, color: colors.text, fontSize: 34, lineHeight: 38, fontWeight: "500" },
  headerCopy: { marginLeft: 11 },
  pageTitle: { color: colors.text, fontSize: 24, lineHeight: 29, fontWeight: "800" },
  pageSubtitle: { marginTop: 3, color: colors.textSecondary, fontSize: 12, lineHeight: 16 },
  summaryCard: { minHeight: 105, justifyContent: "center", paddingHorizontal: 17, borderWidth: 1, borderColor: "rgba(69,139,198,0.10)", borderRadius: 19, backgroundColor: "rgba(211,233,255,0.88)", ...softShadow },
  available: { color: colors.text, fontSize: 13, lineHeight: 26, fontWeight: "700" },
  availableNumber: { fontSize: 31, lineHeight: 36, fontWeight: "900" },
  summaryNote: { marginTop: 6, color: "#537594", fontSize: 12, lineHeight: 16 },
  empty: { flex: 1, alignItems: "center", paddingTop: 66 },
  couponIcon: { width: 76, height: 76, alignItems: "center", justifyContent: "center", borderRadius: 22, backgroundColor: "#DDECFF" },
  emptyTitle: { marginTop: 25, color: colors.text, fontSize: 17, lineHeight: 22, fontWeight: "900" },
  emptyText: { maxWidth: 310, marginTop: 10, color: colors.textSecondary, fontSize: 12, lineHeight: 16, textAlign: "center" },
  exploreButton: { minWidth: 104, height: 45, alignItems: "center", justifyContent: "center", marginTop: 22, paddingHorizontal: 18, borderRadius: 13, backgroundColor: colors.brand, ...softShadow },
  exploreText: { color: colors.white, fontSize: 12, fontWeight: "900" },
  pressed: { opacity: 0.72 },
});
