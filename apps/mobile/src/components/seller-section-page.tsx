import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { ApprovedIllustration } from './approved-illustration';
import { BrandBackdrop } from './brand-backdrop';
import { NativeHeader } from './native-page';
import { tabBarMetrics } from './tab-bar-metrics';
import { colors } from '@/theme/tokens';

const sections = [
  { label: '首页', icon: 'home', href: '/(seller-tabs)' },
  { label: '订单', icon: 'order', href: '/(seller-tabs)/orders' },
  { label: '消息', icon: 'message', href: '/(seller-tabs)/messages' },
  { label: '我的', icon: 'mine', href: '/(seller-tabs)/mine' }
] as const;

/** Standalone seller sections retain the approved dock without nesting a second navigator. */
export function SellerSectionPage({ title, children }: { title: string; children: ReactNode }) {
  return <SafeAreaView style={styles.flex} edges={['top', 'left', 'right']}>
    <BrandBackdrop seller /><NativeHeader title={title} subtitle="" />
    <View style={styles.flex}>{children}</View><SellerSectionDock />
  </SafeAreaView>;
}

export function SellerSectionDock() {
  const { fontScale } = useWindowDimensions();
  const { bottom } = useSafeAreaInsets();
  const metrics = tabBarMetrics('seller', fontScale, bottom);
  return <View style={[styles.dock, { height: metrics.height, paddingBottom: metrics.paddingBottom }]}>
    <BrandBackdrop seller dock />
    {sections.map(section => <Pressable key={section.href} accessibilityRole="tab" accessibilityLabel={section.label} accessibilityState={{ selected: section.icon === 'mine' }} onPress={() => router.dismissTo(section.href)} style={({ pressed }) => [styles.tab, { height: metrics.itemHeight }, pressed && styles.pressed]}>
      <ApprovedIllustration kind={section.icon} size={38} /><Text style={[styles.label, section.icon === 'mine' && styles.selected]}>{section.label}</Text>
    </Pressable>)}
  </View>;
}

const styles = StyleSheet.create({
  flex: { flex: 1 }, dock: { flexDirection: 'row', paddingTop: 5, paddingHorizontal: 13, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  tab: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 1 }, label: { color: colors.textSecondary, fontSize: 12, lineHeight: 17, fontWeight: '700' },
  selected: { color: colors.brand }, pressed: { opacity: 0.72 }
});
