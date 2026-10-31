import { Image, StyleSheet, View } from 'react-native';
import wallpaper from '../../../../public/assets/wallpapers/chat-dense-blue-v3.png';
import overlay from '../../assets/chat-controls/wallpaper-overlay.png';
/** Same V3 line-art as the approved Web. Decorative, viewport-bound, never scroll-stretched. */
export function ChatBackdrop() {
  return <View pointerEvents="none" accessible={false} importantForAccessibility="no-hide-descendants" style={[StyleSheet.absoluteFill, styles.canvas]}>
    <Image source={wallpaper} resizeMode="cover" style={[StyleSheet.absoluteFill, styles.image]} accessible={false} />
    <Image source={overlay} resizeMode="stretch" style={[StyleSheet.absoluteFill, styles.image]} accessible={false} />
  </View>;
}
const styles = StyleSheet.create({ canvas: { backgroundColor: '#EDF7FF' }, image: { width: '100%', height: '100%' } });
