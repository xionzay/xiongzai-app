import type { ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { BrandBackdrop } from '@/components/brand-backdrop';
import { ApprovedIllustration } from '@/components/approved-illustration';
import { colors } from '@/theme/tokens';
import { approvedLayout } from '@/theme/approved-layout';

export function MerchantHeader({ title, action, onBack = () => router.canGoBack() ? router.back() : router.replace('/(seller-tabs)') }: { title: string; action?: ReactNode; onBack?: () => void }) {
  return <View style={merchantStyles.header}><Pressable accessibilityRole="button" accessibilityLabel="返回" onPress={onBack} style={merchantStyles.iconButton}><ApprovedIllustration kind="chevron" rotation={90} size={22} /></Pressable><Text accessibilityRole="header" style={merchantStyles.headerTitle}>{title}</Text><View style={merchantStyles.headerAction}>{action}</View></View>;
}
export function MerchantPage({ title, children, action, footer, refreshing = false, onRefresh, onBack }: { title: string; children: ReactNode; action?: ReactNode; footer?: ReactNode; refreshing?: boolean; onRefresh?: () => void; onBack?: () => void }) {
  return <SafeAreaView style={merchantStyles.flex} edges={['top', 'bottom', 'left', 'right']}><BrandBackdrop seller /><KeyboardAvoidingView style={merchantStyles.flex} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
    <MerchantHeader title={title} action={action} onBack={onBack} />
    <ScrollView keyboardShouldPersistTaps="handled" keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'} automaticallyAdjustKeyboardInsets={Platform.OS === 'ios'} contentContainerStyle={merchantStyles.content} refreshControl={onRefresh ? <RefreshControl refreshing={refreshing} onRefresh={onRefresh} /> : undefined}>{children}</ScrollView>
    {footer ? <View style={merchantStyles.footer}>{footer}</View> : null}
  </KeyboardAvoidingView></SafeAreaView>;
}
/** Retains children while collapsed so an upload/recovery task is not unmounted. */
export function MerchantDisclosure({ title, summary, expanded, onToggle, children, disabled = false }: { title: string; summary?: string; expanded: boolean; onToggle: () => void; children: ReactNode; disabled?: boolean }) {
  return <View style={merchantStyles.section}><Pressable accessibilityRole="button" accessibilityLabel={title} accessibilityState={{ expanded, disabled }} disabled={disabled} onPress={onToggle} style={merchantStyles.disclosure}><View style={merchantStyles.flex}><Text style={merchantStyles.sectionTitle}>{title}</Text>{summary ? <Text style={merchantStyles.note}>{summary}</Text> : null}</View><ApprovedIllustration kind="chevron" rotation={expanded ? 0 : -90} size={18} /></Pressable><View style={!expanded ? merchantStyles.hidden : undefined} accessibilityElementsHidden={!expanded} importantForAccessibility={expanded ? 'auto' : 'no-hide-descendants'}>{children}</View></View>;
}
export const merchantStyles = StyleSheet.create({
  flex: { flex: 1 }, header: { minHeight: 52, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8 }, iconButton: { width: 48, minHeight: 48, alignItems: 'center', justifyContent: 'center' }, headerTitle: { flex: 1, textAlign: 'center', color: colors.text, fontSize: 19, fontWeight: '600' }, headerAction: { minWidth: 48, alignItems: 'flex-end' },
  content: { paddingHorizontal: approvedLayout.gutter, paddingBottom: 24, gap: 12 }, footer: { paddingHorizontal: 14, paddingVertical: 10, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: approvedLayout.divider, backgroundColor: 'rgba(220,228,250,0.96)' },
  section: { paddingVertical: 12, gap: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: approvedLayout.divider }, sectionTitle: { fontSize: 16, color: colors.text, fontWeight: '600' }, note: { color: colors.textSecondary, fontSize: 12, lineHeight: 18 }, disclosure: { minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: 12 }, hidden: { display: 'none' },
  button: { minHeight: 48, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: approvedLayout.divider, borderRadius: 8, paddingHorizontal: 12 }, buttonText: { fontSize: 14, fontWeight: '600', color: colors.text }, primary: { backgroundColor: '#4b5ed7', borderColor: '#4b5ed7' }, primaryText: { color: '#fff' }, input: { minHeight: 48, borderRadius: 8, borderWidth: 1, borderColor: 'rgba(112,134,180,0.5)', backgroundColor: 'rgba(214,229,251,0.6)', paddingHorizontal: 12, color: colors.text, fontSize: 16 }
});
