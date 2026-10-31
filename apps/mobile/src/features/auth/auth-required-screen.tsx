import { Animated, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { resolveInternalReturnTo } from '@/auth/return-to';
import { BrandBackdrop } from '@/components/brand-backdrop';
import { NativeHeader } from '@/components/native-page';
import { PrimaryButton } from '@/components/primary-button';
import { NeutralStateBear } from '@/components/neutral-state-bear';
import { FileImage } from '@/components/file-image';
import { useServiceDetail, useCompanionDetail } from '@/features/discovery/discovery-api';
import { usePanelEntrance } from '@/hooks/use-panel-entrance';
import { colors } from '@/theme/tokens';

export function AuthRequiredScreen() {
  const params = useLocalSearchParams<{ returnTo?: string; action?: string }>();
  const returnTo = resolveInternalReturnTo(params.returnTo);
  const target = /^\/(services|companions)\/([^/?]+)(?:\?|$)/.exec(returnTo);
  const productId = target?.[1] === 'services' ? target[2] ?? '' : returnTo.startsWith('/checkout/confirm?') ? new URLSearchParams(returnTo.split('?')[1]).get('productId') ?? '' : '';
  const companionId = target?.[1] === 'companions' ? target[2] ?? '' : '';
  const product = useServiceDetail(productId, Boolean(productId));
  const companion = useCompanionDetail(companionId, Boolean(companionId));
  const entrance = usePanelEntrance();
  const title = product.data?.title ?? companion.data?.seller_nickname;
  const image = product.data?.cover_file_id ?? companion.data?.seller_avatar_file_id;
  const leave = () => { if (router.canGoBack()) router.back(); else router.replace('/(buyer-tabs)'); };
  return <SafeAreaView style={styles.safe}><BrandBackdrop /><View pointerEvents="none" style={styles.dim} /><NativeHeader title="登录后继续" subtitle="游客可以浏览，交易操作需要登录" onBack={leave} />
    <ScrollView contentContainerStyle={styles.content}>
      <View style={styles.preview}>
        {image ? <FileImage fileId={image} style={styles.image} label={title ? `${title}图片` : '来源图片'} /> : null}
        <View style={styles.previewCopy}>{title ? <Text numberOfLines={2} style={styles.previewTitle}>{title}</Text> : null}<Text style={styles.note}>收藏、咨询、下单和查看订单需要账号</Text></View>
      </View>
      <View style={styles.spacer} />
      <Animated.View style={[styles.sheet, entrance]}>
        <NeutralStateBear />
        <Text accessibilityRole="header" style={styles.title}>登录后使用完整功能</Text>
        <Text style={styles.copy}>登录后可收藏陪玩、发起咨询、支付订单并同步交易和售后记录。</Text>
        <Text style={styles.returnNote}>登录成功后返回原页面，继续{params.action ?? '刚才的操作'}。</Text>
        <View style={styles.action}><PrimaryButton label="手机号登录 / 注册" onPress={() => router.replace({ pathname: '/(auth)/login', params: { returnTo } })} /></View>
        <Pressable accessibilityRole="button" accessibilityLabel="继续浏览" onPress={leave} style={styles.browse}><Text style={styles.note}>继续浏览</Text></Pressable>
      </Animated.View>
    </ScrollView>
  </SafeAreaView>;
}
const styles = StyleSheet.create({
  dim: { position: 'absolute', left: 0, right: 0, top: 170, bottom: 0, experimental_backgroundImage: 'linear-gradient(180deg, rgba(87,106,126,.08), rgba(87,106,126,.36))' },
  safe: { flex: 1 }, content: { flexGrow: 1, padding: 12, paddingTop: 8 }, preview: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 13, borderRadius: 18, backgroundColor: 'rgba(255,255,255,.8)' }, image: { width: 80, height: 80, borderRadius: 14 }, previewCopy: { flex: 1, gap: 7 }, previewTitle: { color: colors.text, fontSize: 15, lineHeight: 22, fontWeight: '600' }, note: { color: colors.textSecondary, fontSize: 12, lineHeight: 19 }, spacer: { flex: 1, minHeight: 32 }, sheet: { alignItems: 'center', paddingTop: 24, paddingHorizontal: 20, paddingBottom: 18, borderRadius: 22, borderWidth: 1, borderColor: colors.divider, backgroundColor: colors.dialog }, title: { marginTop: 12, marginBottom: 6, color: colors.text, fontSize: 22, lineHeight: 30, fontWeight: '700', textAlign: 'center' }, copy: { color: colors.textSecondary, fontSize: 12, lineHeight: 20, textAlign: 'center' }, returnNote: { color: colors.textSecondary, fontSize: 12, lineHeight: 20, marginTop: 6, textAlign: 'center' }, action: { alignSelf: 'stretch', marginTop: 18 }, browse: { minHeight: 44, minWidth: 100, justifyContent: 'center', alignItems: 'center', marginTop: 8 }
});
