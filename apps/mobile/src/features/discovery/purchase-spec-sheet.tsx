import { Animated, Modal, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { FileImage } from '@/components/file-image';
import { JellyIcon } from '@/components/jelly-icon';
import { PrimaryButton } from '@/components/primary-button';
import { colors } from '@/theme/tokens';
import { formatCent } from '@/utils/money';
import type { ServiceSkuApiView } from '@/types/api';
import { selectionSubtotal } from './purchase-selection';
import { usePanelEntrance } from '@/hooks/use-panel-entrance';

interface Props {
  title: string; seller: string; coverFileId?: string | null;
  skus: ServiceSkuApiView[]; selectedId?: string; quantity: number;
  onSelect(id: string): void; onQuantity?(quantity: number): void;
  onClose(): void; onConfirm(): void; blocked?: string;
}

/** Same hierarchy as app/PurchaseSpecSheet.tsx, with a native modal and safe area. */
export function PurchaseSpecSheet({ title, seller, coverFileId, skus, selectedId, quantity, onSelect, onQuantity, onClose, onConfirm, blocked }: Props) {
  const { height, width, fontScale } = useWindowDimensions();
  const entrance = usePanelEntrance();
  const selected = skus.find(sku => sku.id === selectedId) ?? skus[0];
  const compact = height < 550 || fontScale > 1.3;
  return <Modal transparent visible animationType="none" onRequestClose={onClose} statusBarTranslucent>
    <View style={styles.overlay}>
      <Pressable style={StyleSheet.absoluteFill} accessibilityRole="button" accessibilityLabel="关闭规格弹窗遮罩" onPress={onClose} />
      <Animated.View style={[styles.sheet, { maxHeight: height * .87 }, entrance]}>
      <SafeAreaView edges={['bottom', 'left', 'right']} style={styles.safe} accessibilityViewIsModal>
        <View style={styles.header}><Text accessibilityRole="header" style={styles.heading}>确认购买</Text><Pressable accessibilityRole="button" accessibilityLabel="关闭规格弹窗" onPress={onClose} style={styles.close}><JellyIcon kind="close" size={24} /></Pressable></View>
        <ScrollView style={styles.scroll} contentContainerStyle={styles.body}>
          <View style={styles.summary}>
            <FileImage fileId={coverFileId} style={{ width: compact ? 80 : Math.min(132, Math.max(112, width * .32)), aspectRatio: 1, borderRadius: 12 }} label={`${title}封面`} />
            <View style={styles.copy}><Text style={styles.price} accessibilityLiveRegion="polite">{selected ? formatCent(selected.price_cent) : '暂无有效规格'}</Text><Text style={styles.title}>{title}</Text><Text style={styles.note}>{seller}</Text><Text style={styles.note}>已选：{selected?.sku_name ?? '无'} · {quantity} 份</Text></View>
          </View>
          {skus.length > 1 ? <View style={styles.options}><Text style={styles.heading}>商品规格</Text>{skus.map(sku => <Pressable key={sku.id} accessibilityRole="radio" accessibilityLabel={`${sku.sku_name}，${formatCent(sku.price_cent)}`} accessibilityState={{ checked: sku.id === selected?.id }} onPress={() => onSelect(sku.id)} style={[styles.option, sku.id === selected?.id && styles.selected]}><Text style={styles.optionName}>{sku.sku_name}</Text><Text style={styles.optionPrice}>{formatCent(sku.price_cent)}</Text>{sku.id === selected?.id ? <View style={styles.selectedMark}><JellyIcon kind="check" size={14} /></View> : null}</Pressable>)}</View> : null}
          <View style={styles.quantity}><Text style={styles.quantityLabel}>购买数量</Text>{onQuantity ? <View style={styles.stepper}><Pressable accessibilityRole="button" accessibilityLabel="减少数量" disabled={quantity <= 1} onPress={() => { if (quantity > 1) onQuantity(quantity - 1); }} style={styles.step}><JellyIcon kind="minus" size={20} /></Pressable><Text accessibilityLiveRegion="polite" style={styles.count}>{quantity}</Text><Pressable accessibilityRole="button" accessibilityLabel="增加数量" disabled={quantity >= 20} onPress={() => { if (quantity < 20) onQuantity(quantity + 1); }} style={styles.step}><JellyIcon kind="plus" size={20} /></Pressable></View> : <Text style={styles.note}>1 份</Text>}</View>
          <Text style={styles.note}>商品内容与价格以所选规格为准；最终金额以服务端订单预览为准。</Text>
          {blocked ? <Text accessibilityRole="alert" style={styles.error}>{blocked}</Text> : null}
        </ScrollView>
        <View style={styles.footer}><PrimaryButton label={selected ? `确认订单 ${formatCent(selectionSubtotal(selected.price_cent, quantity))}` : '暂无可购买规格'} disabled={!selected || Boolean(blocked)} onPress={() => { if (selected && !blocked) onConfirm(); }} /></View>
      </SafeAreaView>
      </Animated.View>
    </View>
  </Modal>;
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(16,38,65,.48)' },
  sheet: { backgroundColor: colors.dialog, borderTopLeftRadius: 22, borderTopRightRadius: 22, overflow: 'hidden' },
  safe: { flexShrink: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingLeft: 16, paddingRight: 8, paddingVertical: 4, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.divider },
  heading: { fontSize: 16, fontWeight: '600', color: colors.text }, close: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  scroll: { flexShrink: 1 }, body: { padding: 16, gap: 16 }, summary: { flexDirection: 'row', gap: 12 }, copy: { flex: 1 },
  price: { fontSize: 30, lineHeight: 36, fontWeight: '700', color: colors.brand }, title: { fontSize: 15, lineHeight: 21, marginTop: 7, marginBottom: 5, color: colors.text },
  note: { fontSize: 12, lineHeight: 18, color: colors.textSecondary }, options: { gap: 8 },
  option: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 46, paddingVertical: 10, paddingHorizontal: 12, borderWidth: 1, borderColor: colors.controlBorder, borderRadius: 10, overflow: 'hidden', backgroundColor: colors.input },
  selected: { borderColor: colors.brand, backgroundColor: '#AFD8FC80' }, optionName: { flex: 1, fontSize: 14, lineHeight: 21, color: colors.text }, optionPrice: { fontSize: 14, color: colors.brand },
  selectedMark: { position: 'absolute', bottom: 0, right: 0, paddingHorizontal: 5, paddingVertical: 1, borderTopLeftRadius: 4, backgroundColor: colors.brand },
  quantity: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 10 }, quantityLabel: { fontSize: 14, color: colors.text }, stepper: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: colors.divider, borderRadius: 12, overflow: 'hidden' },
  step: { width: 44, minHeight: 44, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.input }, count: { minWidth: 42, textAlign: 'center', fontSize: 14, color: colors.text },
  footer: { padding: 16, paddingTop: 10, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.divider }, error: { fontSize: 13, lineHeight: 20, color: colors.danger }
});
