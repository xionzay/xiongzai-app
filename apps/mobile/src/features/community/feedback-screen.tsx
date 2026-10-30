import { useEffect, useRef, useState } from "react";
import { StyleSheet, Text, TextInput, View } from "react-native";
import { randomUUID } from "expo-crypto";
import type { FeedbackResponse } from "@xiongzai/contracts/community";
import { NativePage, PaperCard } from "@/components/native-page";
import { NoticeBanner } from "@/components/notice-banner";
import { PrimaryButton } from "@/components/primary-button";
import { colors } from "@/theme/tokens";
import { communityClient, useFeedback, useFeedbackDetail, useFeedbackPolicy } from "./community-api";
import { communityError, FeedbackAttempt } from "./community-client";

export function FeedbackScreen({ userId, selectedId }: { userId: string; selectedId: string }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState<{ message: string; tone: "danger" | "success" } | null>(null);
  const alive = useRef(true);
  const attempt = useRef<FeedbackAttempt | null>(null);
  useEffect(() => {
    alive.current = true;
    attempt.current = new FeedbackAttempt(communityClient, randomUUID, () => alive.current);
    return () => { alive.current = false; attempt.current?.dispose(); };
  }, []);
  const policy = useFeedbackPolicy(userId);
  const history = useFeedback(userId);
  const detail = useFeedbackDetail(userId, selectedId);
  const limit = policy.data?.max_characters;
  const count = Array.from(text.trim()).length;
  const submit = async () => {
    if (busy || !attempt.current) return;
    setBusy(true); setNotice(null);
    try {
      await attempt.current.submit(text);
      if (!alive.current) return;
      setText(""); setNotice({ message: "反馈已保存，可在下方查看处理状态与官方回复。", tone: "success" });
      void history.refetch(); if (selectedId) void detail.refetch();
    } catch (error) {
      if (alive.current) setNotice({ message: communityError(error), tone: "danger" });
    } finally { if (alive.current) { setBusy(false); setPending(attempt.current?.pending ?? false); } }
  };
  const items = history.data?.pages.flatMap(page => page.items) ?? [];
  return <NativePage title="意见反馈" subtitle="官方留言与回复" refreshing={history.isRefetching} onRefresh={() => { void history.refetch(); void policy.refetch(); if (selectedId) void detail.refetch(); }}>
    <NoticeBanner message="这里只接收文字建议，不是客服工单。请勿填写验证码、密码、完整手机号或其他敏感信息；不承诺固定回复时限。" />
    {notice ? <NoticeBanner {...notice} /> : null}
    {policy.isPending ? <Text style={styles.note}>正在读取提交规则…</Text> : policy.isError ? <><NoticeBanner tone="danger" message="无法读取反馈规则，暂不能创建新反馈。" /><PrimaryButton label="重试读取规则" tone="plain" onPress={() => void policy.refetch()} /></> : <Text style={styles.note}>最多 {limit} 字，每小时最多 {policy.data.hourly_limit} 次，以服务端校验为准。</Text>}
    <Text style={styles.label}>你的建议（必填）</Text>
    <TextInput accessibilityLabel="文字建议" placeholder="告诉我们你希望改进的地方" placeholderTextColor={colors.textSecondary} multiline value={text} onChangeText={setText} editable={!busy && !pending} style={styles.input} />
    <Text style={styles.note}>{count}{limit ? ` / ${limit}` : ""} 字</Text>
    {limit && count > limit ? <NoticeBanner tone="danger" message="字数超过限制，请缩短后提交。" /> : null}
    {pending ? <NoticeBanner message="上次提交结果待核对，内容已锁定。请核对并重试，不要重复新建；离开后可先查我的反馈确认是否已保存。" /> : null}
    <PrimaryButton label={pending ? "核对结果并安全重试" : "提交建议"} loading={busy} disabled={busy || (!pending && (policy.isError || !limit || !count || count > limit))} onPress={() => void submit()} />
    <Text style={styles.note}>草稿和待确认请求仅保留在当前页面内，离开后不保存；已提交内容保存在当前账号的反馈记录中。</Text>
    {selectedId ? <View style={styles.section}><Text accessibilityRole="header" style={styles.label}>关联反馈</Text>{detail.isPending ? <Text>正在加载…</Text> : detail.isError || !detail.data ? <><NoticeBanner tone="danger" message={communityError(detail.error)} /><PrimaryButton label="重试读取关联反馈" tone="plain" onPress={() => void detail.refetch()} /></> : <FeedbackCard item={detail.data} />}</View> : null}
    <Text accessibilityRole="header" style={styles.label}>我的反馈</Text>
    {history.isPending ? <Text style={styles.note}>正在加载反馈…</Text> : history.isError ? <><NoticeBanner tone="danger" message="反馈读取失败，不能据此判断之前提交是否成功。" /><PrimaryButton label="重新加载反馈" tone="plain" onPress={() => void history.refetch()} /></> : <>
      {!items.length ? <Text style={styles.note}>暂无反馈记录。</Text> : items.map(item => <FeedbackCard key={item.id} item={item} />)}
      {history.hasNextPage ? <PrimaryButton label="加载更多反馈" tone="plain" loading={history.isFetchingNextPage} disabled={history.isFetchingNextPage} onPress={() => void history.fetchNextPage()} /> : null}
    </>}
  </NativePage>;
}
export function FeedbackCard({ item }: { item: FeedbackResponse }) {
  const status = { SUBMITTED: "已提交", PROCESSING: "处理中", REPLIED: "已回复" }[item.status];
  return <PaperCard><Text style={styles.label}>{status} · {new Date(item.created_at).toLocaleString("zh-CN")}</Text><Text selectable style={styles.content}>{item.content}</Text>{item.reply !== null ? <><Text style={styles.label}>官方回复</Text><Text selectable style={styles.content}>{item.reply}</Text></> : <Text style={styles.note}>暂无官方回复</Text>}</PaperCard>;
}
const styles = StyleSheet.create({ section: { gap: 12 }, label: { fontSize: 16, color: colors.text, marginVertical: 12 }, input: { minHeight: 140, padding: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.white, borderRadius: 10, fontSize: 15, color: colors.text, textAlignVertical: "top" }, note: { marginTop: 12, fontSize: 14, lineHeight: 21, color: colors.textSecondary }, content: { color: colors.text, fontSize: 16, lineHeight: 24 } });
