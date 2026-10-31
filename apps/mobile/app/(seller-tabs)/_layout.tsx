import { Pressable, StyleSheet, useWindowDimensions } from "react-native";
import { Redirect, Tabs } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { tabBarMetrics } from "@/components/tab-bar-metrics";
import { AppScreen } from "@/components/app-screen";
import { StateView } from "@/components/state-view";
import { useSellerProfile } from "@/features/seller/seller-api";
import { useAuth } from "@/auth/auth-provider";
import { useOnlineStatus } from "@/hooks/use-online-status";
import { ApprovedIllustration } from "@/components/approved-illustration";
import { BrandBackdrop } from "@/components/brand-backdrop";
import { colors } from "@/theme/tokens";

const icons = { index: "home", services: "product", orders: "order", earnings: "wallet", messages: "message", mine: "mine" } as const;
export default function SellerTabsLayout() {
  const { fontScale } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const metrics = tabBarMetrics("seller", fontScale, insets.bottom);
  const { status, user, bootstrapError, retryBootstrap } = useAuth();
  const online = useOnlineStatus();
  const profile = useSellerProfile(status === "authenticated" && Boolean(user));
  if (status === "booting") return <AppScreen>{bootstrapError ? <StateView kind="error" title="无法恢复登录状态" message={bootstrapError} actionLabel="重试" onRetry={() => void retryBootstrap()} /> : <StateView kind="loading" title="正在验证陪玩权限" />}</AppScreen>;
  if (!user) return <Redirect href={{ pathname: "/(auth)/required", params: { returnTo: "/settings/switch-identity", action: "查看入驻与身份状态" } }} />;
  if (profile.isPending) return <AppScreen><StateView kind="loading" title="正在验证陪玩权限" /></AppScreen>;
  if (!online) return <AppScreen><StateView kind="offline" onRetry={() => void profile.refetch()} /></AppScreen>;
  if (profile.isError && (profile.error as { code?: string }).code === "SELLER_NOT_FOUND") return <Redirect href="/settings/switch-identity" />;
  if (profile.isError) return <AppScreen><StateView kind="error" title="无法验证陪玩权限" onRetry={() => void profile.refetch()} /></AppScreen>;
  if (!profile.data || profile.data.status !== "APPROVED") return <Redirect href="/settings/switch-identity" />;
  return <Tabs screenOptions={({ route }) => ({
    headerShown: false, tabBarActiveTintColor: colors.brand, tabBarInactiveTintColor: colors.textSecondary,
    tabBarBackground: () => <BrandBackdrop seller dock />,
    tabBarStyle: [styles.tabBar, { height: metrics.height, paddingBottom: metrics.paddingBottom }],
    tabBarItemStyle: [styles.item, { height: metrics.itemHeight }],
    tabBarLabelStyle: styles.label, tabBarIconStyle: styles.iconSlot,
    tabBarButton: ({ children, onPress, onLongPress, accessibilityLabel, accessibilityState, testID, style }) => <Pressable accessibilityRole="tab" accessibilityLabel={accessibilityLabel} accessibilityState={accessibilityState} testID={testID} onPress={onPress} onLongPress={onLongPress} android_ripple={{ color: "transparent" }} style={({ pressed }) => [style, pressed && styles.tabPressed]}>{children}</Pressable>,
    tabBarIcon: () => <ApprovedIllustration kind={icons[route.name as keyof typeof icons]} size={38} />
  })}><Tabs.Screen name="index" options={{ title: "首页" }} /><Tabs.Screen name="orders" options={{ title: "订单" }} /><Tabs.Screen name="messages" options={{ title: "消息" }} /><Tabs.Screen name="mine" options={{ title: "我的" }} /><Tabs.Screen name="services" options={{ title: "商品", href: null }} /><Tabs.Screen name="earnings" options={{ title: "收益", href: null }} /></Tabs>;
}
const styles = StyleSheet.create({ tabBar: { paddingTop: 5, paddingHorizontal: 13, borderTopColor: colors.border, backgroundColor: "transparent", shadowColor: "#126BB2", shadowOffset: { width: 0, height: -8 }, shadowOpacity: 0.06, shadowRadius: 24, elevation: 6 }, item: { height: 67 }, label: { marginTop: 1, fontSize: 12, lineHeight: 17, fontWeight: "700" }, iconSlot: { width: 38, height: 38, marginBottom: 0 }, tabPressed: { opacity: 0.72 } });
