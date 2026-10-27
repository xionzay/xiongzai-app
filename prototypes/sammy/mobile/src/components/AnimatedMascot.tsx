import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Image, StyleSheet, Text, View } from 'react-native';
import { useLanguage, type TranslationKey } from '../i18n/LanguageProvider';
import { colors } from '../theme';
import { useMotionEnabled } from './useMotionEnabled';
const expressionSheet = require('../../assets/mascot-expressions-transparent.png');

export type MascotMood = 'calm' | 'welcome' | 'waiting' | 'curious' | 'celebrate' | 'concerned';
const moodLabels: Record<MascotMood, TranslationKey> = {
  calm: 'mascotCalm', welcome: 'mascotWelcome', waiting: 'mascotWaiting',
  curious: 'mascotCurious', celebrate: 'mascotCelebrate', concerned: 'mascotConcerned',
};
export function AnimatedMascot({ label, size = 120, mood = 'calm' }: { label: string; size?: number; mood?: MascotMood }) {
  const { t } = useLanguage();
  const enabled = useMotionEnabled();
  const [failed, setFailed] = useState(false);
  const breathe = useRef(new Animated.Value(0)).current;
  const blink = useRef(new Animated.Value(0)).current;
  const smile = useRef(new Animated.Value(0)).current;
  const reaction = useRef(new Animated.Value(0)).current;
  const thought = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    breathe.setValue(0); blink.setValue(0); reaction.setValue(0); thought.setValue(0);
    // Keep the appropriate expression even with animation disabled.
    smile.setValue(mood === 'celebrate' ? 1 : 0);
    if (!enabled || failed) return;
    const timing = (value: Animated.Value, toValue: number, duration: number) => Animated.timing(value, { toValue, duration, easing: Easing.inOut(Easing.sin), useNativeDriver: true, isInteraction: false });
    const animations: Animated.CompositeAnimation[] = [
      Animated.loop(Animated.sequence([timing(breathe, 1, 2400), timing(breathe, 0, 2400)])),
      Animated.loop(Animated.sequence([Animated.delay(mood === 'waiting' ? 4200 : 3100), timing(blink, 1, 80), Animated.delay(40), timing(blink, 0, 180)])),
    ];
    if (mood === 'calm' || mood === 'welcome') {
      animations.push(Animated.loop(Animated.sequence([
        Animated.delay(mood === 'welcome' ? 1500 : 7000), timing(smile, 1, 420), Animated.delay(900), timing(smile, 0, 550), Animated.delay(4500),
      ])));
    }
    if (mood === 'welcome') {
      animations.push(Animated.loop(Animated.sequence([
        timing(reaction, -1, 900), timing(reaction, 1, 1300), timing(reaction, 0, 1000), Animated.delay(4500),
      ])));
    } else if (mood === 'curious') {
      animations.push(Animated.loop(Animated.sequence([
        timing(reaction, -1, 1100), Animated.delay(900), timing(reaction, 1, 1700), Animated.delay(900), timing(reaction, 0, 1100), Animated.delay(2000),
      ])));
    } else if (mood === 'celebrate') {
      // One small celebratory hop on success, followed by calm breathing.
      animations.push(Animated.sequence([timing(reaction, 1, 450), timing(reaction, 0, 650)]));
    } else if (mood === 'concerned') {
      animations.push(timing(reaction, -0.5, 650));
    }
    if (mood === 'waiting' || mood === 'celebrate') {
      animations.push(Animated.loop(Animated.sequence([timing(thought, 1, 1600), timing(thought, 0, 1600)])));
    }
    animations.forEach(animation => animation.start());
    return () => { animations.forEach(animation => animation.stop()); };
  }, [enabled, failed, mood, breathe, blink, smile, reaction, thought]);
  const tilt = mood === 'curious' ? 7 : mood === 'welcome' ? 4 : mood === 'concerned' ? 5 : 0;
  return <View accessible accessibilityRole="image" accessibilityLabel={`${label}. ${t(moodLabels[mood])}`}
    style={{ width: size, height: size, alignSelf: 'center' }}>
    <Animated.View style={{ width: size, height: size, transform: [
      { translateY: Animated.add(breathe.interpolate({ inputRange: [0, 1], outputRange: [1, -3] }), reaction.interpolate({ inputRange: [-1, 0, 1], outputRange: mood === 'celebrate' ? [0, 0, -8] : [0, 0, 0] })) },
      { rotate: reaction.interpolate({ inputRange: [-1, 0, 1], outputRange: [`-${tilt}deg`, '0deg', `${tilt}deg`] }) },
      { scale: breathe.interpolate({ inputRange: [0, 1], outputRange: [1, 1.02] }) },
    ] }}>
      {failed ? <Image source={require('../../assets/mascot.png')} style={{ width: size, height: size }} /> : <>
        <ExpressionCell frame={0} size={size} onError={() => setFailed(true)} />
        <Animated.View style={[StyleSheet.absoluteFill, { opacity: blink }]}><ExpressionCell frame={1} size={size} /></Animated.View>
        <Animated.View style={[StyleSheet.absoluteFill, { opacity: smile }]}><ExpressionCell frame={2} size={size} /></Animated.View>
      </>}
    </Animated.View>
    {(mood === 'waiting' || mood === 'curious' || mood === 'concerned') &&
      <View pointerEvents="none" accessible={false} importantForAccessibility="no-hide-descendants" style={styles.bubble}>
        {mood === 'waiting' ? <View style={styles.dots}>{[0, 1, 2].map(index => <Animated.View key={index} style={[styles.dot, { transform: [{ translateY: thought.interpolate({
          inputRange: [0, 0.33, 0.66, 1], outputRange: index === 0 ? [0, -2, 0, 0] : index === 1 ? [0, 0, -2, 0] : [-2, 0, 0, -2],
        }) }] }]} />)}</View> : <Text style={styles.symbol}>{mood === 'curious' ? '?' : '!'}</Text>}
      </View>}
    {mood === 'celebrate' && <Animated.View pointerEvents="none" accessible={false} importantForAccessibility="no-hide-descendants" style={[StyleSheet.absoluteFill, { opacity: thought.interpolate({ inputRange: [0, 1], outputRange: [0.5, 1] }) }]}>
      <Text style={[styles.sparkle, { left: -3, top: 14 }]}>✦</Text><Text style={[styles.sparkle, { right: -4, top: 2, fontSize: 17 }]}>✧</Text>
    </Animated.View>}
  </View>;
}
function ExpressionCell({ frame, size, onError }: { frame: number; size: number; onError?: () => void }) {
  return <View style={{ width: size, height: size, overflow: 'hidden' }}><Image source={expressionSheet} resizeMode="stretch" onError={onError} style={{ width: size * 3, height: size, position: 'absolute', left: -frame * size, top: 0 }} /></View>;
}
const styles = StyleSheet.create({
  bubble: { position: 'absolute', right: -9, top: 0, width: 34, height: 30, borderRadius: 12, borderBottomLeftRadius: 3, borderWidth: 1.5, borderColor: '#B7D9F9', backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center' },
  dots: { flexDirection: 'row', gap: 3 }, dot: { width: 4, height: 4, borderRadius: 2, backgroundColor: colors.secondaryText },
  symbol: { color: colors.secondaryText, fontSize: 18, lineHeight: 23, fontWeight: '700' },
  sparkle: { position: 'absolute', color: '#C48B22', fontSize: 22, lineHeight: 27 },
});
