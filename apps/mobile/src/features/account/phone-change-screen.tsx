import * as Crypto from "expo-crypto";
import { router } from "expo-router";
import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { ApiClientError, userFacingError } from "@/api/api-error";
import { useAuth } from "@/auth/auth-provider";
import { FormField } from "@/components/form-field";
import { NativeButton, NativePage, NativeRow, PaperCard, SectionHeading, nativeShadow } from "@/components/native-page";
import { NoticeBanner } from "@/components/notice-banner";
import { StateView } from "@/components/state-view";
import { cancelPhoneChangeRequest, createPhoneChangeRequest, sendPhoneChangeCode, usePhoneChangeRequests, verifyPhoneChangeCode } from "@/features/account/account-api";
import { queryClient } from "@/query/query-client";
import { colors } from "@/theme/tokens";
import type { PhoneChangeRequestApiView } from "@/types/api";

const activeStatuses = ["PENDING_OLD_VERIFICATION", "PENDING_NEW_VERIFICATION", "READY"] as const;

export function PhoneChangeScreen() {
  const { user, clearRevokedSession } = useAuth();
  const query = usePhoneChangeRequests();
  const [newPhone, setNewPhone] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const active = query.data?.find((item) => activeStatuses.includes(item.status as typeof activeStatuses[number])) ?? null;

  const refresh = async () => { await query.refetch(); };
  const handleError = async (error: unknown) => {
    if (error instanceof ApiClientError && error.code === "RESOURCE_VERSION_CONFLICT") {
      await refresh(); setNotice("换绑申请已在其他设备更新，已加载最新状态。"); return;
    }
    setNotice(userFacingError(error));
  };
  const create = async () => {
    if (!/^1\d{10}$/u.test(newPhone.trim()) || busy) { setNotice("请输入11位新手机号"); return; }
    setBusy("create"); setNotice(null);
    try {
      const result = await createPhoneChangeRequest(newPhone.trim(), Crypto.randomUUID());
      queryClient.setQueryData<PhoneChangeRequestApiView[]>(["phone-change-requests"], (rows = []) => [result, ...rows]);
      setCode(""); setNotice("换绑申请已创建，请先验证当前登录手机号。");
    } catch (error) { await handleError(error); } finally { setBusy(null); }
  };
  const send = async () => {
    if (!active || busy) return; const side = active.status === "PENDING_OLD_VERIFICATION" ? "old" : "new";
    setBusy("send"); setNotice(null);
    try { const result = await sendPhoneChangeCode(active.id, side); setNotice(`开发验证码已发送，有效期${result.expires_in_seconds}秒。请使用本地测试配置中的验证码。`); }
    catch (error) { await handleError(error); } finally { setBusy(null); }
  };
  const verify = async () => {
    if (!active || busy || !/^\d{6}$/u.test(code)) { setNotice("请输入6位动态验证码"); return; }
    const side = active.status === "PENDING_OLD_VERIFICATION" ? "old" : "new";
    setBusy("verify"); setNotice(null);
    try {
      const result = await verifyPhoneChangeCode(active.id, side, code, active.version);
      setCode("");
      if (result.status === "COMPLETED") {
        await clearRevokedSession();
        router.replace("/(auth)/login");
        return;
      }
      await refresh(); setNotice("当前手机号验证通过，请继续验证新手机号。");
    } catch (error) { await handleError(error); } finally { setBusy(null); }
  };
  const cancel = async () => {
    if (!active || busy || !activeStatuses.includes(active.status as typeof activeStatuses[number])) return;
    setBusy("cancel"); setNotice(null);
    try { await cancelPhoneChangeRequest(active.id, active.status as typeof activeStatuses[number], active.version); await refresh(); setCode(""); setNotice("换绑申请已由服务端取消。"); }
    catch (error) { await handleError(error); } finally { setBusy(null); }
  };

  if (query.isPending) return <NativePage title="手机号与安全验证" subtitle="高风险操作需要二次验证"><StateView kind="loading" /></NativePage>;
  if (query.isError && !query.data) return <NativePage title="手机号与安全验证" subtitle="高风险操作需要二次验证"><StateView kind="error" message={userFacingError(query.error)} onRetry={() => void refresh()} /></NativePage>;

  return <NativePage title="手机号与安全验证" subtitle="旧号与新号均验证后才会生效" contentStyle={styles.content} refreshing={query.isRefetching} onRefresh={() => void refresh()}>
    {notice ? <NoticeBanner tone={notice.includes("已") ? "success" : "danger"} message={notice} /> : null}
    <View style={styles.identityCard}><Text style={styles.title}>{user?.profile?.nickname ?? "熊崽用户"}</Text><Text style={styles.meta}>当前登录手机号：{user?.phone_mask ?? "--"}</Text><Text style={styles.meta}>换绑完成后所有旧会话会失效，需要使用新手机号重新登录。</Text></View>
    {active ? <PaperCard>
      <SectionHeading title="进行中的换绑申请" note={`申请编号 ${active.id.slice(0, 8)}…`} />
      <NativeRow label="当前手机号" value={active.old_phone_mask} />
      <NativeRow label="新手机号" value={active.new_phone_mask} />
      <NativeRow label="当前步骤" value={phoneStatusLabel(active.status)} />
      <NativeRow label="申请过期时间" value={formatTime(active.expires_at)} last />
    </PaperCard> : <PaperCard><SectionHeading title="创建换绑申请" note="手机号只提交给服务端，页面不会直接修改账号" /><FormField label="新手机号" value={newPhone} onChangeText={setNewPhone} keyboardType="phone-pad" maxLength={11} placeholder="请输入11位新手机号" /><View style={styles.gap} /><NativeButton label={busy === "create" ? "正在创建…" : "开始安全换绑"} disabled={busy !== null} onPress={() => void create()} /></PaperCard>}
    {active ? <><FormField label={active.status === "PENDING_OLD_VERIFICATION" ? "当前手机号验证码" : "新手机号验证码"} value={code} onChangeText={setCode} keyboardType="number-pad" maxLength={6} placeholder="请输入6位动态验证码" /><NativeButton label={busy === "send" ? "正在发送…" : "发送开发验证码"} disabled={busy !== null || active.status === "READY"} onPress={() => void send()} /><NativeButton label={busy === "verify" ? "正在验证…" : "验证并继续"} disabled={busy !== null || active.status === "READY"} onPress={() => void verify()} /><NativeButton label={busy === "cancel" ? "正在取消…" : "取消换绑申请"} tone="danger" disabled={busy !== null} onPress={() => void cancel()} /></> : null}
    {query.data?.length ? <PaperCard><SectionHeading title="历史记录" note="只展示脱敏手机号" />{query.data.filter((item) => item.id !== active?.id).map((item, index, rows) => <NativeRow key={item.id} label={`${item.old_phone_mask} → ${item.new_phone_mask}`} note={formatTime(item.created_at)} value={phoneStatusLabel(item.status)} last={index === rows.length - 1} />)}</PaperCard> : null}
    <NativeButton label="返回隐私与安全" tone="secondary" onPress={() => router.replace("/settings/security")} />
  </NativePage>;
}

function phoneStatusLabel(status: PhoneChangeRequestApiView["status"]) { return ({ PENDING_OLD_VERIFICATION: "待验证当前手机号", PENDING_NEW_VERIFICATION: "待验证新手机号", READY: "等待完成", COMPLETED: "换绑完成", CANCELLED: "已取消", EXPIRED: "已过期" } as const)[status]; }
function formatTime(value: string) { const date = new Date(value); return Number.isNaN(date.getTime()) ? "--" : date.toLocaleString("zh-CN", { hour12: false }); }
const styles = StyleSheet.create({ content: { gap: 13 }, identityCard: { gap: 6, padding: 17, borderWidth: 1, borderColor: "rgba(39,143,232,0.13)", borderRadius: 19, backgroundColor: "rgba(220,238,255,0.95)", ...nativeShadow }, title: { color: colors.text, fontSize: 17, fontWeight: "900" }, meta: { color: colors.textSecondary, fontSize: 12, lineHeight: 17 }, gap: { height: 12 } });
