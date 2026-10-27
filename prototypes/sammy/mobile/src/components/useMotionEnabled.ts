import { useEffect, useState } from 'react';
import { AccessibilityInfo, AppState } from 'react-native';

// Shared lifecycle boundary for decorative animation. Never animate while inactive.
export function useMotionEnabled() {
  const [reduceMotion, setReduceMotion] = useState(true);
  const [foreground, setForeground] = useState(AppState.currentState === 'active');
  useEffect(() => {
    let active = true;
    let changed = false;
    const motion = AccessibilityInfo.addEventListener('reduceMotionChanged', value => {
      changed = true;
      setReduceMotion(value);
    });
    AccessibilityInfo.isReduceMotionEnabled().then(value => {
      if (active && !changed) setReduceMotion(value);
    }).catch(() => {});
    const activity = AppState.addEventListener('change', state => setForeground(state === 'active'));
    return () => { active = false; motion.remove(); activity.remove(); };
  }, []);
  return !reduceMotion && foreground;
}
