import { useEffect, useState } from 'react';
import { AccessibilityInfo, Animated, Easing } from 'react-native';

/** Native equivalent of app/ui/cartoon.css toon-panel-in (180ms, 12px). */
export function usePanelEntrance() {
  const [progress] = useState(() => new Animated.Value(0));
  useEffect(() => {
    let active = true;
    let receivedChange = false;
    const apply = (reduced: boolean) => {
      if (!active) return;
      progress.stopAnimation();
      if (reduced) progress.setValue(1);
      else Animated.timing(progress, { toValue: 1, duration: 180, easing: Easing.bezier(.2, .7, .2, 1), useNativeDriver: true }).start();
    };
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', value => { receivedChange = true; apply(value); });
    void AccessibilityInfo.isReduceMotionEnabled().then(value => { if (!receivedChange) apply(value); }, () => apply(true));
    return () => { active = false; subscription.remove(); progress.stopAnimation(); };
  }, [progress]);
  return { opacity: progress, transform: [{ translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [12, 0] }) }] };
}
