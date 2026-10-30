import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { ApprovedIllustration } from '@/components/approved-illustration';
import { FileImage } from '@/components/file-image';
import type { SellerProfileApiView } from '@/types/api';
import { colors } from '@/theme/tokens';
import avatar from '../../../assets/xiongzai-icon.png';

/** Shared with the approved seller home / mine design; status is a server fact. */
export function SellerIdentity({ seller }: { seller: SellerProfileApiView }) {
  return <View style={styles.identity}>
    <Pressable accessibilityRole="button" accessibilityLabel="编辑店铺资料" style={({ pressed }) => [styles.profile, pressed && styles.pressed]} onPress={() => router.push('/seller/profile')}>
      {seller.seller_avatar_file_id ? <FileImage fileId={seller.seller_avatar_file_id} style={styles.avatar} label="店铺头像" compact /> : <Image source={avatar} style={styles.avatar} accessibilityLabel="熊崽默认店铺头像" />}
      <View style={styles.copy}><Text style={styles.name}>{seller.seller_nickname}</Text><Text style={styles.note}>{seller.accepting_orders ? '营业中' : '休息中'} · 陪玩卖家</Text></View>
    </Pressable>
    <View style={styles.actions}><Pressable accessibilityRole="button" accessibilityLabel="打开设置" style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]} onPress={() => router.push({ pathname: '/settings', params: { role: 'seller' } })}><ApprovedIllustration kind="setting" size={28} /></Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel="预览主页" style={({ pressed }) => [styles.preview, pressed && styles.pressed]} onPress={() => router.push('/seller/preview')}><Text style={styles.link}>预览主页</Text><ApprovedIllustration kind="chevron" rotation={-90} size={16} /></Pressable>
    </View>
  </View>;
}
const styles = StyleSheet.create({
  identity: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8 }, profile: { flex: 1, flexDirection: 'row', gap: 10, alignItems: 'center', paddingVertical: 12 }, avatar: { width: 48, height: 48, borderRadius: 14 }, copy: { flex: 1, gap: 5 }, name: { fontSize: 18, color: colors.text, fontWeight: '700' }, note: { fontSize: 12, lineHeight: 18, color: colors.textSecondary }, actions: { alignItems: 'flex-end' }, iconButton: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center' }, preview: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 6 }, link: { color: colors.brandDeep, fontSize: 12 }, pressed: { opacity: 0.7 }
});
