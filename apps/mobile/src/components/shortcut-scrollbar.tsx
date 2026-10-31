import { View, StyleSheet } from 'react-native';

export function scrollProgress(offset: number, content: number, viewport: number) {
  return content > viewport ? Math.max(0, Math.min(1, offset / (content - viewport))) : 0;
}

/** Small visual track, generous gesture target; synchronized with the actual list offset. */
export function ShortcutScrollbar({ progress, onChange }: { progress: number; onChange(value: number): void }) {
  const seek = (x: number) => onChange(Math.max(0, Math.min(1, (x - 23) / 18)));
  return <View accessibilityRole="adjustable" accessibilityLabel="订单入口滑动条" accessibilityValue={{ min: 0, max: 100, now: Math.round(progress * 100) }}
    accessibilityActions={[{ name: 'increment', label: '后面的订单入口' }, { name: 'decrement', label: '前面的订单入口' }]}
    onAccessibilityAction={event => onChange(Math.max(0, Math.min(1, progress + (event.nativeEvent.actionName === 'increment' ? 0.5 : -0.5))))}
    onStartShouldSetResponder={() => true} onMoveShouldSetResponder={() => true}
    onResponderGrant={event => seek(event.nativeEvent.locationX)} onResponderMove={event => seek(event.nativeEvent.locationX)} style={styles.touch}>
    <View pointerEvents="none" style={styles.track}><View style={[styles.thumb, { transform: [{ translateX: progress * 18 }] }]} /></View>
  </View>;
}
const styles = StyleSheet.create({ touch: { width: 64, minHeight: 44, alignSelf: 'center', justifyContent: 'center' }, track: { height: 3, borderRadius: 9, backgroundColor: '#c3e5f7' }, thumb: { height: 3, width: 46, borderRadius: 9, backgroundColor: '#2698ec' } });
