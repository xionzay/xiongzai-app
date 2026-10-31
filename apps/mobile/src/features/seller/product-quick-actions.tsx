import { useEffect, useRef, useState, type ReactNode } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { ApiClientError, userFacingError } from '@/api/api-error';
import { FormField } from '@/components/form-field';
import { PrimaryButton } from '@/components/primary-button';
import { StateView } from '@/components/state-view';
import { queryClient } from '@/query/query-client';
import { colors } from '@/theme/tokens';
import type { SellerServiceApiView, ServiceSkuApiView } from '@/types/api';
import { useSellerService, updateSellerSku } from './seller-api';
import { centToYuanInput, sellerBuyerCacheKeys, sellerServiceActions, yuanToCent } from './seller-domain';
import { merchantStyles } from './merchant-page';

export function productEditRestriction(status: SellerServiceApiView['status']) {
  if (sellerServiceActions(status).includes('EDIT')) return null;
  return status === 'ON_SALE' ? '在售商品需先下架，才能修改价格和资料。' : '当前商品状态不允许编辑，请查看审核详情。';
}

export function ProductQuickActions({ item }: { item: SellerServiceApiView }) {
  const [panel, setPanel] = useState<'more' | 'price' | null>(null);
  const restriction = productEditRestriction(item.status);
  const openEditor = () => { setPanel(null); router.push({ pathname: '/seller/services/[id]/edit', params: { id: item.id } }); };
  return <>
    <View style={styles.actions}>
      <Pressable accessibilityRole="button" accessibilityLabel={`更多商品操作：${item.title}`} onPress={() => setPanel('more')} style={({ pressed }) => [merchantStyles.button, styles.more, pressed && styles.pressed]}><Text style={merchantStyles.buttonText}>更多</Text></Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel={`改价：${item.title}`} accessibilityHint={restriction ?? '选择规格后修改价格'} disabled={Boolean(restriction)} onPress={() => setPanel('price')} style={({ pressed }) => [merchantStyles.button, restriction && styles.disabled, pressed && styles.pressed]}><Text style={merchantStyles.buttonText}>改价</Text></Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel="改名额，暂未开放" disabled style={[merchantStyles.button, styles.disabled]}><Text style={merchantStyles.buttonText}>改名额</Text></Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel={`编辑商品：${item.title}`} accessibilityHint={restriction ?? undefined} disabled={Boolean(restriction)} onPress={openEditor} style={({ pressed }) => [merchantStyles.button, restriction && styles.disabled, pressed && styles.pressed]}><Text style={merchantStyles.buttonText}>编辑</Text></Pressable>
    </View>
    {restriction ? <Text style={styles.note}>{restriction}从“更多”查看或管理。</Text> : null}
    <Text style={styles.note}>名额管理暂未开放，不影响当前预约校验。</Text>
    {panel === 'more' ? <ProductActionSheet title="商品操作" onClose={() => setPanel(null)}>
      <Text style={styles.productTitle}>{item.title}</Text>
      <PrimaryButton tone="plain" label="查看商品资料" onPress={openEditor} />
      {sellerServiceActions(item.status).includes('VIEW_REVIEW') ? <PrimaryButton tone="plain" label="审核详情" onPress={() => { setPanel(null); router.push({ pathname: '/seller/services/[id]/review', params: { id: item.id } }); }} /> : null}
      {sellerServiceActions(item.status).includes('OFF_SALE') ? <PrimaryButton tone="plain" label="管理下架" onPress={openEditor} /> : null}
      {sellerServiceActions(item.status).includes('DELETE') ? <PrimaryButton tone="plain" label="管理删除" onPress={openEditor} /> : null}
      <Text style={styles.note}>下架、删除仍需在管理页确认；修改后需按真实状态重新审核。</Text>
    </ProductActionSheet> : null}
    {panel === 'price' ? <ProductActionSheet title="修改价格" onClose={() => setPanel(null)}><ProductPriceEditor id={item.id} /></ProductActionSheet> : null}
  </>;
}

export function ProductActionSheet({ title, onClose, children }: { title: string; onClose(): void; children: ReactNode }) {
  return <Modal transparent animationType="fade" onRequestClose={onClose}>
    <SafeAreaView style={styles.overlay}>
      <KeyboardAvoidingView style={styles.sheetArea} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <View accessibilityViewIsModal style={styles.sheet}>
          <View style={styles.heading}><Text accessibilityRole="header" style={styles.sheetTitle}>{title}</Text><Pressable accessibilityRole="button" accessibilityLabel="关闭商品操作" style={merchantStyles.iconButton} onPress={onClose}><Text style={styles.link}>关闭</Text></Pressable></View>
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.sheetContent}>{children}</ScrollView>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  </Modal>;
}

