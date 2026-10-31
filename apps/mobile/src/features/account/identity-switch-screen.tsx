import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/auth/auth-provider';
import { apiClient } from '@/auth/runtime';
import { ApiClientError } from '@/api/api-error';
import { BrandBackdrop } from '@/components/brand-backdrop';
import { NativeHeader } from '@/components/native-page';
import { ApprovedIllustration } from '@/components/approved-illustration';
import { colors } from '@/theme/tokens';
import type { SellerProfileApiView } from '@/types/api';
import { useSellerProfile } from '@/features/seller/seller-api';
import { identitySwitchPresentation, identitySwitchTarget } from './identity-switch-domain';
import mascot from '../../../assets/xiongzai-icon.png';

export function IdentitySwitchScreen() {
  const { role: rawRole } = useLocalSearchParams<{ role?: string }>();
  const role = rawRole === 'seller' ? 'seller' : 'buyer';
  const { user } = useAuth();
  const userId = user?.id;
  const queryClient = useQueryClient();
  const profile = useSellerProfile(Boolean(user) && role === 'buyer');
  const refetch = profile.refetch;
  useFocusEffect(useCallback(() => {
    if (userId && role === 'buyer') void refetch();
  }, [userId, role, refetch]));
  const pending = useRef<AbortController | null>(null);
  const scope = `${userId ?? 'guest'}:${role}`;
  const [operation, setOperation] = useState({ scope, busy: false, error: '' });
  const busy = operation.scope === scope && operation.busy;
  const error = operation.scope === scope ? operation.error : '';
  useEffect(() => () => { pending.current?.abort(); pending.current = null; }, [userId, role]);
  const notApplied = profile.error instanceof ApiClientError && profile.error.code === 'SELLER_NOT_FOUND';
  const loading = Boolean(user) && role === 'buyer' && profile.isPending;
  const unavailable = Boolean(user) && role === 'buyer' && profile.isError && !notApplied;
  const presentation = identitySwitchPresentation(role, notApplied ? null : profile.data ?? null);
  const label = !user ? '登录后申请入驻或切换身份' : loading ? '正在读取入驻状态…' : unavailable ? '重新读取入驻状态' : presentation.label;
  const change = async () => {
    if (pending.current) return;
    if (!user) { router.push({ pathname: '/(auth)/required', params: { returnTo: '/settings/switch-identity', action: '申请入驻或切换身份' } }); return; }
    const controller = new AbortController(); pending.current = controller;
    setOperation({ scope, busy: true, error: '' });
    try {
      let seller: SellerProfileApiView | null = null;
      if (role === 'buyer') {
        try { seller = await apiClient.request<SellerProfileApiView>('/seller/profile', { signal: controller.signal }); }
        catch (cause) { if (!(cause instanceof ApiClientError && cause.code === 'SELLER_NOT_FOUND')) throw cause; }
      }
      if (!controller.signal.aborted) {
        if (seller) queryClient.setQueryData(['seller-profile'], seller);
        const target = identitySwitchTarget(role, seller);
        // Only approved sellers switch tab groups. Applications stay in the settings stack.
        if (target === '/(seller-tabs)' || target === '/(buyer-tabs)') router.dismissTo(target);
        else router.push(target);
        setOperation({ scope, busy: false, error: '' });
      }
    } catch { if (!controller.signal.aborted) setOperation({ scope, busy: false, error: '暂时无法读取身份状态，请重试。' }); }
    finally { if (!controller.signal.aborted) pending.current = null; }
  };
  return <SafeAreaView style={styles.safe}><BrandBackdrop seller={role === 'seller'} /><NativeHeader title="切换身份" subtitle="" />
    <ScrollView contentContainerStyle={styles.content}>
      <View style={styles.art}><Image source={mascot} style={styles.mascot} accessibilityLabel="熊崽电竞" /><View style={styles.badge}><ApprovedIllustration kind={role === 'buyer' ? 'home' : 'product'} size={64} /></View></View>
      <Text style={styles.title}>你当前的身份是“{role === 'buyer' ? '买家' : '卖家'}”</Text>
      <Text style={styles.copy}>{role === 'buyer' ? '找陪玩、下单，管理你的购买订单' : '管理服务、处理订单，查看经营收益'}</Text>
      <View style={styles.action}><Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ busy: busy || loading, disabled: busy || loading }} disabled={busy || loading} onPress={() => void change()} style={({ pressed }) => [buttonStyles.pill, (pressed || busy || loading) && buttonStyles.inactive]}>{busy ? <ActivityIndicator color={colors.white} /> : <Text style={buttonStyles.label}>{label}</Text>}</Pressable></View>
      <Text style={styles.note}>{!user ? '请先登录；入驻审核通过后才能切换卖家身份' : loading ? '正在核实平台审核结果' : unavailable ? '状态读取失败，当前不能切换卖家身份，请重试' : presentation.note}</Text>
      {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
    </ScrollView></SafeAreaView>;
}
const styles = StyleSheet.create({ safe: { flex: 1 }, content: { padding: 24, paddingTop: 48, alignItems: 'center' }, art: { width: 160, marginBottom: 32 }, mascot: { width: 160, height: 160, borderRadius: 36 }, badge: { position: 'absolute', right: -12, bottom: -12 }, title: { fontSize: 21, lineHeight: 32, fontWeight: '700', textAlign: 'center', color: colors.text }, copy: { marginTop: 12, fontSize: 14, lineHeight: 24, textAlign: 'center', color: colors.textSecondary }, action: { width: '100%', marginTop: 44 }, note: { marginTop: 18, fontSize: 12, lineHeight: 20, textAlign: 'center', color: colors.textSecondary }, error: { marginTop: 16, color: colors.danger } });
const buttonStyles = StyleSheet.create({ pill: { minHeight: 52, paddingVertical: 12, paddingHorizontal: 18, borderRadius: 28, borderWidth: 2, borderColor: colors.white, backgroundColor: '#197DF1', experimental_backgroundImage: 'linear-gradient(135deg, #47B8FA, #197DF1)', boxShadow: '0px 5px 0px #C2E3FB', alignItems: 'center', justifyContent: 'center' }, label: { fontSize: 17, lineHeight: 24, fontWeight: '700', color: colors.white, textAlign: 'center' }, inactive: { opacity: .65 } });
