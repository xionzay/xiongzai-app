export const policyTypes = [
  "USER_SERVICE_AGREEMENT",
  "PRIVACY_POLICY",
  "PERSONAL_INFORMATION_COLLECTION_LIST",
  "THIRD_PARTY_SDK_SHARING_LIST",
  "SYSTEM_PERMISSION_NOTICE",
  "MINOR_PROTECTION_NOTICE",
  "ORDER_PAYMENT_REFUND_RULES",
  "CHAT_CONTENT_MANAGEMENT_RULES",
  "SELLER_ONBOARDING_AGREEMENT",
  "SELLER_FULFILLMENT_RULES",
  "SERVICE_FEE_SETTLEMENT_WITHDRAWAL_RULES",
  "IDENTITY_INFORMATION_SEPARATE_CONSENT",
  "VOICE_SAMPLE_PUBLIC_PLAYBACK_AUTHORIZATION",
  "COMPLAINT_DISPUTE_RULES",
] as const;

export const policyAcceptanceScenes = [
  "LOGIN",
  "ORDER_PAYMENT",
  "CHAT_ENTRY",
  "SELLER_ONBOARDING",
  "IDENTITY_VERIFICATION",
  "VOICE_SAMPLE_UPLOAD",
  "COMPLAINT_SUBMISSION",
] as const;

export const storedPolicyAcceptanceScenes = [...policyAcceptanceScenes, "LEGACY_UNSCOPED"] as const;
export const policyConfirmationMethods = ["ONLINE_CONFIRM"] as const;

export type PolicyType = (typeof policyTypes)[number];
export type PolicyAcceptanceScene = (typeof policyAcceptanceScenes)[number];
export type StoredPolicyAcceptanceScene = (typeof storedPolicyAcceptanceScenes)[number];
export type PolicyConfirmationMethod = (typeof policyConfirmationMethods)[number];

export const policyTypesByScene = {
  LOGIN: [
    "USER_SERVICE_AGREEMENT",
    "PRIVACY_POLICY",
    "PERSONAL_INFORMATION_COLLECTION_LIST",
    "THIRD_PARTY_SDK_SHARING_LIST",
    "SYSTEM_PERMISSION_NOTICE",
    "MINOR_PROTECTION_NOTICE",
  ],
  ORDER_PAYMENT: ["ORDER_PAYMENT_REFUND_RULES"],
  CHAT_ENTRY: ["CHAT_CONTENT_MANAGEMENT_RULES"],
  SELLER_ONBOARDING: [
    "SELLER_ONBOARDING_AGREEMENT",
    "SELLER_FULFILLMENT_RULES",
    "SERVICE_FEE_SETTLEMENT_WITHDRAWAL_RULES",
  ],
  IDENTITY_VERIFICATION: ["IDENTITY_INFORMATION_SEPARATE_CONSENT"],
  VOICE_SAMPLE_UPLOAD: ["VOICE_SAMPLE_PUBLIC_PLAYBACK_AUTHORIZATION"],
  COMPLAINT_SUBMISSION: ["COMPLAINT_DISPUTE_RULES"],
} as const satisfies Record<PolicyAcceptanceScene, readonly PolicyType[]>;

export interface PolicyAcceptanceCommand {
  acceptance_scene: PolicyAcceptanceScene;
  confirmation_method: "ONLINE_CONFIRM";
  policy_version_ids: string[];
}

export function requiredPolicyTypes(scene: PolicyAcceptanceScene): readonly PolicyType[] {
  return policyTypesByScene[scene];
}

