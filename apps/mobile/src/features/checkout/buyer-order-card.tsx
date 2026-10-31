import { useEffect, useRef, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { isFulfillmentOrder } from '@xiongzai/contracts/commerce';
import { apiClient } from '@/auth/runtime';
import { ApiClientError } from '@/api/api-error';
import { FileImage } from '@/components/file-image';
import { ChevronRightIcon } from '@/components/ui-icons';
import { createConsultation, createOrderConversation } from '@/features/chat/chat-api';
import { cancelOrder, confirmOrderComplete } from '@/features/checkout/order-api';
import { formatServiceTime, orderErrorMessage } from '@/features/checkout/checkout-domain';
import { useOnlineStatus } from '@/hooks/use-online-status';
import { queryClient } from '@/query/query-client';
import { colors } from '@/theme/tokens';
import type { BuyerOrderAction, OrderApiView, OrderDetailApiView } from '@/types/api';
import { formatCent } from '@/utils/money';

const actionLabels: Partial<Record<BuyerOrderAction, string>> = { PAY: '立即付款', CANCEL: '取消订单', CONFIRM_COMPLETE: '确认收货', REQUEST_REFUND: '申请售后', VIEW_REFUND: '查看售后', CREATE_COMPLAINT: '平台介入', CREATE_REVIEW: '去评价', VIEW_REVIEW: '查看评价' };
type Action = BuyerOrderAction | 'CONTACT';
export function buyerCardActions(order: OrderApiView): { code: Action; label: string; primary: boolean }[] {
  return [{ code: 'CONTACT' as const, label: '联系商家', primary: false }, ...Array.from(new Set(order.available_actions ?? []))
    .filter(code => actionLabels[code] && (code !== 'CREATE_REVIEW' || order.status === 'COMPLETED' && !order.reviewed))
    .map(code => ({ code, label: actionLabels[code]!, primary: ['PAY', 'CONFIRM_COMPLETE', 'CREATE_REVIEW'].includes(code) }))]
    .sort((a,b) => Number(a.primary) - Number(b.primary));
}
export function BuyerOrderCard({ item, state }: { item: OrderApiView; state: string }) {
  const online = useOnlineStatus();
  const [busy, setBusy] = useState(false), [more, setMore] = useState(false), [notice, setNotice] = useState('');
  const pending = useRef(false), mounted = useRef(true);
  const reading = useRef<AbortController | null>(null);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; reading.current?.abort(); }; }, []);
  const actions = buyerCardActions(item);
  const detail = () => router.push({ pathname: '/orders/[id]', params: { id: item.id } });
  const refresh = () => Promise.all([queryClient.invalidateQueries({ queryKey: ['buyer-orders'] }), queryClient.invalidateQueries({ queryKey: ['order',item.id] })]);
  const perform = async (code: Action) => {
    if (pending.current || !online || !mounted.current) return;
    pending.current = true; setBusy(true); setNotice('');
    const controller = new AbortController(); reading.current = controller;
    try {
      const latest = await apiClient.request<OrderDetailApiView>(`/orders/${item.id}`, { signal: controller.signal });
      if (!mounted.current || controller.signal.aborted) return;
      if (code !== 'CONTACT' && (!latest.available_actions.includes(code) || latest.version !== item.version)) {
        await refresh(); if (mounted.current) setNotice('订单状态已更新，请核对后重新操作。'); return;
      }
      if (code === 'CANCEL' || code === 'CONFIRM_COMPLETE') {
        if (code === 'CANCEL') await cancelOrder(item.id, latest.version, '买家主动取消订单');
        else await confirmOrderComplete(item.id, latest.version);
        await refresh();
      } else if (code === 'CONTACT') {
        const conversation = latest.status === 'PENDING_PAYMENT' ? await createConsultation(latest.product_id) : await createOrderConversation(latest.id);
        if (mounted.current) router.push({ pathname: '/conversations/[id]', params: { id: conversation.id } });
      } else if (code === 'PAY') router.push({ pathname: '/orders/[id]/pay', params: { id: item.id } });
      else if (code === 'REQUEST_REFUND') router.push({ pathname: '/refunds/new', params: { orderId: item.id } });
      else if (code === 'CREATE_COMPLAINT') router.push({ pathname: '/complaints/new', params: { orderId: item.id } });
      else if (code === 'CREATE_REVIEW') router.push({ pathname: '/reviews/new', params: { orderId: item.id } });
      else if (code === 'VIEW_REVIEW' && latest.review) router.push({ pathname: '/reviews/[id]', params: { id: latest.review.id } });
      else if (code === 'VIEW_REFUND' && latest.refunds[0]) router.push({ pathname: '/refunds/[id]', params: { id: latest.refunds[0].id } });
      else detail();
    } catch (error) {
      const code = error instanceof ApiClientError ? error.code : '';
      if (code === 'RESOURCE_VERSION_CONFLICT') await refresh();
      if (mounted.current) setNotice(code === 'RESOURCE_VERSION_CONFLICT' ? '订单状态已更新，请核对后重新操作。' : orderErrorMessage(code));
    } finally { reading.current = null; pending.current = false; if (mounted.current) setBusy(false); }
  };
  const run = (code: Action) => {
    if (pending.current || !online) return;
    if (code === 'CANCEL' || code === 'CONFIRM_COMPLETE') Alert.alert(code === 'CANCEL' ? '确认取消订单？' : '确认收货？', code === 'CANCEL' ? '取消后将关闭此订单。' : '请核对交付结果。确认后结束普通售后阶段，资金按规则结算。', [{ text: '暂不操作', style: 'cancel' }, { text: '确认', onPress: () => { void perform(code); } }]);
    else void perform(code);
  };
  const unpaid = item.status === 'PENDING_PAYMENT';
  return <View style={styles.card}>
    <View style={styles.head}>
      <Pressable accessibilityRole="button" accessibilityLabel={`查看${item.seller_name}的店铺`} onPress={() => router.push({ pathname: '/companions/[id]', params: { id: item.seller_id } })} style={styles.seller}>
        <FileImage fileId={item.seller_avatar} style={styles.avatar} label={`${item.seller_name}头像`} /><Text numberOfLines={1} style={styles.sellerName}>{item.seller_name}</Text><ChevronRightIcon size={15} />
      </Pressable><Text style={styles.status}>{state}</Text>
    </View>
    <Pressable accessibilityRole="button" accessibilityLabel={`${item.product_title}，${state}，查看订单详情`} onPress={detail} style={styles.product}>
      <FileImage fileId={item.product_image || null} style={styles.cover} label={`${item.product_title}图片`} />
      <View style={styles.description}><Text numberOfLines={2} style={styles.title}>{item.product_title}</Text><Text style={styles.meta}>{item.sku_name} · ×{item.quantity}</Text>{!isFulfillmentOrder(item) && <Text style={styles.meta}>预约 {formatServiceTime(item.service_starts_at)}</Text>}</View>
      <View style={styles.amount}><Text style={styles.meta}>{unpaid ? '待支付' : '买家实付'}</Text><Text style={styles.price}>{formatCent(unpaid ? item.payable_amount_cent : item.paid_amount_cent)}</Text></View>
    </Pressable>
    {notice ? <Text accessibilityRole="alert" style={styles.notice}>{notice}</Text> : null}
    <View style={styles.actions}>
      {actions.length > 3 && <Pressable accessibilityRole="button" accessibilityLabel="更多订单操作" accessibilityState={{ expanded: more }} onPress={() => setMore(value => !value)} style={styles.button}><Text style={styles.buttonText}>{more ? '收起' : '更多'}</Text></Pressable>}
      {(more ? actions : actions.slice(-3)).map(action => <Pressable key={action.code} accessibilityRole="button" accessibilityLabel={action.label} accessibilityState={{ busy, disabled: busy || !online }} disabled={busy || !online} onPress={() => run(action.code)} style={({ pressed }) => [styles.button, action.primary && styles.primary, (pressed || busy || !online) && styles.dim]}><Text style={[styles.buttonText, action.primary && styles.primaryText]}>{action.label}</Text></Pressable>)}
    </View>
  </View>;
}
const styles = StyleSheet.create({
  card: { padding: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.divider },
  head: { flexDirection: 'row', alignItems: 'center', gap: 8, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border, paddingBottom: 9 },
  seller: { flex: 1, minWidth: 0, minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 7 }, avatar: { width: 28, height: 28, borderRadius: 8 }, sellerName: { flexShrink: 1, fontSize: 15, fontWeight: '600', color: colors.text }, status: { maxWidth: '32%', fontSize: 12, color: colors.accent, fontWeight: '700' },
  product: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-start', gap: 8, paddingVertical: 10 }, cover: { width: 76, height: 76, borderRadius: 10 }, description: { flex: 1, minWidth: 100 }, title: { fontSize: 14, lineHeight: 21, fontWeight: '700', color: colors.text }, meta: { fontSize: 12, lineHeight: 18, color: colors.textSecondary, marginTop: 4 }, amount: { marginLeft: 'auto', alignItems: 'flex-end', maxWidth: '100%' }, price: { fontSize: 15, lineHeight: 23, color: colors.text, fontWeight: '700', flexShrink: 1 },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', flexWrap: 'wrap', gap: 8 }, button: { minHeight: 48, paddingHorizontal: 12, paddingVertical: 8, justifyContent: 'center', alignItems: 'center', borderRadius: 11, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.white }, buttonText: { fontSize: 12, lineHeight: 18, color: colors.text }, primary: { backgroundColor: colors.accent, borderColor: colors.accent }, primaryText: { color: colors.white, fontWeight: '700' }, dim: { opacity: .6 }, notice: { color: colors.danger, fontSize: 12, lineHeight: 18, paddingBottom: 8 }
});
