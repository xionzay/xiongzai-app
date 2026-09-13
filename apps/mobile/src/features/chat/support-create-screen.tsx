import { useState } from "react";
import { router, useLocalSearchParams } from "expo-router";
import { StyleSheet, Text, View } from "react-native";
import { ApiClientError } from "@/api/api-error";
import { FormField } from "@/components/form-field";
import { NativePage, PaperCard, SectionHeading } from "@/components/native-page";
import { NoticeBanner } from "@/components/notice-banner";
import { PrimaryButton } from "@/components/primary-button";
import { createSupportCase } from "@/features/chat/chat-api";
import { colors, spacing, typography } from "@/theme/tokens";
import type { RelatedObjectType } from "@/types/api";

const allowed = new Set<RelatedObjectType>(["ORDER", "PAYMENT", "REFUND", "COMPLAINT", "WITHDRAWAL"]);

export function SupportCreateScreen() {
  const params = useLocalSearchParams<{ relatedType?: string; relatedId?: string }>();
  const relatedType = allowed.has(params.relatedType as RelatedObjectType)
    ? params.relatedType as "ORDER" | "PAYMENT" | "REFUND" | "COMPLAINT" | "WITHDRAWAL"
    : undefined;
  const relatedId = relatedType ? params.relatedId : undefined;
  const [topic, setTopic] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const submit = async () => {
    if (topic.trim().length < 2 || message.trim().length < 1 || busy) return;
    setBusy(true);
    setNotice(null);
    try {
      const result = await createSupportCase({
        topic: topic.trim(),
        priority: "NORMAL",
        initial_message: message.trim(),
        ...(relatedType && relatedId ? { related_type: relatedType, related_id: relatedId } : {}),
        source_page: "mobile/support/new"
      });
      router.replace({ pathname: "/support/[id]", params: { id: result.id } });
    } catch (error) {
      setNotice(error instanceof ApiClientError ? error.message : "客服工单创建失败");
    } finally {
      setBusy(false);
    }
  };

  return (
    <NativePage title="联系客服" subtitle="平台客服会跟进你的问题">
      <View style={styles.content}>
        {notice ? <NoticeBanner tone="danger" message={notice} /> : null}
        <PaperCard style={styles.serviceCard}>
          <Text style={styles.serviceTitle}>熊崽客服中心</Text>
          <Text style={styles.serviceNote}>服务时间 09:00–24:00 · 消息真实提交到平台客服队列</Text>
        </PaperCard>
        {relatedType && relatedId ? (
          <PaperCard>
            <SectionHeading title="关联业务" note="提交后客服可直接查看相关记录" />
            <Text style={styles.related}>{relatedType} · {relatedId}</Text>
          </PaperCard>
        ) : null}
        <PaperCard style={styles.formCard}>
          <FormField label="问题主题" value={topic} onChangeText={setTopic} maxLength={120} placeholder="例如：订单服务需要协助" />
          <FormField label="问题说明" value={message} onChangeText={setMessage} maxLength={500} multiline style={styles.multiline} placeholder="请描述遇到的问题、订单号和期望处理方式" />
          <Text style={styles.counter}>{message.length}/500</Text>
        </PaperCard>
        <PrimaryButton label="提交并进入客服会话" loading={busy} disabled={busy || topic.trim().length < 2 || message.trim().length < 1} onPress={() => void submit()} />
        <Text style={styles.syncNote}>页面在前台联网时会自动同步客服回复</Text>
      </View>
    </NativePage>
  );
}

const styles = StyleSheet.create({
  content: { gap: spacing.md },
  serviceCard: { gap: 5, padding: spacing.lg, backgroundColor: "#FFF2CF" },
  serviceTitle: { ...typography.cardTitle, color: colors.text },
  serviceNote: { ...typography.caption, color: colors.textSecondary, lineHeight: 19 },
  related: { ...typography.body, color: colors.brandDeep, padding: spacing.lg, fontWeight: "800" },
  formCard: { gap: spacing.md, padding: spacing.lg },
  multiline: { minHeight: 150, textAlignVertical: "top", paddingTop: spacing.md },
  counter: { ...typography.caption, color: colors.textSecondary, marginTop: -spacing.sm, textAlign: "right" },
  syncNote: { ...typography.caption, color: colors.textSecondary, textAlign: "center" }
});
