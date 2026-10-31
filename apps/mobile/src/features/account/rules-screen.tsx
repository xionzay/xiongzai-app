import { BrandBackdrop } from "@/components/brand-backdrop";
import { JellyIcon } from "../../components/jelly-icon";
import { useMemo, useState } from "react";
import { ChevronLeftIcon, ChevronRightIcon } from "@/components/ui-icons";
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuth } from "@/auth/auth-provider";
import { NoticeBanner } from "@/components/notice-banner";
import { StateView } from "@/components/state-view";
import { usePolicies, usePolicyAcceptances } from "@/features/account/account-api";
import { colors } from "@/theme/tokens";
import type { PolicyApiView, PolicyType } from "@/types/api";
import { ShieldIcon } from "@/components/tab-icons";

type PolicyGroup = {
  key: string;
  title: string;
  hint: string;
  policyTypes: PolicyType[];
};

const policyGroups: PolicyGroup[] = [
  { key: "account", title: "用户、隐私与账号", hint: "登录、个人信息、SDK、系统权限及未成年人保护", policyTypes: ["USER_SERVICE_AGREEMENT", "PRIVACY_POLICY", "PERSONAL_INFORMATION_COLLECTION_LIST", "THIRD_PARTY_SDK_SHARING_LIST", "SYSTEM_PERMISSION_NOTICE", "MINOR_PROTECTION_NOTICE"] },
  { key: "transaction", title: "订单支付退款规则", hint: "下单、支付、履约、退款与平台保障", policyTypes: ["ORDER_PAYMENT_REFUND_RULES"] },
  { key: "content", title: "聊天和内容管理规则", hint: "一对一文字聊天与平台内容治理", policyTypes: ["CHAT_CONTENT_MANAGEMENT_RULES"] },
  { key: "seller", title: "陪玩入驻与履约", hint: "入驻、履约、服务费、结算和提现", policyTypes: ["SELLER_ONBOARDING_AGREEMENT", "SELLER_FULFILLMENT_RULES", "SERVICE_FEE_SETTLEMENT_WITHDRAWAL_RULES"] },
  { key: "separate", title: "单独授权与争议规则", hint: "测试实名、声音名片公开试听及投诉处理", policyTypes: ["IDENTITY_INFORMATION_SEPARATE_CONSENT", "VOICE_SAMPLE_PUBLIC_PLAYBACK_AUTHORIZATION", "COMPLAINT_DISPUTE_RULES"] }
];



export function RulesScreen() {
  const { user } = useAuth();
  const policies = usePolicies();
  const accepted = usePolicyAcceptances(Boolean(user));
  const [expandedGroup, setExpandedGroup] = useState("account");
  const acceptedPolicyIds = useMemo(() => new Set((accepted.data ?? []).map((item) => item.policy_version_id)), [accepted.data]);

  const refresh = async () => {
    await Promise.all([policies.refetch(), user ? accepted.refetch() : Promise.resolve()]);
  };

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom", "left", "right"]}>
      <RulesBackdrop />
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={policies.isRefetching || accepted.isRefetching} onRefresh={() => void refresh()} tintColor={colors.brand} />}
      >
        <View style={styles.header}>
          <Pressable accessibilityRole="button" accessibilityLabel="返回" onPress={() => router.back()} style={({ pressed }) => [styles.back, pressed && styles.pressed]}>
            <ChevronLeftIcon size={23} />
          </Pressable>
          <View style={styles.headerCopy}>
            <Text style={styles.pageTitle}>协议与隐私中心</Text>
            <Text style={styles.pageSubtitle}>已发布协议、隐私清单与平台规则</Text>
          </View>
        </View>

        <View style={styles.protectionCard}>
          <View style={styles.protectionIconWrap}><ShieldIcon size={42} /></View>
          <View style={styles.protectionCopy}>
            <Text style={styles.protectionTitle}>熊崽电竞平台保障</Text>
            <Text style={styles.protectionText}>平台内支付 · 订单留痕 · 退款与投诉介入</Text>
          </View>
        </View>

        <View style={styles.draftNotice}><NoticeBanner message="当前展示内容均为本地测试后端发布的协议草案，不代表正式商业签署、第三方电子签或真实渠道授权。" /></View>

        {policies.isPending ? (
          <View style={styles.stateCard}><StateView kind="loading" /></View>
        ) : policies.isError || !policies.data ? (
          <View style={styles.stateCard}><StateView kind="error" onRetry={() => void policies.refetch()} /></View>
        ) : (
          <View style={styles.ruleList}>
            {policyGroups.map((group) => {
              const groupPolicies = policies.data.filter((policy) => group.policyTypes.includes(policy.policy_type));
              const expanded = expandedGroup === group.key;
              return (
                <PolicyAccordion
                  key={group.key}
                  group={group}
                  policies={groupPolicies}
                  expanded={expanded}
                  acceptedPolicyIds={acceptedPolicyIds}
                  showAcceptance={Boolean(user)}
                  onToggle={() => setExpandedGroup(expanded ? "" : group.key)}
                />
              );
            })}
          </View>
        )}

        {user && accepted.isError ? <Text style={styles.recordError}>接受记录加载失败，规则正文仍可正常查看。</Text> : null}
        {user && accepted.isPending ? <Text style={styles.recordMeta}>正在读取真实接受记录…</Text> : null}

        {user ? (
          <Pressable accessibilityRole="button" accessibilityLabel="查看我的协议接受记录" onPress={() => router.push("/settings/policy-acceptances")} style={({ pressed }) => [styles.recordsCard, pressed && styles.pressed]}>
            <View style={styles.supportCopy}>
              <Text style={styles.supportTitle}>我的协议接受记录</Text>
              <Text style={styles.supportText}>查看接受版本、使用场景、确认方式和确认时间</Text>
            </View>
            <ChevronRightIcon size={20} />
          </Pressable>
        ) : null}

        <Pressable accessibilityRole="button" accessibilityLabel="联系平台客服" onPress={() => router.push("/support")} style={({ pressed }) => [styles.supportCard, pressed && styles.pressed]}>
          <View style={styles.supportCopy}>
            <Text style={styles.supportTitle}>仍然需要帮助？</Text>
            <Text style={styles.supportText}>联系平台客服处理订单与账号问题</Text>
          </View>
          <ChevronRightIcon size={20} />
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

