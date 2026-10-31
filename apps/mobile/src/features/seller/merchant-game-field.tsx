import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { productGames, productGameLabels, type ProductGame } from '@xiongzai/contracts/commerce';
import { ApprovedIllustration } from '@/components/approved-illustration';
import { merchantStyles } from './merchant-page';
import { colors } from '@/theme/tokens';

export function MerchantGameField({ value, onChange, disabled = false }: { value: ProductGame; onChange: (value: ProductGame) => void; disabled?: boolean }) {
  const [expanded, setExpanded] = useState(false);
  return <View><Pressable accessibilityRole="button" accessibilityLabel="游戏分类" accessibilityState={{ expanded, disabled }} disabled={disabled} onPress={() => setExpanded(open => !open)} style={styles.row}><Text style={merchantStyles.sectionTitle}>游戏分类</Text><Text style={styles.value}>{productGameLabels[value]}</Text><ApprovedIllustration kind="chevron" size={16} /></Pressable>
    {expanded ? <View>{productGames.map(game => <Pressable key={game} accessibilityRole="radio" accessibilityLabel={productGameLabels[game]} accessibilityState={{ checked: game === value, disabled }} disabled={disabled} onPress={() => { onChange(game); setExpanded(false); }} style={styles.row}><Text style={styles.label}>{productGameLabels[game]}</Text>{game === value ? <ApprovedIllustration kind="check" size={20} /> : null}</Pressable>)}</View> : null}
  </View>;
}
const styles = StyleSheet.create({ row: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 48 }, value: { flex: 1, textAlign: 'right', color: colors.text, fontSize: 14 }, label: { flex: 1, color: colors.text, fontSize: 14 } });
