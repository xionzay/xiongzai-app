import { z } from "zod";
import type { PolicyApiView, PrivacySettingsApiView, SessionApiView } from "@/types/api";

export const profileEditSchema = z.object({ nickname: z.string().trim().min(2, "昵称至少 2 个字").max(16, "昵称最多 16 个字"), bio: z.string().trim().max(280, "简介最多 280 个字") });
export type ProfileEditValues = z.infer<typeof profileEditSchema>;
export const identityFormSchema = z.object({ legalName: z.string().trim().min(2, "请输入真实姓名").max(64), documentNumber: z.string().trim().min(6, "请输入有效证件号").max(32) });
export type IdentityFormValues = z.infer<typeof identityFormSchema>;
export function optimisticPrivacy(current: PrivacySettingsApiView, field: keyof Pick<PrivacySettingsApiView, "show_online_status" | "show_public_profile" | "personalized_recommendations">, value: boolean): PrivacySettingsApiView { return { ...current, [field]: value }; }
export function isMaskedSensitiveValue(value: string | null | undefined) { return Boolean(value && value.includes("*")); }
export const accountCapabilityAvailability = { dataExport: false, phoneChange: false, accountCancellation: false, fileUpload: true } as const;
export function permissionCopy(status: "granted" | "denied" | "undetermined" | "unavailable") { return status === "granted" ? "已授权" : status === "denied" ? "未授权" : status === "undetermined" ? "尚未询问" : "当前构建未接入"; }
export function shouldReloadProfileAfterConflict(code: string) { return code === "RESOURCE_VERSION_CONFLICT"; }
export function policyVersionIds(policies: PolicyApiView[], requiredTypes?: string[]) { return policies.filter((item) => !requiredTypes || requiredTypes.includes(item.policy_type)).map((item) => item.id); }
export function sessionRevokeOutcome(session: Pick<SessionApiView, "current">) { return session.current ? "CLEAR_LOCAL_AUTH" : "REFETCH_SESSIONS"; }
export function requiresDoubleConfirmation(operation: "ACCOUNT_CANCELLATION" | "SESSION_REVOKE") { return operation === "ACCOUNT_CANCELLATION"; }
export function serverFileReference(uploadAvailable: boolean, fileId?: string) { return uploadAvailable && fileId ? fileId : null; }
