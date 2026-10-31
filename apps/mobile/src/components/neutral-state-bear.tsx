import { useEffect, useState } from 'react';
import { AccessibilityInfo, Image } from 'react-native';
import { useNavigation } from 'expo-router';
import { useAppActivity } from '@/hooks/use-app-activity';
import poster from '../../assets/bear-state-neutral/poster.png';
import animated from '../../assets/bear-state-neutral/animated.gif';

/** Exact approved 09-neutral artwork, not a newly generated mascot. */
export function NeutralStateBear({ size = 128 }: { size?: number }) {
  const navigation = useNavigation();
  const activity = useAppActivity();
  const [focused, setFocused] = useState(() => navigation.isFocused());
  const [reduced, setReduced] = useState(true);
  const [failure, setFailure] = useState<'none' | 'animation' | 'all'>('none');
  useEffect(() => {
    const focus = navigation.addListener('focus', () => setFocused(true));
    const blur = navigation.addListener('blur', () => setFocused(false));
    return () => { focus(); blur(); };
  }, [navigation]);
  useEffect(() => {
    let active = true, changed = false;
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', value => { changed = true; if (active) setReduced(value); });
    void AccessibilityInfo.isReduceMotionEnabled().then(value => { if (active && !changed) setReduced(value); }, () => {});
    return () => { active = false; subscription.remove(); };
  }, []);
  const moving = focused && activity === 'active' && !reduced && failure === 'none';
  if (failure === 'all') return null;
  return <Image source={moving ? animated : poster} resizeMode="contain" accessible={false} importantForAccessibility="no-hide-descendants" style={{ width: size, height: size, maxWidth: '100%', backgroundColor: '#FFFFFF' }} onError={() => setFailure(moving ? 'animation' : 'all')} />;
}
