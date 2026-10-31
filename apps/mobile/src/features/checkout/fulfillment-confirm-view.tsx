import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { BrandBackdrop } from '@/components/brand-backdrop';
import { NativeHeader } from '@/components/native-page';
import { JellyIcon } from '@/components/jelly-icon';
import { NoticeBanner } from '@/components/notice-banner';
import { PrimaryButton } from '@/components/primary-button';
import { StateView } from '@/components/state-view';
import { colors } from '@/theme/tokens';
import type { OrderPreviewApiView, PolicyApiView, ServiceDetailApiView } from '@/types/api';
import { formatCent } from '@/utils/money';

export interface FulfillmentConfirmViewProps {
  product?: ServiceDetailApiView;
  skuId?: string;
  quantity: number;
  preview?: OrderPreviewApiView;
  loading: boolean;
  online: boolean;
  error: string | null;
  notice: string | null;
  policies?: PolicyApiView[];
  policiesLoading: boolean;
  policiesFailed: boolean;
  selectedIds: string[];
  busy: boolean;
  consulting: boolean;
  onToggle(id: string): void;
  onAccept(): void;
  onSubmit(): void;
  onRetry(): void;
  onRetryPolicies(): void;
  onContact(): void;
}

/** Connected Web CheckoutScreen layout; public product data is never a payable preview. */
export function FulfillmentConfirmView(props: FulfillmentConfirmViewProps) {
  const { product, preview, policies, selectedIds, busy, online } = props;
  const sku = product?.skus.find(value => value.id === props.skuId);
  const allSelected = Boolean(policies?.length) && policies!.every(value => selectedIds.includes(value.id));
  const cannotAccept = busy || !online || props.policiesLoading || props.policiesFailed || !allSelected;
  const cannotSubmit = cannotAccept || !preview || props.loading || Boolean(props.error);
  const fulfillment = preview?.fulfillment_seconds ?? product?.fulfillment_seconds;
  return <SafeAreaView style={styles.safe} edges={['top', 'bottom', 'left', 'right']}><BrandBackdrop />
    <NativeHeader title="确认订单" subtitle="" onBack={() => router.back()} />
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <Text style={styles.title}>{preview?.product_title ?? product?.title ?? (props.loading ? '正在读取商品资料…' : '商品资料暂不可用')}</Text>
      <Text style={styles.paragraph}>{preview?.seller_name ?? product?.seller.seller_nickname ?? '卖家资料待加载'} · {preview?.sku_name ?? sku?.sku_name ?? '规格待确认'} ×{props.quantity}</Text>
      <Text style={styles.paragraph} accessibilityLabel={preview ? `服务端应付${formatCent(preview.payable_amount_cent)}` : '服务端应付金额暂不可用'}>{preview ? `服务端应付 ${formatCent(preview.payable_amount_cent)}` : props.loading ? '正在读取服务端价格…' : '暂未取得有效的服务端价格'}</Text>
      {fulfillment != null ? <Text style={styles.paragraph}>付款后 {fulfillment / 3600} 小时内完成，无需预约或卖家接单。</Text> : null}
      <Text style={styles.paragraph}>具体需求通过聊天沟通。创建订单前需确认交易协议并完成实名成年门禁。</Text>
      {!online ? <NoticeBanner message="网络已断开，恢复连接后请重新读取订单价格。" /> : null}
      {props.notice ? <NoticeBanner tone="danger" message={props.notice} /> : null}
      <View style={styles.policies}>
        <View style={styles.policyHeading}><Text style={styles.policyTitle}>交易规则确认</Text><Text style={styles.draft}>本地测试草案</Text></View>
        {props.policiesLoading ? <StateView kind="loading" illustrationSize={96} title="正在读取交易规则" /> : props.policiesFailed || !policies?.length ? <StateView kind="error" illustrationSize={96} title="交易规则暂不可用" message="协议加载失败时不能继续下单。" onRetry={props.onRetryPolicies} /> : policies.map(policy => <View key={policy.id} style={styles.policyRow}>
          <Pressable accessibilityRole="checkbox" accessibilityLabel={`我已阅读并同意${policy.title}V${policy.version_no}`} accessibilityState={{ checked: selectedIds.includes(policy.id), disabled: busy }} disabled={busy} onPress={() => props.onToggle(policy.id)} style={styles.checkEntry}>
            <View style={[styles.check, selectedIds.includes(policy.id) && styles.checked]}>{selectedIds.includes(policy.id) ? <JellyIcon kind="check" size={20} /> : null}</View>
            <View style={styles.policyCopy}><Text style={styles.policyName}>{policy.title}</Text><Text style={styles.version}>V{policy.version_no} · 在线确认并同意</Text></View>
          </Pressable>
          <Pressable accessibilityRole="link" accessibilityLabel={`查看${policy.title}V${policy.version_no}`} onPress={() => router.push({ pathname: '/policies/[id]', params: { id: policy.id } })} style={styles.read}><Text style={styles.readLabel}>查看</Text></Pressable>
        </View>)}
        <Text style={styles.hint}>创建订单前主动确认，不默认勾选；以服务端已发布的版本为准。</Text>
      </View>
      <PrimaryButton tone="plain" label={busy ? '正在处理…' : '确认协议并获取服务端价格'} disabled={cannotAccept} onPress={props.onAccept} />
      <Pressable accessibilityRole="button" accessibilityLabel="联系卖家" disabled={props.consulting || busy || !online || !product} accessibilityState={{ busy: props.consulting }} onPress={props.onContact} style={styles.contact}><Text style={styles.paragraph}>{props.consulting ? '连接中…' : '联系卖家'}</Text><JellyIcon kind="back" right size={20} /></Pressable>
      {props.error ? <View style={styles.error}><Text accessibilityRole="alert" style={styles.errorText}>{props.error}</Text><PrimaryButton tone="plain" label="重新读取订单预览" disabled={busy || !online} onPress={props.onRetry} /></View> : null}
      <PrimaryButton label={busy ? '提交中…' : '提交订单'} disabled={cannotSubmit} onPress={props.onSubmit} />
    </ScrollView>
  </SafeAreaView>;
}

