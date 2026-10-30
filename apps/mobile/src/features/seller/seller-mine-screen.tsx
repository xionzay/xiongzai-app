import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, type Href } from 'expo-router';
import { BrandBackdrop } from '@/components/brand-backdrop';
import { ApprovedIllustration } from '@/components/approved-illustration';
import { SellerIdentity } from './seller-identity';
import { StateView } from '@/components/state-view';
import { useSellerOverview } from './seller-api';
import { colors } from '@/theme/tokens';
import { approvedLayout } from '@/theme/approved-layout';
import { formatCent } from '@/utils/money';

export function SellerMineScreen() {
  const query = useSellerOverview();
  const data = query.data;
  return <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}><BrandBackdrop seller />
    <ScrollView contentContainerStyle={styles.content} refreshControl={<RefreshControl refreshing={query.isRefetching} onRefresh={() => void query.refetch()} />}>
      {query.isPending ? <StateView kind="loading" /> : query.isError || !data ? <StateView kind="error" onRetry={() => void query.refetch()} /> : <>
        <SellerIdentity seller={data.seller} />
        <View style={styles.finance}><Text style={styles.note}>可申请提现（元）</Text><View style={styles.balanceRow}><Text style={styles.money}>{formatCent(data.finance.available_cent).replace(/^¥\s*/, '')}</Text><Pressable accessibilityRole="button" style={styles.preview} onPress={() => router.push('/seller/finance')}><Text style={styles.link}>查看资金</Text><ApprovedIllustration kind="chevron" rotation={-90} size={16} /></Pressable></View></View>
        <Entry title="资金与结算明细" icon="wallet" href="/seller/finance" />
        <Entry title="主页资料" icon="mine" href="/seller/profile" />
        <Entry title="预览主页" icon="mine" href="/seller/preview" />
        <Entry title="经营数据" icon="data" href="/(seller-tabs)/earnings" />
        <Entry title="评价管理" icon="message" href="/seller/reviews" />
        <Entry title="商品管理" icon="product" href="/(seller-tabs)/services" />
        <Entry title="售后与申诉" icon="shield" href="/seller/refunds" />
        <Pressable accessibilityRole="button" onPress={() => router.replace('/(buyer-tabs)/mine')} style={styles.switchButton}><Text style={styles.label}>切换到买家端</Text></Pressable>
      </>}
    </ScrollView>
  </SafeAreaView>;
}
function Entry({ title, icon, href }: { title: string; icon: 'data'|'wallet'|'product'|'message'|'shield'|'service'|'mine'; href: Href }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={title} onPress={() => router.push(href)} style={({ pressed }) => [styles.entry, pressed && { opacity: 0.7 }]}><ApprovedIllustration kind={icon} size={32} /><View style={styles.grow}><Text style={styles.label}>{title}</Text></View><ApprovedIllustration kind="chevron" rotation={-90} size={18} /></Pressable>;
}
const styles = StyleSheet.create({
  safe: { flex: 1 }, content: { paddingHorizontal: 14, paddingBottom: 24 }, header: { minHeight: 52, flexDirection: 'row', alignItems: 'center' }, iconButton: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center' }, heading: { flex: 1, textAlign: 'center', fontSize: 20, color: colors.text, fontWeight: '600' },
  identity: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8 }, identityActions: { alignItems: 'flex-end' }, preview: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 6 }, link: { color: colors.brandDeep, fontSize: 12 },
  profile: { flex: 1, flexDirection: 'row', gap: 10, alignItems: 'center', paddingVertical: 12 }, avatar: { width: 48, height: 48, borderRadius: 14 }, grow: { flex: 1, gap: 5 }, name: { fontSize: 18, color: colors.text, fontWeight: '700' }, note: { fontSize: 12, lineHeight: 18, color: colors.textSecondary }, label: { fontSize: 15, color: colors.text, fontWeight: '600' },
  finance: { padding: 16, borderRadius: 16, gap: 6, backgroundColor: 'rgba(255,255,255,0.35)' }, balanceRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }, money: { flexShrink: 1, fontSize: 28, color: colors.text, fontWeight: '700' }, entry: { minHeight: 62, flexDirection: 'row', gap: 12, alignItems: 'center', paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: approvedLayout.divider }, switchButton: { marginTop: 20, minHeight: 48, borderRadius: 12, borderWidth: 1, borderColor: approvedLayout.divider, alignItems: 'center', justifyContent: 'center' }
});
