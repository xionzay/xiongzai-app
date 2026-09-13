import { useState } from "react";
import { ChevronLeftIcon } from "@/components/ui-icons";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { ApiClientError } from "@/api/api-error";
import { NoticeBanner } from "@/components/notice-banner";
import { createComplaint } from "@/features/after-sale/after-sale-api";
import { safeComplaintFiles } from "@/features/after-sale/after-sale-domain";
import { ImageUploadSlot } from "@/features/files/image-upload-slot";
import { queryClient } from "@/query/query-client";
import { colors } from "@/theme/tokens";
import type { FileApiView } from "@/types/api";
import { ShieldIcon } from "@/components/tab-icons";

const complaintTypes = ["服务与描述不符", "陪玩未按约定履约", "诱导线下交易", "不文明沟通", "其他问题"] as const;

const pageBands = Array.from({ length: 64 }, (_, index) => {
  const ratio = index / 63;
  const firstStop = 0.55;
  const from = ratio <= firstStop ? [238, 248, 255] : [255, 250, 240];
  const to = ratio <= firstStop ? [255, 250, 240] : [247, 251, 255];
  const progress = ratio <= firstStop ? ratio / firstStop : (ratio - firstStop) / (1 - firstStop);
  const channel = (value: number, target: number) => Math.round(value + (target - value) * progress);
  return `rgb(${channel(from[0]!, to[0]!)}, ${channel(from[1]!, to[1]!)}, ${channel(from[2]!, to[2]!)})`;
});

