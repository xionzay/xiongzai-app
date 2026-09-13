import { useState } from "react";
import { StyleSheet, Switch, Text, View } from "react-native";
import { useToast } from "@/components/toast-provider";
import { NativePage, NativeRow, PaperCard, nativeShadow } from "@/components/native-page";
import { StateView } from "@/components/state-view";
import { optimisticPrivacy } from "@/features/account/account-domain";
import { updatePrivacySettings, usePrivacySettings } from "@/features/account/account-api";
import { colors } from "@/theme/tokens";
import type { PrivacySettingsApiView } from "@/types/api";

type Field = "show_online_status" | "show_public_profile" | "personalized_recommendations";

export function PrivacyScreen() {
  const query = usePrivacySettings();
  const { showToast } = useToast();
  const [override, setOverride] = useState<PrivacySettingsApiView | null>(null);
  const [busy, setBusy] = useState<Field | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const display = override ?? query.data;
  const toggle = async (field: Field, value: boolean) => {
    if (!display) return;
    const before = display;
    setOverride(optimisticPrivacy(before, field, value));
    setBusy(field);
    setNotice(null);
    try {
      const updated = await updatePrivacySettings({ [field]: value, version: before.version });
      setOverride(updated);
      showToast("隐私设置已保存", "success");
    } catch {
      setOverride(before);
      const latest = await query.refetch();
      if (latest.data) setOverride(latest.data);
      const message = "隐私设置保存失败，已回滚并重新读取服务端状态。";
      setNotice(message);
      showToast(message, "danger");
    } finally {
      setBusy(null);
    }
  };

  return (
    <NativePage
      title="隐私设置"
      subtitle="控制个人信息的公开范围"
      refreshing={query.isRefetching}
      onRefresh={() => void query.refetch()}
      contentStyle={styles.content}
    >
      {query.isPending || !display ? <View style={styles.state}><StateView kind="loading" /></View> : null}
      {query.isError ? <View style={styles.state}><StateView kind="error" onRetry={() => void query.refetch()} /></View> : null}
      {display ? (
        <PaperCard>
          <PrivacyRow label="展示在线状态" hint="关闭后其他玩家看不到你的在线状态" value={display.show_online_status} disabled={busy !== null} onChange={(value) => void toggle("show_online_status", value)} />
          <PrivacyRow label="个性化推荐" hint="根据浏览与交易偏好推荐陪玩和服务" value={display.personalized_recommendations} disabled={busy !== null} onChange={(value) => void toggle("personalized_recommendations", value)} />
          <PrivacyRow label="公开我的评价" hint="允许其他用户在买家主页查看公开评价" value={display.show_public_profile} disabled={busy !== null} onChange={(value) => void toggle("show_public_profile", value)} last />
        </PaperCard>
      ) : null}

      {notice ? <View style={styles.errorCard}><Text style={styles.errorText}>{notice}</Text></View> : null}

      <View style={styles.explanation}>
        <Text style={styles.explanationTitle}>隐私说明</Text>
        <Text style={styles.explanationText}>手机号、实名认证姓名、订单、收藏和登录设备始终不会展示在公开主页。</Text>
        {display ? <Text style={styles.version}>服务端版本 {display.version} · 更新于 {new Date(display.updated_at).toLocaleString("zh-CN")}</Text> : null}
      </View>
    </NativePage>
  );
}

function PrivacyRow({ label, hint, value, disabled, onChange, last = false }: {
  label: string;
  hint: string;
  value: boolean;
  disabled: boolean;
  onChange(value: boolean): void;
  last?: boolean;
}) {
  return (
    <NativeRow
      label={label}
      note={hint}
      last={last}
      trailing={
        <Switch
          accessibilityLabel={label}
          value={value}
          disabled={disabled}
          onValueChange={onChange}
          trackColor={{ true: colors.brand, false: colors.border }}
          thumbColor="#FFFFFF"
        />
      }
    />
  );
}

const styles = StyleSheet.create({
  content: { gap: 13 },
  state: { minHeight: 180, justifyContent: "center", borderRadius: 18, backgroundColor: "rgba(255,253,248,0.96)", ...nativeShadow },
  explanation: { padding: 17, borderWidth: 1, borderColor: "rgba(39,143,232,0.13)", borderRadius: 18, backgroundColor: "rgba(220,238,255,0.94)", ...nativeShadow },
  explanationTitle: { color: colors.text, fontSize: 14, lineHeight: 19, fontWeight: "900" },
  explanationText: { marginTop: 7, color: colors.textSecondary, fontSize: 12, lineHeight: 17 },
  version: { marginTop: 12, color: colors.brandDeep, fontSize: 12, lineHeight: 16 },
  errorCard: { padding: 13, borderWidth: 1, borderColor: "rgba(229,72,77,0.20)", borderRadius: 14, backgroundColor: "rgba(255,240,232,0.96)" },
  errorText: { color: colors.danger, fontSize: 12, lineHeight: 16 }
});
