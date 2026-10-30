import { useEffect, useRef, useState } from 'react';
import { Image, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { apiClient } from '@/auth/runtime';
import { ApiClientError } from '@/api/api-error';
import { BrandBackdrop } from '@/components/brand-backdrop';
import { NativeHeader } from '@/components/native-page';
import { ApprovedIllustration } from '@/components/approved-illustration';
import { PrimaryButton } from '@/components/primary-button';
import { colors } from '@/theme/tokens';
import type { SellerProfileApiView } from '@/types/api';
import { identitySwitchTarget } from './identity-switch-domain';
import mascot from '../../../assets/xiongzai-icon.png';

export function IdentitySwitchScreen() {
  const { role: rawRole } = useLocalSearchParams<{ role?: string }>();
  const role = rawRole === 'seller' ? 'seller' : 'buyer';
  const pending = useRef<AbortController | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => () => { pending.current?.abort(); pending.current = null; }, []);
  const change = async () => {
    if (pending.current) return;
    const controller = new AbortController(); pending.current = controller;
    setBusy(true); setError('');
    try {
      let seller: SellerProfileApiView | null = null;
      if (role === 'buyer') {
        try { seller = await apiClient.request<SellerProfileApiView>('/seller/profile', { signal: controller.signal }); }
        catch (cause) { if (!(cause instanceof ApiClientError && cause.code === 'SELLER_NOT_FOUND')) throw cause; }
      }
      if (!controller.signal.aborted) router.dismissTo(identitySwitchTarget(role, seller));
    } catch { if (!controller.signal.aborted) setError('暂时无法读取身份状态，请重试。'); }
    finally { if (!controller.signal.aborted) { pending.current = null; setBusy(false); } }
  };
  return <SafeAreaView style={styles.safe}><BrandBackdrop seller={role === 'seller'} /><NativeHeader title="切换身份" subtitle="" />
    <ScrollView contentContainerStyle={styles.content}>
      <View style={styles.art}><Image source={mascot} style={styles.mascot} accessibilityLabel="熊崽电竞" /><View style={styles.badge}><ApprovedIllustration kind={role === 'buyer' ? 'home' : 'product'} size={64} /></View></View>
      <Text style={styles.title}>你当前的身份是“{role === 'buyer' ? '买家' : '卖家'}”</Text>
      <Text style={styles.copy}>{role === 'buyer' ? '找陪玩、下单，管理你的购买订单' : '管理服务、处理订单，查看经营收益'}</Text>
      <View style={styles.action}><PrimaryButton label={`切换为“${role === 'buyer' ? '卖家' : '买家'}”身份`} loading={busy} disabled={busy} onPress={() => void change()} /></View>
      <Text style={styles.note}>{role === 'buyer' ? '尚未入驻的账号将进入陪玩申请流程' : '同一账号，订单与资料继续保留'}</Text>
      {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
    </ScrollView></SafeAreaView>;
}
const styles = StyleSheet.create({ safe: { flex: 1 }, content: { padding: 24, paddingTop: 48, alignItems: 'center' }, art: { width: 160, marginBottom: 32 }, mascot: { width: 160, height: 160, borderRadius: 36 }, badge: { position: 'absolute', right: -12, bottom: -12 }, title: { fontSize: 21, lineHeight: 32, fontWeight: '700', textAlign: 'center', color: colors.text }, copy: { marginTop: 12, fontSize: 14, lineHeight: 24, textAlign: 'center', color: colors.textSecondary }, action: { width: '100%', marginTop: 44 }, note: { marginTop: 18, fontSize: 12, lineHeight: 20, textAlign: 'center', color: colors.textSecondary }, error: { marginTop: 16, color: colors.danger } });
