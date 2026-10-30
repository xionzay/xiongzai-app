import { Pressable, StyleSheet, useWindowDimensions } from "react-native";
import { Tabs } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { tabBarMetrics } from "@/components/tab-bar-metrics";
import { useAuth } from "@/auth/auth-provider";
import { useConversationUnread, useNotificationUnread } from "@/features/chat/chat-api";
import { shouldPollChat } from "@/features/chat/chat-domain";
import { useAppActivity } from "@/hooks/use-app-activity";
import { useOnlineStatus } from "@/hooks/use-online-status";
import { ApprovedIllustration } from "@/components/approved-illustration";
import { BrandBackdrop } from "@/components/brand-backdrop";
import { colors } from "@/theme/tokens";

const icons = {
  index: "home", orders: "order", messages: "message", mine: "mine"
} as const;

export default function BuyerTabsLayout() {
  const { fontScale } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const metrics = tabBarMetrics("buyer", fontScale, insets.bottom);
  const { user } = useAuth(); const online = useOnlineStatus(); const polling = shouldPollChat(useAppActivity(), online); const chatUnread = useConversationUnread(Boolean(user), polling); const notificationUnread = useNotificationUnread(Boolean(user), polling); const unread = (chatUnread.data?.unread_count ?? 0) + (notificationUnread.data?.unread_count ?? 0);
  return (
    <Tabs
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: colors.brand,
        tabBarInactiveTintColor: colors.textSecondary,
        tabBarBackground: () => <BrandBackdrop dock />,
        tabBarStyle: [styles.tabBar, { height: metrics.height, paddingBottom: metrics.paddingBottom }],
        tabBarItemStyle: [styles.item, { height: metrics.itemHeight }],
        tabBarLabelStyle: styles.label,
        tabBarIconStyle: styles.iconSlot,
        tabBarButton: ({ children, onPress, onLongPress, accessibilityLabel, accessibilityState, testID, style }) => <Pressable accessibilityRole="tab" accessibilityLabel={accessibilityLabel} accessibilityState={accessibilityState} testID={testID} onPress={onPress} onLongPress={onLongPress} android_ripple={{ color: "transparent" }} style={({ pressed }) => [style, pressed && styles.tabPressed]}>{children}</Pressable>,
        tabBarIcon: () => <ApprovedIllustration kind={icons[route.name as keyof typeof icons]} size={36} />
      })}
    >
      <Tabs.Screen name="index" options={{ title: "首页" }} />
      <Tabs.Screen name="orders" options={{ title: "订单" }} />
      <Tabs.Screen name="messages" options={{ title: "消息", tabBarBadge: unread > 0 ? (unread > 99 ? "99+" : unread) : undefined }} />
      <Tabs.Screen name="mine" options={{ title: "我的" }} />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  tabBar: { paddingTop: 4, paddingHorizontal: 15, borderTopColor: colors.border, backgroundColor: "transparent", shadowColor: "#126BB2", shadowOffset: { width: 0, height: -8 }, shadowOpacity: 0.06, shadowRadius: 24, elevation: 6 },
  item: { height: 68 },
  label: { marginTop: 3, fontSize: 13, lineHeight: 18, fontWeight: "700" },
  iconSlot: { width: 40, height: 40, marginBottom: 0 },
  tabPressed: { opacity: 0.72 }
});
