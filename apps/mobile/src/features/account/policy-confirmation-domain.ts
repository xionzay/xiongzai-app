import type { PolicyApiView } from "@/types/api";

export function allPoliciesConfirmed(policies: PolicyApiView[] | undefined, confirmedIds: readonly string[]): boolean {
  if (!policies?.length) return false;
  const confirmed = new Set(confirmedIds);
  return policies.every((policy) => confirmed.has(policy.id));
}

export function togglePolicyConfirmation(confirmedIds: readonly string[], policyId: string): string[] {
  return confirmedIds.includes(policyId)
    ? confirmedIds.filter((id) => id !== policyId)
    : [...confirmedIds, policyId];
}

export const policyAcceptanceSceneCopy = {
  LOGIN: "登录与账号使用",
  ORDER_PAYMENT: "订单支付",
  CHAT_ENTRY: "聊天入口",
  SELLER_ONBOARDING: "陪玩入驻",
  IDENTITY_VERIFICATION: "实名信息处理",
  VOICE_SAMPLE_UPLOAD: "声音名片公开试听",
  COMPLAINT_SUBMISSION: "投诉提交",
  LEGACY_UNSCOPED: "历史接受记录"
} as const;
