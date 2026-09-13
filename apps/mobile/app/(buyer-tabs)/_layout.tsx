import { Pressable, StyleSheet } from "react-native";
import { Tabs } from "expo-router";
import { useAuth } from "@/auth/auth-provider";
import { useConversationUnread, useNotificationUnread } from "@/features/chat/chat-api";
import { shouldPollChat } from "@/features/chat/chat-domain";
import { useAppActivity } from "@/hooks/use-app-activity";
import { useOnlineStatus } from "@/hooks/use-online-status";
import { HomeTabIcon, MessageTabIcon, MineTabIcon, OrderTabIcon } from "@/components/tab-icons";

const icons = {
  index: HomeTabIcon,
  orders: OrderTabIcon,
  messages: MessageTabIcon,
  mine: MineTabIcon
};

export default function BuyerTabsLayout() {
  const { user } = useAuth(); const online = useOnlineStatus(); const polling = shouldPollChat(useAppActivity(), online); const chatUnread = useConversationUnread(Boolean(user), polling); const notificationUnread = useNotificationUnread(Boolean(user), polling); const unread = (chatUnread.data?.unread_count ?? 0) + (notificationUnread.data?.unread_count ?? 0);
  return (
    <Tabs
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: "#FF5A1F",
        tabBarInactiveTintColor: "#6E706F",
        tabBarStyle: styles.tabBar,
        tabBarItemStyle: styles.item,
        tabBarLabelStyle: styles.label,
        tabBarIconStyle: styles.iconSlot,
        tabBarButton: ({ children, onPress, onLongPress, accessibilityLabel, accessibilityState, testID, style }) => <Pressable accessibilityRole="tab" accessibilityLabel={accessibilityLabel} accessibilityState={accessibilityState} testID={testID} onPress={onPress} onLongPress={onLongPress} android_ripple={{ color: "transparent" }} style={({ pressed }) => [style, pressed && styles.tabPressed]}>{children}</Pressable>,
        tabBarIcon: ({ color }) => {
          const Icon = icons[route.name as keyof typeof icons];
          return <Icon color={color} size={40} />;
        }
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
  tabBar: { height: 86, paddingTop: 4, paddingHorizontal: 15, paddingBottom: 8, borderTopColor: "rgba(82,70,48,0.08)", backgroundColor: "rgba(255,255,255,0.97)", shadowColor: "#4B3A23", shadowOffset: { width: 0, height: -8 }, shadowOpacity: 0.06, shadowRadius: 24, elevation: 6 },
  item: { height: 68 },
  label: { marginTop: 3, fontSize: 13, lineHeight: 18, fontWeight: "700" },
  iconSlot: { width: 40, height: 40, marginBottom: 0 },
  tabPressed: { opacity: 0.72 }
});
