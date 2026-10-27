import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { AccessibilityInfo, Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLanguage, type TranslationKey } from '../i18n/LanguageProvider';
import { useMotionEnabled } from './useMotionEnabled';

type Notice = { id: number; key: TranslationKey; kind: 'success' | 'error' | 'info' };
const Context = createContext<{ notice: Notice | null; notify: (key: TranslationKey, kind?: Notice['kind']) => void; dismiss: () => void } | null>(null);
export function NotificationProvider({ children }: { children: ReactNode }) {
  const [notice, setNotice] = useState<Notice | null>(null);
  const sequence = useRef(0);
  const { t } = useLanguage();
  const notify = useCallback((key: TranslationKey, kind: Notice['kind'] = 'success') => {
    setNotice({ id: ++sequence.current, key, kind });
  }, []);
  const dismiss = useCallback(() => setNotice(null), []);
  useEffect(() => {
    if (!notice) return;
    AccessibilityInfo.announceForAccessibility(t(notice.key));
    const timer = setTimeout(dismiss, notice.kind === 'error' ? 6500 : 4500);
    return () => clearTimeout(timer);
  }, [notice, t, dismiss]);
  return <Context.Provider value={{ notice, notify, dismiss }}>{children}</Context.Provider>;
}
export function useNotifications() {
  const context = useContext(Context);
  if (!context) throw new Error('NotificationProvider is required');
  return context;
}
export function NotificationHost() {
  const { notice, dismiss } = useNotifications();
  const { t } = useLanguage();
  const insets = useSafeAreaInsets();
  const motion = useMotionEnabled();
  const progress = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    progress.stopAnimation();
    progress.setValue(motion ? 0 : 1);
    if (!notice || !motion) return;
    const animation = Animated.timing(progress, { toValue: 1, duration: 220, useNativeDriver: true });
    animation.start();
    return () => animation.stop();
  }, [notice?.id, motion, progress]);
  if (!notice) return null;
  return <View pointerEvents="box-none" style={[s.host, { top: insets.top + 10 }]}>
    <Animated.View style={[s.toast, notice.kind === 'error' ? s.error : notice.kind === 'info' ? s.info : s.success, { opacity: progress, transform: [{ translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [-14, 0] }) }] }]}>
      <Text accessible={false} style={s.icon}>{notice.kind === 'error' ? '!' : notice.kind === 'info' ? 'i' : '✓'}</Text>
      <Text style={s.message}>{t(notice.key)}</Text>
      <Pressable onPress={dismiss} accessibilityRole="button" accessibilityLabel={t('close')} style={s.close}><Text style={s.icon}>×</Text></Pressable>
    </Animated.View>
  </View>;
}
const s = StyleSheet.create({
  host: { position: 'absolute', left: 16, right: 16, zIndex: 1000, elevation: 20 },
  toast: { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 18, paddingLeft: 16, paddingVertical: 4, shadowColor: '#032E65', shadowOpacity: 0.16, shadowRadius: 12, shadowOffset: { width: 0, height: 5 }, elevation: 8 },
  success: { backgroundColor: '#145C49' }, error: { backgroundColor: '#9D292E' }, info: { backgroundColor: '#073572' },
  icon: { color: '#FFFFFF', fontSize: 22, fontWeight: '700' }, message: { flex: 1, color: '#FFFFFF', fontSize: 14, lineHeight: 21, fontWeight: '600', paddingVertical: 9 },
  close: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
});