function RulesBackdrop() { return <BrandBackdrop />; }

function PolicyAccordion({ group, policies, expanded, acceptedPolicyIds, showAcceptance, onToggle }: {
  group: PolicyGroup;
  policies: PolicyApiView[];
  expanded: boolean;
  acceptedPolicyIds: Set<string>;
  showAcceptance: boolean;
  onToggle(): void;
}) {
  return (
    <View style={styles.ruleCard}>
      <Pressable accessibilityRole="button" accessibilityState={{ expanded }} accessibilityLabel={`${group.title}，${group.hint}`} onPress={onToggle} style={({ pressed }) => [styles.ruleHeader, pressed && styles.pressed]}>
        <View style={styles.ruleCopy}>
          <Text style={styles.ruleTitle}>{group.title}</Text>
          <Text style={styles.ruleHint}>{group.hint}</Text>
        </View>
        <JellyIcon kind="chevron" up={expanded} />
      </Pressable>
      {expanded ? (
        <View style={styles.ruleBody}>
          {policies.length ? policies.map((policy) => (
            <View key={policy.id} style={styles.policyBlock}>
              <View style={styles.policyHeading}>
                <Text style={styles.policyTitle}>{policy.title}</Text>
                <Text style={styles.policyVersion}>V{policy.version_no}{showAcceptance ? ` · ${acceptedPolicyIds.has(policy.id) ? "已接受" : "未接受"}` : ""}</Text>
              </View>
              <Text style={styles.policyContent} numberOfLines={5}>{policy.content}</Text>
              <Pressable accessibilityRole="link" accessibilityLabel={`查看${policy.title}完整规则`} onPress={() => router.push({ pathname: "/policies/[id]", params: { id: policy.id } })} style={({ pressed }) => [styles.detailLink, pressed && styles.pressed]}>
                <Text style={styles.detailText}>查看完整规则</Text><ChevronRightIcon size={20} />
              </Pressable>
            </View>
          )) : <Text style={styles.unpublished}>相关规则尚未发布，请稍后刷新。</Text>}
        </View>
      ) : null}
    </View>
  );
}