function ProductPriceEditor({ id }: { id: string }) {
  const query = useSellerService(id);
  const [notice, setNotice] = useState('');
  if (query.isPending) return <StateView kind="loading" />;
  if (query.isError || !query.data) return <StateView kind="error" onRetry={() => void query.refetch()} />;
  const product = query.data;
  const restriction = productEditRestriction(product.status);
  if (restriction) return <Text accessibilityRole="alert" style={styles.note}>{restriction}</Text>;
  const skus = product.skus.filter(sku => sku.status !== 'DELETED');
  return <>
    <Text style={styles.note}>每次只保存一个规格，保存结果以服务端为准；不会直接上架。</Text>
    {notice ? <Text accessibilityRole="alert" style={styles.note}>{notice}</Text> : null}
    {skus.length ? skus.map(sku => <SkuPriceField key={`${sku.id}:${sku.version}`} sku={sku} sellerId={product.seller_id} onConflict={() => setNotice('规格已在其他设备更新，请核对重新读取的价格后再保存。')} refresh={() => query.refetch()} />) : <Text style={styles.note}>暂无规格，请先在编辑页添加规格。</Text>}
  </>;
}

export function SkuPriceField({ sku, sellerId, refresh, onConflict }: { sku: ServiceSkuApiView; sellerId: string; refresh(): Promise<unknown>; onConflict(): void }) {
  const [value, setValue] = useState(() => centToYuanInput(sku.price_cent));
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [saved, setSaved] = useState(false);
  const inFlight = useRef(false), completed = useRef(false), mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const save = async () => {
    if (!mounted.current || inFlight.current || completed.current) return;
    const cents = yuanToCent(value);
    if (!cents || BigInt(cents) < 1n || BigInt(cents) > 9223372036854775807n) { setNotice('请输入大于 0 且最多两位小数的有效价格。'); return; }
    inFlight.current = true; setBusy(true); setNotice('');
    try {
      await updateSellerSku(sku.product_id, sku.id, { version: sku.version, price_cent: cents });
      completed.current = true;
      if (mounted.current) { setSaved(true); setNotice('价格已保存。'); }
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['seller-services'] }),
        queryClient.invalidateQueries({ queryKey: ['seller-service', sku.product_id] }),
        ...sellerBuyerCacheKeys(sellerId, sku.product_id).map(queryKey => queryClient.invalidateQueries({ queryKey }))
      ]);
      await refresh();
    } catch (error) {
      if (error instanceof ApiClientError && error.code === 'RESOURCE_VERSION_CONFLICT') {
        if (mounted.current) { setNotice('规格已更新，请重新核对最新价格后保存。'); onConflict(); }
        await refresh().catch(() => undefined);
      } else if (mounted.current) setNotice(completed.current ? '价格已保存，但列表同步失败。请关闭后重新加载，不要重复保存。' : userFacingError(error));
    } finally { inFlight.current = false; if (mounted.current) setBusy(false); }
  };
  return <View style={styles.priceRow}>
    <FormField label={`${sku.sku_name}价格（元）`} keyboardType="decimal-pad" maxLength={22} value={value} onChangeText={setValue} editable={!busy && !saved} />
    <PrimaryButton label={saved ? '已保存' : '保存价格'} loading={busy} disabled={busy || saved} onPress={() => void save()} />
    {notice ? <Text accessibilityRole="alert" style={styles.note}>{notice}</Text> : null}
  </View>;
}

const styles = StyleSheet.create({
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center' }, more: { marginRight: 'auto' },
  disabled: { opacity: 0.45 }, pressed: { opacity: 0.7 }, note: { color: colors.textSecondary, fontSize: 12, lineHeight: 18 },
  overlay: { flex: 1, backgroundColor: 'rgba(21,45,83,0.35)', justifyContent: 'flex-end' }, sheetArea: { maxHeight: '90%' },
  sheet: { backgroundColor: colors.dialog, borderTopLeftRadius: 18, borderTopRightRadius: 18, padding: 16, maxHeight: '100%' },
  heading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }, sheetTitle: { color: colors.text, fontSize: 18, fontWeight: '600', flex: 1 },
  sheetContent: { gap: 12, paddingBottom: 16 }, productTitle: { color: colors.text, fontSize: 15 }, link: { color: colors.brandDeep, fontSize: 14 },
  priceRow: { gap: 8, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.divider }
});
