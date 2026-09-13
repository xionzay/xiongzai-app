import { Pressable, StyleSheet } from "react-native";
import { Redirect, Tabs } from "expo-router";
import { AppScreen } from "@/components/app-screen";
import { StateView } from "@/components/state-view";
import { useSellerProfile } from "@/features/seller/seller-api";
import { useAuth } from "@/auth/auth-provider";
import { useOnlineStatus } from "@/hooks/use-online-status";
import { HomeTabIcon, OrderTabIcon, ServiceTabIcon, WalletTabIcon } from "@/components/tab-icons";

const icons = { index: HomeTabIcon, services: ServiceTabIcon, orders: OrderTabIcon, earnings: WalletTabIcon };
export default function SellerTabsLayout() {
  const { status, user, bootstrapError, retryBootstrap } = useAuth();
  const online = useOnlineStatus();
  const profile = useSellerProfile(status === "authenticated" && Boolean(user));
  if (status === "booting") return <AppScreen>{bootstrapError ? <StateView kind="error" title="无法恢复登录状态" message={bootstrapError} actionLabel="重试" onRetry={() => void retryBootstrap()} /> : <StateView kind="loading" title="正在验证陪玩权限" />}</AppScreen>;
  if (!user) return <Redirect href={{ pathname: "/(auth)/required", params: { returnTo: "/(seller-tabs)", action: "进入陪玩中心" } }} />;
  if (profile.isPending) return <AppScreen><StateView kind="loading" title="正在验证陪玩权限" /></AppScreen>;
  if (!online) return <AppScreen><StateView kind="offline" onRetry={() => void profile.refetch()} /></AppScreen>;
  if (profile.isError) return <AppScreen><StateView kind="error" title="无法验证陪玩权限" onRetry={() => void profile.refetch()} /></AppScreen>;
  if (!profile.data || profile.data.status !== "APPROVED") return <Redirect href="/seller/status" />;
  return <Tabs screenOptions={({ route }) => ({ headerShown: false, tabBarActiveTintColor: "#2479C9", tabBarInactiveTintColor: "#6E706F", tabBarStyle: styles.tabBar, tabBarItemStyle: styles.item, tabBarLabelStyle: styles.label, tabBarIconStyle: styles.iconSlot, tabBarButton: ({ children, onPress, onLongPress, accessibilityLabel, accessibilityState, testID, style }) => <Pressable accessibilityRole="tab" accessibilityLabel={accessibilityLabel} accessibilityState={accessibilityState} testID={testID} onPress={onPress} onLongPress={onLongPress} android_ripple={{ color: "transparent" }} style={({ pressed }) => [style, pressed && styles.tabPressed]}>{children}</Pressable>, tabBarIcon: ({ color }) => { const Icon = icons[route.name as keyof typeof icons]; return <Icon color={color} size={38} />; } })}><Tabs.Screen name="index" options={{ title: "概览" }} /><Tabs.Screen name="services" options={{ title: "服务" }} /><Tabs.Screen name="orders" options={{ title: "订单" }} /><Tabs.Screen name="earnings" options={{ title: "收益" }} /></Tabs>;
}
const styles = StyleSheet.create({ tabBar: { height: 80, paddingTop: 5, paddingHorizontal: 13, paddingBottom: 5, borderTopColor: "rgba(82,70,48,0.08)", backgroundColor: "rgba(245,251,255,0.98)", shadowColor: "#4B3A23", shadowOffset: { width: 0, height: -8 }, shadowOpacity: 0.06, shadowRadius: 24, elevation: 6 }, item: { height: 67 }, label: { marginTop: 1, fontSize: 12, lineHeight: 17, fontWeight: "800" }, iconSlot: { width: 38, height: 38, marginBottom: 0 }, tabPressed: { opacity: 0.72 } });
