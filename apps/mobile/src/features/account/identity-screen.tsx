import { zodResolver } from "@hookform/resolvers/zod";
import { Controller, useForm } from "react-hook-form";
import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { ApiClientError } from "@/api/api-error";
import { useAuth } from "@/auth/auth-provider";
import { FormField } from "@/components/form-field";
import { NativePage, nativeShadow } from "@/components/native-page";
import { NoticeBanner } from "@/components/notice-banner";
import { PrimaryButton } from "@/components/primary-button";
import { StateView } from "@/components/state-view";
import { acceptPolicies, submitIdentity, useIdentity, usePolicies } from "@/features/account/account-api";
import { identityFormSchema, type IdentityFormValues } from "@/features/account/account-domain";
import { allPoliciesConfirmed } from "@/features/account/policy-confirmation-domain";
import { PolicyConfirmationList } from "@/features/account/policy-confirmation-list";
import { colors, spacing, typography } from "@/theme/tokens";

const statusCopy = { PENDING: "测试审核中", VERIFIED: "测试已通过", REJECTED: "测试未通过", EXPIRED: "测试已过期", REVOKED: "测试已撤销" } as const;

export function IdentityScreen() {
  const { user, refreshUser } = useAuth(); const query = useIdentity();
  const [busy, setBusy] = useState(false); const [notice, setNotice] = useState<string | null>(null);
  const policies = usePolicies("IDENTITY_VERIFICATION");
  const [confirmedPolicyIds, setConfirmedPolicyIds] = useState<string[]>([]);
  const policiesConfirmed = allPoliciesConfirmed(policies.data, confirmedPolicyIds);
  const { control, handleSubmit, reset, formState: { errors } } = useForm<IdentityFormValues>({ resolver: zodResolver(identityFormSchema), defaultValues: { legalName: "", documentNumber: "" } });
  if (query.isPending) return <NativePage title="手机号与实名认证" subtitle="高风险操作需要二次验证"><View style={styles.state}><StateView kind="loading" /></View></NativePage>;
  if (query.isError) return <NativePage title="手机号与实名认证" subtitle="高风险操作需要二次验证"><View style={styles.state}><StateView kind="error" onRetry={() => void query.refetch()} /></View></NativePage>;
  const current = query.data; const canSubmit = !current || ["REJECTED", "EXPIRED", "REVOKED"].includes(current.status);
  const submit = handleSubmit(async (values) => {
    setBusy(true); setNotice(null);
    try {
      if (!policiesConfirmed) { setNotice("请先逐份阅读并在线确认实名信息处理协议；协议加载失败时不能提交。"); return; }
      await acceptPolicies(confirmedPolicyIds, "IDENTITY_VERIFICATION");
      await submitIdentity(values.legalName, values.documentNumber); reset({ legalName: "", documentNumber: "" });
      await Promise.all([query.refetch(), refreshUser()]);
      setNotice("本地测试认证已提交；未连接真实实名渠道。");
    } catch (error) { reset({ legalName: "", documentNumber: "" }); if (error instanceof ApiClientError && error.code.startsWith("POLICY_")) { setConfirmedPolicyIds([]); await policies.refetch(); setNotice("实名信息处理协议已更新或暂不可用，请刷新后重新在线确认。"); } else setNotice(error instanceof ApiClientError ? error.message : "本地测试认证提交失败"); }
    finally { setBusy(false); }
  });

  return <NativePage title="手机号与实名认证" subtitle="高风险操作需要二次验证" contentStyle={styles.content}>
    <NoticeBanner message="本地测试实名认证：仅生成开发环境审核状态，不连接真实实名服务。请使用虚构测试资料，勿输入真实姓名或证件号。" />
    <View style={styles.card}><Info label="绑定手机号" value={user?.phone_mask ?? "--"} /><Info label="换绑手机号" value="已提供双重验证码安全流程" /></View>
    {notice ? <NoticeBanner message={notice} tone={notice.includes("已提交") ? "success" : "danger"} /> : null}
    {current ? <View style={styles.card}><Text style={styles.title}>{statusCopy[current.status]}</Text><Info label="测试姓名" value={current.legal_name_mask} /><Info label="测试证件号" value={current.document_mask} />{current.rejection_reason ? <Info label="未通过原因" value={current.rejection_reason} /> : null}</View> : <NoticeBanner message="当前尚未提交本地测试认证；服务端只返回脱敏结果。" />}
    {canSubmit ? <><PolicyConfirmationList title="实名信息处理单独同意" hint="仅用于本地测试认证，不连接真实实名或第三方电子签。" policies={policies.data} isPending={policies.isPending} isError={policies.isError} confirmedIds={confirmedPolicyIds} disabled={busy} onChange={setConfirmedPolicyIds} onRetry={() => void policies.refetch()} /><View style={styles.card}><Text style={styles.title}>提交本地测试审核</Text><NoticeBanner tone="danger" message="请勿输入、截图或复制真实身份资料。App 不上传证件图片，也不会把输入写入日志。" /><Controller control={control} name="legalName" render={({ field }) => <FormField label="测试姓名" value={field.value} onChangeText={field.onChange} onBlur={field.onBlur} autoComplete="off" error={errors.legalName?.message} />} /><Controller control={control} name="documentNumber" render={({ field }) => <FormField label="测试证件号码" value={field.value} onChangeText={field.onChange} onBlur={field.onBlur} autoComplete="off" secureTextEntry maxLength={32} error={errors.documentNumber?.message} />} /><PrimaryButton label="在线确认并提交测试认证" loading={busy} disabled={busy || !policiesConfirmed} onPress={() => void submit()} /></View></> : null}
  </NativePage>;
}

function Info({ label, value }: { label: string; value: string }) { return <View style={styles.info}><Text style={styles.meta}>{label}</Text><Text style={styles.value}>{value}</Text></View>; }
const styles = StyleSheet.create({ content: { gap: spacing.md }, state: { minHeight: 220, justifyContent: "center", borderRadius: 18, backgroundColor: "rgba(255,253,248,0.96)", ...nativeShadow }, card: { gap: spacing.md, padding: spacing.lg, ...nativeShadow, backgroundColor: "transparent", borderWidth: 0, borderLeftWidth: 0, borderRightWidth: 0, borderTopWidth: 0, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: colors.divider, borderBottomColor: colors.divider, borderRadius: 0, shadowOpacity: 0, elevation: 0 }, title: { ...typography.sectionTitle, color: colors.text }, info: { flexDirection: "row", justifyContent: "space-between", gap: spacing.md }, meta: { ...typography.caption, color: colors.textSecondary }, value: { ...typography.body, color: colors.text, flex: 1, textAlign: "right" } });