export function ComplaintCreateScreen() {
  const params = useLocalSearchParams<{ orderId?: string; refundId?: string; targetType?: string; targetId?: string }>();
  const targetType = (["USER", "SELLER", "PRODUCT", "ORDER"].includes(params.targetType ?? "") ? params.targetType : "ORDER") as "USER" | "SELLER" | "PRODUCT" | "ORDER";
  const targetId = params.targetId || params.orderId || "";
  const [type, setType] = useState<(typeof complaintTypes)[number]>(targetType === "USER" ? "不文明沟通" : complaintTypes[0]);
  const [typeOpen, setTypeOpen] = useState(false);
  const [description, setDescription] = useState("");
  const [fileIds, setFileIds] = useState<string[]>([]);
  const [slotKey, setSlotKey] = useState(0);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const targetLabel = targetType === "USER" ? "关联用户" : targetType === "SELLER" ? "关联陪玩" : targetType === "PRODUCT" ? "关联服务" : "关联订单";
  const valid = Boolean(targetId) && description.trim().length >= 5 && !busy;

  const addEvidence = async (file: FileApiView) => {
    if (fileIds.includes(file.id)) return;
    if (fileIds.length >= 6) throw new Error("每个投诉最多只能提交 6 张图片凭证");
    setFileIds((current) => [...current, file.id]);
    setSlotKey((current) => current + 1);
  };

  const submit = async () => {
    if (!valid) return;
    setBusy(true);
    setNotice(null);
    try {
      const context = params.refundId ? `关联退款单：${params.refundId}\n` : "";
      const result = await createComplaint({ target_type: targetType, target_id: targetId, complaint_type: type, description: `${context}${description.trim()}`, file_ids: safeComplaintFiles(true, fileIds) });
      const refreshes = [queryClient.invalidateQueries({ queryKey: ["my-complaints"] }), queryClient.invalidateQueries({ queryKey: ["buyer-orders"] })];
      if (targetType === "ORDER") refreshes.push(queryClient.invalidateQueries({ queryKey: ["order", targetId] }));
      await Promise.all(refreshes);
      router.replace({ pathname: "/complaints/[id]", params: { id: result.id } });
    } catch (error) {
      setNotice(error instanceof ApiClientError ? error.message : "投诉提交失败，请稍后重试");
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={["top", "left", "right", "bottom"]}>
      <ComplaintBackdrop />
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === "ios" ? "padding" : "height"} keyboardVerticalOffset={0}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <View style={styles.header}>
            <Pressable accessibilityRole="button" accessibilityLabel="返回订单详情" onPress={() => router.back()} style={styles.headerButton}><ChevronLeftIcon size={23} /></Pressable>
            <View style={styles.headerCopy}><Text style={styles.headerTitle}>投诉与平台介入</Text><Text style={styles.headerSubtitle}>平台将根据订单、聊天记录和证据进行核验</Text></View>
            <View style={styles.headerButton} />
          </View>

          {notice ? <View style={styles.notice}><NoticeBanner tone="danger" message={notice} /></View> : null}
          {!targetId ? <View style={styles.notice}><NoticeBanner tone="danger" message="未找到投诉对象，请从订单、退款或用户页面重新进入。" /></View> : null}

          <View style={[styles.formCard, typeOpen && styles.formCardOpen]}>
            <View style={styles.targetRow}><View style={styles.targetCopy}><Text style={styles.targetLabel}>{targetLabel}</Text><Text style={styles.targetValue} numberOfLines={1}>{targetId || "尚未关联"}</Text></View><View style={styles.targetBadge}><Text style={styles.targetBadgeText}>平台核验</Text></View></View>

            <View style={[styles.typeField, typeOpen && styles.typeFieldOpen]}>
              <Text style={styles.fieldLabel}>投诉类型</Text>
              <Pressable accessibilityRole="button" accessibilityState={{ expanded: typeOpen }} disabled={busy} onPress={() => setTypeOpen((value) => !value)} style={[styles.typeButton, typeOpen && styles.typeButtonOpen]}><Text style={styles.typeButtonText}>{type}</Text><Text style={[styles.typeArrow, typeOpen && styles.typeArrowOpen]}>⌄</Text></Pressable>
              {typeOpen ? <View accessibilityRole="list" style={styles.typeMenu}>{complaintTypes.map((item) => <Pressable key={item} accessibilityRole="button" accessibilityState={{ selected: item === type }} onPress={() => { setType(item); setTypeOpen(false); }} style={[styles.typeOption, item === type && styles.typeOptionActive]}><Text style={[styles.typeOptionText, item === type && styles.typeOptionTextActive]}>{item}</Text><View style={[styles.typeCheck, item !== type && styles.typeCheckEmpty]}><Text style={styles.typeCheckText}>{item === type ? "✓" : ""}</Text></View></Pressable>)}</View> : null}
            </View>

            <View style={styles.field}>
              <Text style={styles.fieldLabel}>问题说明</Text>
              <TextInput accessibilityLabel="投诉问题说明" value={description} onChangeText={setDescription} editable={!busy} multiline maxLength={500} placeholder="请说明问题发生的时间、过程和诉求" placeholderTextColor="#9A9892" textAlignVertical="top" style={styles.description} />
              <Text style={styles.counter}>{description.length}/500</Text>
              {description.length > 0 && description.trim().length < 5 ? <Text style={styles.fieldError}>请至少填写 5 个字的问题说明</Text> : null}
            </View>

            <View style={styles.evidenceSection}>
              <View style={styles.evidenceHeader}><Text style={styles.fieldLabel}>证据材料</Text><Text style={styles.evidenceCount}>{fileIds.length}/6</Text></View>
              {fileIds.map((id, index) => <View key={id} style={styles.evidenceRow}><View style={styles.evidenceMark}><Text style={styles.evidenceMarkText}>✓</Text></View><View style={styles.evidenceCopy}><Text style={styles.evidenceTitle}>私有图片凭证 {index + 1}</Text><Text style={styles.evidenceNote}>已完成校验并加入本次投诉</Text></View><Pressable accessibilityRole="button" accessibilityLabel={`从本次投诉移除私有图片凭证${index + 1}`} disabled={busy} onPress={() => setFileIds((current) => current.filter((item) => item !== id))} style={styles.removeButton}><Text style={styles.removeText}>从本次投诉移除</Text></Pressable></View>)}
              {fileIds.length < 6 ? <View style={styles.uploadWrap}><ImageUploadSlot key={slotKey} fileType="COMPLAINT_EVIDENCE" label="投诉图片凭证" expectedVisibility="PRIVATE" requireApproval readyLabel="添加到本次投诉" onReady={addEvidence} /></View> : null}
              <Text style={styles.evidenceHelp}>最多 6 张；图片只存入私有证据区，平台也会依法调取关联订单与聊天记录。</Text>
            </View>
          </View>

          {params.refundId ? <View style={styles.refundNote}><Text style={styles.refundNoteTitle}>已关联退款争议</Text><Text style={styles.refundNoteText}>退款信息会随投诉说明一并提交，方便平台核对完整处理记录。</Text></View> : null}

          <View style={styles.safetyCard}><ShieldIcon size={40} /><View style={styles.safetyCopy}><Text style={styles.safetyTitle}>请如实提交</Text><Text style={styles.safetyNote}>恶意投诉或伪造材料可能影响账号正常使用。</Text></View></View>

          <Pressable accessibilityRole="button" accessibilityLabel="提交平台处理" disabled={!valid} onPress={() => void submit()} style={[styles.submit, !valid && styles.disabled]}><Text style={styles.submitText}>{busy ? "正在提交…" : "提交平台处理"}</Text></Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function ComplaintBackdrop() { return <View pointerEvents="none" style={styles.backdrop}>{pageBands.map((color, index) => <View key={`${index}-${color}`} style={[styles.band, { backgroundColor: color }]} />)}</View>; }

const softShadow = { shadowColor: "#526F86", shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.13, shadowRadius: 28, elevation: 4 } as const;
const card = { borderWidth: 1, borderColor: "rgba(62,57,47,0.11)", borderRadius: 17, backgroundColor: "rgba(255,253,248,0.96)", ...softShadow } as const;

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#EEF8FF" },
  flex: { flex: 1 },
  backdrop: { position: "absolute", top: 0, bottom: 0, left: 0, right: 0 },
  band: { flex: 1 },
  content: { paddingBottom: 30 },
  header: { minHeight: 84, flexDirection: "row", alignItems: "center", paddingHorizontal: 9, paddingBottom: 11 },
  headerButton: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  back: { color: colors.text, fontSize: 38, lineHeight: 40 },
  headerCopy: { flex: 1, alignItems: "center" },
  headerTitle: { color: colors.text, fontSize: 23, lineHeight: 29, fontWeight: "900", textAlign: "center" },
  headerSubtitle: { marginTop: 3, color: "#74767B", fontSize: 12, lineHeight: 16, textAlign: "center" },
  notice: { marginHorizontal: 12, marginBottom: 10 },
  formCard: { position: "relative", zIndex: 2, marginHorizontal: 12, marginBottom: 10, padding: 15, ...card },
  formCardOpen: { zIndex: 40, elevation: 24 },
  targetRow: { minHeight: 55, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 18, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: "rgba(62,57,47,0.11)", paddingBottom: 13 },
  targetCopy: { minWidth: 0, flex: 1 },
  targetLabel: { color: "#74767B", fontSize: 12, lineHeight: 16 },
  targetValue: { maxWidth: 245, marginTop: 4, color: colors.text, fontSize: 12, lineHeight: 17, fontWeight: "900" },
  targetBadge: { minHeight: 28, justifyContent: "center", borderRadius: 9, paddingHorizontal: 9, backgroundColor: "#E3F3FF" },
  targetBadgeText: { color: "#2F75AE", fontSize: 12, fontWeight: "900" },
  field: { position: "relative", marginBottom: 18 },
  fieldLabel: { marginBottom: 8, color: colors.text, fontSize: 14, lineHeight: 19, fontWeight: "900" },
  typeField: { position: "relative", zIndex: 3, marginBottom: 18 },
  typeFieldOpen: { zIndex: 50, elevation: 26 },
  typeButton: { height: 52, flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderWidth: 2, borderColor: "#79B8E5", borderRadius: 15, paddingHorizontal: 13, backgroundColor: "#F4FAFF", shadowColor: "#C8E2F3", shadowOffset: { width: 0, height: 5 }, shadowOpacity: 1, shadowRadius: 0, elevation: 3 },
  typeButtonOpen: { borderColor: "#4D9BD3" },
  typeButtonText: { color: colors.text, fontSize: 13, fontWeight: "900" },
  typeArrow: { color: "#377FB8", fontSize: 20, fontWeight: "900" },
  typeArrowOpen: { transform: [{ rotate: "180deg" }] },
  typeMenu: { position: "absolute", zIndex: 60, top: 82, left: 0, right: 0, borderWidth: 2, borderColor: "#79B8E5", borderRadius: 18, padding: 7, backgroundColor: "#FFFAF0", shadowColor: "#2F597B", shadowOffset: { width: 0, height: 17 }, shadowOpacity: 0.2, shadowRadius: 30, elevation: 28 },
  typeOption: { minHeight: 44, flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderRadius: 11, paddingHorizontal: 10 },
  typeOptionActive: { backgroundColor: "#E3F3FF" },
  typeOptionText: { color: colors.text, fontSize: 13, fontWeight: "800" },
  typeOptionTextActive: { color: "#2678B7" },
  typeCheck: { width: 22, height: 22, alignItems: "center", justifyContent: "center", borderRadius: 7, backgroundColor: "#BADF28" },
  typeCheckEmpty: { backgroundColor: "transparent" },
  typeCheckText: { color: "#34470F", fontSize: 12, fontWeight: "900" },
  description: { minHeight: 125, borderWidth: 1, borderColor: "#D8D1C6", borderRadius: 15, padding: 13, paddingBottom: 30, backgroundColor: "#F7F3EC", color: colors.text, fontSize: 13, lineHeight: 19 },
  counter: { position: "absolute", right: 11, bottom: 9, color: "#74767B", fontSize: 12 },
  fieldError: { marginTop: 6, color: colors.danger, fontSize: 12, lineHeight: 16 },
  evidenceSection: { marginBottom: 1 },
  evidenceHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  evidenceCount: { marginBottom: 8, color: "#3478B2", fontSize: 12, fontWeight: "900" },
  uploadWrap: { overflow: "hidden", borderWidth: 2, borderStyle: "dashed", borderColor: "#C7D3DE", borderRadius: 13, backgroundColor: "#F2F7FB" },
  evidenceRow: { minHeight: 58, flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 8, borderWidth: 1, borderColor: "#C9DFEF", borderRadius: 13, padding: 9, backgroundColor: "#F4FAFF" },
  evidenceMark: { width: 30, height: 30, alignItems: "center", justifyContent: "center", borderRadius: 10, backgroundColor: "#BADF28" },
  evidenceMarkText: { color: "#34470F", fontSize: 12, fontWeight: "900" },
  evidenceCopy: { flex: 1 },
  evidenceTitle: { color: colors.text, fontSize: 12, fontWeight: "900" },
  evidenceNote: { marginTop: 3, color: "#74767B", fontSize: 12 },
  removeButton: { minHeight: 44, justifyContent: "center", borderRadius: 9, paddingHorizontal: 10, backgroundColor: "#FFF0EA" },
  removeText: { color: colors.accent, fontSize: 12, fontWeight: "900" },
  evidenceHelp: { marginTop: 8, color: "#74767B", fontSize: 12, lineHeight: 16 },
  refundNote: { marginHorizontal: 12, marginBottom: 10, padding: 14, borderWidth: 1, borderColor: "#B8D7ED", borderRadius: 16, backgroundColor: "#EEF8FF", ...softShadow },
  refundNoteTitle: { color: "#2D73AB", fontSize: 12, fontWeight: "900" },
  refundNoteText: { marginTop: 5, color: "#5D7485", fontSize: 12, lineHeight: 16 },
  safetyCard: { flexDirection: "row", alignItems: "center", gap: 12, marginHorizontal: 12, marginBottom: 10, padding: 15, ...card },
  safetyCopy: { flex: 1 },
  safetyTitle: { color: colors.text, fontSize: 13, fontWeight: "900" },
  safetyNote: { marginTop: 4, color: "#74767B", fontSize: 12, lineHeight: 16 },
  submit: { minHeight: 50, alignItems: "center", justifyContent: "center", marginHorizontal: 12, marginTop: 5, marginBottom: 18, borderRadius: 16, backgroundColor: colors.accent, shadowColor: "#FF4F15", shadowOffset: { width: 0, height: 7 }, shadowOpacity: 0.25, shadowRadius: 16, elevation: 4 },
  submitText: { color: colors.white, fontSize: 14, fontWeight: "900" },
  disabled: { opacity: 0.48 }
});
