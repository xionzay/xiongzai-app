import { StyleSheet, View } from 'react-native';
import { colors } from '../theme';
export function TabIcon({ name, selected }: { name: 'home' | 'orders' | 'messages' | 'me'; selected: boolean }) {
  const color = selected ? colors.primary : colors.secondaryText;
  const stroke = { borderColor: color };
  return <View accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={[s.tile, selected && s.selected]}>
    <View style={s.icon}>
      {name === 'home' ? <><View style={[s.house, stroke]} /><View style={[s.roof, stroke]} /><View style={[s.door, stroke]} /></>
        : name === 'orders' ? <View style={[s.receipt, stroke]}>{[0, 1, 2].map(i => <View key={i} style={[s.line, { backgroundColor: color, width: i === 2 ? 7 : 11 }]} />)}</View>
        : name === 'messages' ? <><View style={[s.bubble, stroke]}>{[0, 1, 2].map(i => <View key={i} style={[s.dot, { backgroundColor: color }]} />)}</View><View style={[s.tail, stroke, { backgroundColor: selected ? '#E8F3FF' : colors.card }]} /></>
        : <><View style={[s.head, stroke]} /><View style={[s.shoulders, stroke]} /></>}
    </View>
  </View>;
}
const s = StyleSheet.create({
  tile: { width: 44, height: 32, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginBottom: 3 }, selected: { backgroundColor: '#E8F3FF' },
  icon: { width: 26, height: 26, alignItems: 'center', justifyContent: 'center' },
  house: { position: 'absolute', bottom: 2, width: 18, height: 15, borderWidth: 1.8, borderTopWidth: 0, borderBottomLeftRadius: 3, borderBottomRightRadius: 3 },
  roof: { position: 'absolute', top: 2, width: 16, height: 16, borderTopWidth: 1.8, borderLeftWidth: 1.8, transform: [{ rotate: '45deg' }], borderTopLeftRadius: 2 },
  door: { position: 'absolute', bottom: 2, width: 5, height: 8, borderWidth: 1.6, borderBottomWidth: 0, borderTopLeftRadius: 2, borderTopRightRadius: 2 },
  receipt: { width: 19, height: 23, borderWidth: 1.8, borderRadius: 4, alignItems: 'center', paddingTop: 5, gap: 4 }, line: { height: 1.6, borderRadius: 1, alignSelf: 'flex-start', marginLeft: 3 },
  bubble: { width: 24, height: 19, borderWidth: 1.8, borderRadius: 7, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 3 }, dot: { width: 2.5, height: 2.5, borderRadius: 2 }, tail: { position: 'absolute', bottom: 2, left: 5, width: 6, height: 6, borderLeftWidth: 1.8, borderBottomWidth: 1.8, transform: [{ skewY: '-30deg' }] },
  head: { position: 'absolute', top: 1, width: 10, height: 10, borderRadius: 5, borderWidth: 1.8 }, shoulders: { position: 'absolute', bottom: 1, width: 21, height: 11, borderWidth: 1.8, borderTopLeftRadius: 11, borderTopRightRadius: 11, borderBottomLeftRadius: 3, borderBottomRightRadius: 3 },
});