const styles = StyleSheet.create({
  safe: { flex: 1 }, content: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 32, gap: 14 },
  title: { fontSize: 17, lineHeight: 25, fontWeight: '700', color: '#203A57' }, paragraph: { fontSize: 16, lineHeight: 26, color: '#203A57', flexShrink: 1 },
  policies: { marginHorizontal: 12, paddingVertical: 13, gap: 8, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.divider },
  policyHeading: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 10 }, policyTitle: { fontSize: 15, fontWeight: '700', color: colors.text }, draft: { fontSize: 9, color: '#A85D13', backgroundColor: '#FFF0D8', paddingVertical: 4, paddingHorizontal: 7, borderRadius: 8 },
  policyRow: { flexDirection: 'row', alignItems: 'center', gap: 10, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.divider, minHeight: 58 },
  checkEntry: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, minHeight: 48 }, check: { width: 23, height: 23, borderWidth: 2, borderRadius: 7, borderColor: '#8C9297', alignItems: 'center', justifyContent: 'center' }, checked: { borderColor: colors.brand, backgroundColor: colors.brand },
  policyCopy: { flex: 1 }, policyName: { fontSize: 12, lineHeight: 18, fontWeight: '700', color: colors.text }, version: { fontSize: 10, lineHeight: 16, marginTop: 3, color: colors.textSecondary }, read: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' }, readLabel: { fontSize: 12, fontWeight: '700', color: colors.brandDeep }, hint: { color: colors.textSecondary, fontSize: 10, lineHeight: 16 },
  contact: { minHeight: 56, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.divider }, error: { gap: 10 }, errorText: { color: colors.danger, fontSize: 14, lineHeight: 23 },
});
