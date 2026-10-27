import { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';
import { useMotionEnabled } from './useMotionEnabled';

// Layered website artwork; native transforms keep movement off the JS render loop.
export function SkyBackdrop({ profile = false }: { profile?: boolean }) {
  const enabled = useMotionEnabled();
  const drift = useRef(new Animated.Value(0)).current;
  const float = useRef(new Animated.Value(0)).current;
  const twinkle = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    drift.setValue(0); float.setValue(0); twinkle.setValue(0);
    if (!enabled) return;
    const sway = (value: Animated.Value, duration: number) => Animated.loop(Animated.sequence([
      Animated.timing(value, { toValue: 1, duration, easing: Easing.inOut(Easing.sin), useNativeDriver: true, isInteraction: false }),
      Animated.timing(value, { toValue: 0, duration, easing: Easing.inOut(Easing.sin), useNativeDriver: true, isInteraction: false }),
    ]));
    const loops = [sway(drift, profile ? 8500 : 17000), sway(float, 4400), sway(twinkle, 2300)];
    loops.forEach(loop => loop.start());
    return () => loops.forEach(loop => loop.stop());
  }, [enabled, drift, float, twinkle, profile]);
  return <View pointerEvents="none" accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={StyleSheet.absoluteFill}>
    <Animated.Image source={require('../../assets/cloud-world.webp')} resizeMode="cover" style={[styles.world, profile && { transform: [
      { scale: 1.12 },
      { translateX: drift.interpolate({ inputRange: [0, 1], outputRange: [-18, 18] }) },
      { translateY: float.interpolate({ inputRange: [0, 1], outputRange: [0, -8] }) },
    ] }]} />
    <View style={styles.wash} />
    <View style={styles.fade}>{Array.from({ length: 24 }, (_, index) => <View key={index} style={{ flex: 1, backgroundColor: `rgba(248,252,255,${index / 23})` }} />)}</View>
    <Animated.Image source={require('../../assets/cloud-bank.webp')} resizeMode="contain" style={[styles.farCloud, { transform: [{ translateX: drift.interpolate({ inputRange: [0, 1], outputRange: [-35, 35] }) }] }]} />
    <Animated.Image source={require('../../assets/floating-island.webp')} resizeMode="contain" style={[styles.island, { transform: [{ translateY: float.interpolate({ inputRange: [0, 1], outputRange: [0, -10] }) }, { rotate: float.interpolate({ inputRange: [0, 1], outputRange: ['-2deg', '2deg'] }) }] }]} />
    <Animated.Image source={require('../../assets/cloud-bank.webp')} resizeMode="contain" style={[styles.nearCloud, { transform: [{ translateX: drift.interpolate({ inputRange: [0, 1], outputRange: [25, -30] }) }] }]} />
    <Animated.Image source={require('../../assets/star-gold.webp')} style={[styles.starGold, { opacity: twinkle.interpolate({ inputRange: [0, 1], outputRange: [0.55, 1] }), transform: [{ rotate: float.interpolate({ inputRange: [0, 1], outputRange: ['-12deg', '10deg'] }) }] }]} />
    <Animated.Image source={require('../../assets/star-cyan.webp')} style={[styles.starCyan, { opacity: twinkle.interpolate({ inputRange: [0, 1], outputRange: [1, 0.5] }), transform: [{ translateY: float.interpolate({ inputRange: [0, 1], outputRange: [-4, 4] }) }] }]} />
    <View style={styles.orbit} /><View style={styles.bubble} />
  </View>;
}
const styles = StyleSheet.create({
  world: { position: 'absolute', top: 0, width: '100%', height: 550, opacity: 0.7 },
  wash: { position: 'absolute', top: 0, width: '100%', height: 550, backgroundColor: 'rgba(235,247,255,0.24)' },
  fade: { position: 'absolute', top: 200, width: '100%', height: 350 },
  farCloud: { position: 'absolute', top: 55, left: -90, width: 340, height: 110, opacity: 0.65 },
  nearCloud: { position: 'absolute', top: 340, left: -100, width: 520, height: 170, opacity: 0.5 },
  island: { position: 'absolute', top: 210, right: -20, width: 165, height: 165, opacity: 0.65 },
  starGold: { position: 'absolute', top: 95, left: 13, width: 33, height: 33 },
  starCyan: { position: 'absolute', top: 360, right: 7, width: 32, height: 32 },
  orbit: { position: 'absolute', top: 180, right: -30, width: 145, height: 145, borderRadius: 73, borderWidth: 1, borderColor: 'rgba(255,255,255,0.6)', transform: [{ scaleY: 0.5 }, { rotate: '-28deg' }] },
  bubble: { position: 'absolute', top: 75, right: 85, width: 16, height: 16, borderRadius: 8, borderWidth: 1, borderColor: 'rgba(255,255,255,0.85)', backgroundColor: 'rgba(255,255,255,0.2)' },
});
