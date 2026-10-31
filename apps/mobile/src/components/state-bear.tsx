import { useCallback, useContext, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { AccessibilityInfo, Image, View, useWindowDimensions } from 'react-native';
import { NavigationContext } from 'expo-router/react-navigation';
import { useAppActivity } from '@/hooks/use-app-activity';
import loadingPoster from '../../assets/bear-states/01-loading.png';
import loadingAnimation from '../../assets/bear-states/01-loading.gif';
import errorPoster from '../../assets/bear-states/02-error.png';
import errorAnimation from '../../assets/bear-states/02-error.gif';
import emptyPoster from '../../assets/bear-states/04-empty.png';
import emptyAnimation from '../../assets/bear-states/04-empty.gif';
import offlinePoster from '../../assets/bear-states/05-offline.png';
import offlineAnimation from '../../assets/bear-states/05-offline.gif';
import successPoster from '../../assets/bear-states/03-success.png';
import successAnimation from '../../assets/bear-states/03-success.gif';
import waitingPoster from '../../assets/bear-states/06-waiting.png';
import waitingAnimation from '../../assets/bear-states/06-waiting.gif';
import neutralPoster from '../../assets/bear-state-neutral/poster.png';
import neutralAnimation from '../../assets/bear-state-neutral/animated.gif';

const artwork = {
  loading: { poster: loadingPoster, animation: loadingAnimation },
  error: { poster: errorPoster, animation: errorAnimation },
  empty: { poster: emptyPoster, animation: emptyAnimation },
  offline: { poster: offlinePoster, animation: offlineAnimation },
  success: { poster: successPoster, animation: successAnimation },
  waiting: { poster: waitingPoster, animation: waitingAnimation },
  neutral: { poster: neutralPoster, animation: neutralAnimation },
};
export type BearStateKind = keyof typeof artwork;

/** Same V3 artwork as the Web design. State changes create a fresh decoder/fallback session. */
export function StateBear({ kind, size = 160 }: { kind: BearStateKind; size?: number }) {
  return <StateBearSession key={kind} kind={kind} size={size} />;
}

function StateBearSession({ kind, size }: { kind: BearStateKind; size: number }) {
  // Optional context: startup/error boundaries outside a navigator stay safely static.
  const navigation = useContext(NavigationContext);
  const subscribe = useCallback((changed: () => void) => {
    if (!navigation) return () => {};
    const focus = navigation.addListener('focus', changed);
    const blur = navigation.addListener('blur', changed);
    return () => { focus(); blur(); };
  }, [navigation]);
  const snapshot = useCallback(() => navigation?.isFocused() ?? false, [navigation]);
  const focused = useSyncExternalStore(subscribe, snapshot, () => false);
  const activity = useAppActivity();
  const { width, height } = useWindowDimensions();
  const host = useRef<View>(null);
  const [reduced, setReduced] = useState(true);
  const [visible, setVisible] = useState(false);
  const [failure, setFailure] = useState<'none' | 'animation' | 'all'>('none');
  useEffect(() => {
    let active = true, changed = false;
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', value => { changed = true; if (active) setReduced(value); });
    void AccessibilityInfo.isReduceMotionEnabled().then(value => { if (active && !changed) setReduced(value); }, () => {});
    return () => { active = false; subscription.remove(); };
  }, []);
  const eligible = focused && activity === 'active' && !reduced && failure === 'none';
  useEffect(() => {
    if (!eligible) return;
    let active = true;
    const measure = () => host.current?.measureInWindow((x, y, w, h) => {
      if (active) setVisible(w > 0 && h > 0 && x < width && y < height && x + w > 0 && y + h > 0);
    });
    measure();
    // Low-frequency visibility checks also catch scrolling in a parent ScrollView.
    // No polling in background, on unfocused routes, or with reduced motion.
    const timer = setInterval(measure, 500);
    return () => { active = false; clearInterval(timer); };
  }, [eligible, width, height]);
  const moving = eligible && visible;
  if (failure === 'all') return null;
  return <View ref={host} collapsable={false} style={{ width: size, maxWidth: '100%', aspectRatio: 1, backgroundColor: '#FFFFFF' }}>
    <Image source={moving ? artwork[kind].animation : artwork[kind].poster} resizeMode="contain" accessible={false} importantForAccessibility="no-hide-descendants" style={{ width: '100%', height: '100%' }} onError={() => setFailure(moving ? 'animation' : 'all')} />
  </View>;
}