const softShadow = { shadowColor: "#4B3920", shadowOffset: { width: 0, height: 5 }, shadowOpacity: 0.08, shadowRadius: 14, elevation: 3 } as const;

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.canvas },
  backdrop: { position: "absolute", top: 0, right: 0, bottom: 0, left: 0 },
  band: { flex: 1 },
  content: { flexGrow: 1, paddingHorizontal: 12, paddingBottom: 24 },
  header: { flexDirection: "row", alignItems: "center", minHeight: 60, paddingBottom: 4, height: undefined },
  back: { alignItems: "center", justifyContent: "center", ...softShadow, backgroundColor: "transparent", borderWidth: 0, borderLeftWidth: 0, borderRightWidth: 0, borderTopWidth: 0, borderBottomWidth: 0, borderColor: colors.divider, borderBottomColor: colors.divider, borderRadius: 0, shadowOpacity: 0, elevation: 0, width: 48, height: undefined, minHeight: 48 },
  backText: { marginTop: -3, color: colors.text, fontSize: 34, lineHeight: 38, fontWeight: "500" },
  headerCopy: { flex: 1, marginLeft: 0, minWidth: 0 },
  pageTitle: { color: colors.text, fontSize: 19, lineHeight: 26, fontWeight: "600", textAlign: "center" },
  pageSubtitle: { marginTop: 3, fontSize: 12, lineHeight: 16, textAlign: "center", color: colors.textSecondary },
  protectionCard: { minHeight: 94, flexDirection: "row", alignItems: "center", gap: 13, paddingHorizontal: 14, ...softShadow, backgroundColor: "transparent", borderWidth: 0, borderLeftWidth: 0, borderRightWidth: 0, borderTopWidth: 0, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: colors.divider, borderBottomColor: colors.divider, borderRadius: 0, shadowOpacity: 0, elevation: 0 },
  protectionIconWrap: { width: 54, height: 54, alignItems: "center", justifyContent: "center", borderRadius: 17, backgroundColor: "rgba(255,253,248,0.88)" },
  protectionCopy: { flex: 1 },
  protectionTitle: { color: colors.text, fontSize: 14, lineHeight: 19, fontWeight: "900" },
  protectionText: { marginTop: 6, color: colors.textSecondary, fontSize: 12, lineHeight: 16 },
  draftNotice: { marginTop: 13 },
  stateCard: { minHeight: 160, marginTop: 13, justifyContent: "center", ...softShadow, backgroundColor: "transparent", borderWidth: 0, borderLeftWidth: 0, borderRightWidth: 0, borderTopWidth: 0, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: colors.divider, borderBottomColor: colors.divider, borderRadius: 0, shadowOpacity: 0, elevation: 0 },
  ruleList: { gap: 9, marginTop: 13 },
  ruleCard: { overflow: "hidden", ...softShadow, backgroundColor: "transparent", borderWidth: 0, borderLeftWidth: 0, borderRightWidth: 0, borderTopWidth: 0, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: colors.divider, borderBottomColor: colors.divider, borderRadius: 0, shadowOpacity: 0, elevation: 0 },
  ruleHeader: { minHeight: 68, flexDirection: "row", alignItems: "center", paddingHorizontal: 15 },
  ruleCopy: { flex: 1 },
  ruleTitle: { color: colors.text, fontSize: 14, lineHeight: 19, fontWeight: "800" },
  ruleHint: { marginTop: 4, color: colors.textSecondary, fontSize: 12, lineHeight: 16 },
  chevron: { color: colors.textSecondary, fontSize: 22, lineHeight: 24, transform: [{ rotate: "0deg" }] },
  chevronExpanded: { transform: [{ rotate: "180deg" }] },
  ruleBody: { paddingHorizontal: 15, paddingBottom: 15, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: "rgba(62,57,47,0.12)" },
  policyBlock: { paddingTop: 13 },
  policyHeading: { flexDirection: "row", alignItems: "center", gap: 10 },
  policyTitle: { flex: 1, color: colors.text, fontSize: 12, lineHeight: 17, fontWeight: "800" },
  policyVersion: { color: colors.brandDeep, fontSize: 12, lineHeight: 16, fontWeight: "700" },
  policyContent: { marginTop: 8, color: colors.textSecondary, fontSize: 12, lineHeight: 17 },
  detailLink: { minHeight: 44, flexDirection: "row", alignItems: "center", justifyContent: "flex-end", marginTop: 3 },
  detailText: { color: colors.brandDeep, fontSize: 12, lineHeight: 16, fontWeight: "700" },
  detailArrow: { marginLeft: 4, color: colors.brandDeep, fontSize: 17, lineHeight: 20 },
  unpublished: { paddingTop: 13, color: colors.textSecondary, fontSize: 12, lineHeight: 17 },
  recordMeta: { marginTop: 10, color: colors.textSecondary, fontSize: 12, lineHeight: 16, textAlign: "center" },
  recordError: { marginTop: 10, color: colors.danger, fontSize: 12, lineHeight: 16, textAlign: "center" },
  recordsCard: { minHeight: 76, flexDirection: "row", alignItems: "center", marginTop: 13, paddingHorizontal: 15, ...softShadow, backgroundColor: "transparent", borderWidth: 0, borderLeftWidth: 0, borderRightWidth: 0, borderTopWidth: 0, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: colors.divider, borderBottomColor: colors.divider, borderRadius: 0, shadowOpacity: 0, elevation: 0 },
  supportCard: { minHeight: 76, flexDirection: "row", alignItems: "center", marginTop: 13, paddingHorizontal: 15, borderWidth: 1, borderColor: "rgba(62,57,47,0.10)", borderRadius: 18, backgroundColor: "rgba(255,248,221,0.93)", ...softShadow },
  supportCopy: { flex: 1 },
  supportTitle: { color: colors.text, fontSize: 13, lineHeight: 18, fontWeight: "800" },
  supportText: { marginTop: 5, color: colors.textSecondary, fontSize: 12, lineHeight: 16 },
  supportArrow: { color: colors.textSecondary, fontSize: 26, lineHeight: 30 },
  pressed: { opacity: 0.72 }
});
