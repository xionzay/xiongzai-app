import * as Crypto from "expo-crypto";
import { Directory, File, Paths } from "expo-file-system";
import { router } from "expo-router";
import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { userFacingError } from "@/api/api-error";
import { NativeButton, NativePage, NativeRow, PaperCard, SectionHeading, nativeShadow } from "@/components/native-page";
import { NoticeBanner } from "@/components/notice-banner";
import { StateView } from "@/components/state-view";
import { createPersonalDataExport, getPersonalDataExportDownload, usePersonalDataExports } from "@/features/account/account-api";
import { colors } from "@/theme/tokens";
import type { PersonalDataExportApiView } from "@/types/api";

export function DataExportScreen() {
  const query = usePersonalDataExports();
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const active = query.data?.some((item) => item.status === "PENDING" || item.status === "PROCESSING") ?? false;
  const create = async () => {
    if (busy) return; setBusy("create"); setNotice(null);
    try { await createPersonalDataExport(Crypto.randomUUID()); await query.refetch(); setNotice("数据副本任务已提交，Worker会在本地安全生成文件。"); }
    catch (error) { setNotice(userFacingError(error)); } finally { setBusy(null); }
  };
  const download = async (item: PersonalDataExportApiView) => {
    if (busy) return; setBusy(item.id); setNotice(null);
    try {
      const result = await getPersonalDataExportDownload(item.id);
      const protocol = new URL(result.download_url).protocol;
      if (protocol !== "http:" && protocol !== "https:") throw new Error("安全下载地址格式无效");
      const exportDirectory = new Directory(Paths.cache, "personal-data-exports");
      exportDirectory.create({ intermediates: true, idempotent: true });
      await File.downloadFileAsync(result.download_url, exportDirectory, { idempotent: true });
      setNotice(`数据副本已安全下载到应用缓存，文件大小 ${result.size_bytes} 字节。短时地址不会保存或显示。`);
    } catch (error) { setNotice(userFacingError(error)); } finally { setBusy(null); }
  };
  if (query.isPending) return <NativePage title="个人数据下载" subtitle="申请一份账号数据副本"><StateView kind="loading" /></NativePage>;
  if (query.isError && !query.data) return <NativePage title="个人数据下载" subtitle="申请一份账号数据副本"><StateView kind="error" message={userFacingError(query.error)} onRetry={() => void query.refetch()} /></NativePage>;
  return <NativePage title="个人数据下载" subtitle="任务状态由服务端和Scheduler实时返回" contentStyle={styles.content} refreshing={query.isRefetching} onRefresh={() => void query.refetch()}>
    {notice ? <NoticeBanner tone={notice.includes("已") ? "success" : "danger"} message={notice} /> : null}
    <View style={styles.hero}><Text style={styles.heroTitle}>申请个人数据副本</Text><Text style={styles.heroText}>包含账号资料、订单摘要、评价、平台内聊天记录和协议接受记录；敏感凭证不会导出。</Text></View>
    <PaperCard><SectionHeading title="数据范围" note="由服务端生成，不使用前端假文件" /><NativeRow label="账号与公开资料" value="包含" /><NativeRow label="订单、退款与评价摘要" value="包含" /><NativeRow label="聊天和协议记录" value="包含" /><NativeRow label="密码、Token与完整账户" value="不包含" last /></PaperCard>
    <NativeButton label={busy === "create" ? "正在提交…" : active ? "已有任务正在生成" : "申请数据副本"} disabled={busy !== null || active} onPress={() => void create()} />
    <PaperCard><SectionHeading title="导出任务" note="生成中每5秒自动刷新" />{query.data?.length ? query.data.map((item, index) => <View key={item.id} style={styles.job}><NativeRow label={`任务 ${item.id.slice(0, 8)}…`} note={`${formatTime(item.requested_at)} · ${item.failure_code ? `失败代码：${item.failure_code}` : "无失败信息"}`} value={exportStatusLabel(item.status)} last />{item.status === "COMPLETED" ? <NativeButton label={busy === item.id ? "正在获取…" : "安全下载"} disabled={busy !== null} onPress={() => void download(item)} /> : null}{index !== query.data!.length - 1 ? <View style={styles.divider} /> : null}</View>) : <NativeRow label="暂无导出任务" note="接口正常返回空列表" value="0" last />}</PaperCard>
    <NativeButton label="联系平台客服" tone="secondary" onPress={() => router.push("/support")} />
  </NativePage>;
}
function exportStatusLabel(status: PersonalDataExportApiView["status"]) { return ({ PENDING: "排队中", PROCESSING: "生成中", COMPLETED: "可下载", FAILED: "生成失败", EXPIRED: "已过期" } as const)[status]; }
function formatTime(value: string) { const date = new Date(value); return Number.isNaN(date.getTime()) ? "--" : date.toLocaleString("zh-CN", { hour12: false }); }
const styles = StyleSheet.create({ content: { gap: 13 }, hero: { padding: 20, borderWidth: 1, borderColor: "rgba(39,143,232,0.13)", borderRadius: 19, backgroundColor: "rgba(220,238,255,0.95)", ...nativeShadow }, heroTitle: { color: colors.text, fontSize: 18, fontWeight: "900", textAlign: "center" }, heroText: { marginTop: 8, color: colors.textSecondary, fontSize: 12, lineHeight: 18, textAlign: "center" }, job: { paddingHorizontal: 4, paddingBottom: 8 }, divider: { height: 1, marginTop: 10, backgroundColor: "rgba(62,57,47,0.10)" } });
