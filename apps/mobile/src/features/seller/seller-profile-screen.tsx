import { zodResolver } from "@hookform/resolvers/zod";
import { router } from "expo-router";
import { Controller, useForm } from "react-hook-form";
import { Alert, StyleSheet, Switch, Text, View } from "react-native";
import { useState } from "react";
import { ApiClientError } from "@/api/api-error";
import { FileImage } from "@/components/file-image";
import { FormField } from "@/components/form-field";
import { NativePage, nativeShadow } from "@/components/native-page";
import { NoticeBanner } from "@/components/notice-banner";
import { PrimaryButton } from "@/components/primary-button";
import { StateView } from "@/components/state-view";
import { ImageUploadSlot } from "@/features/files/image-upload-slot";
import { VoiceUploadSlot } from "@/features/files/voice-upload-slot";
import { saveSellerProfileRevision, submitSellerProfileRevision, updateSellerProfile, useSellerProfile } from "@/features/seller/seller-api";
import { sellerBuyerCacheKeys, sellerProfileSchema, type SellerProfileValues } from "@/features/seller/seller-domain";
import { queryClient } from "@/query/query-client";
import { colors, radii, spacing, typography } from "@/theme/tokens";
import type { FileApiView, SellerProfileApiView, SellerProfileRevisionApiView } from "@/types/api";

export function SellerProfileScreen() {
  const query = useSellerProfile();
  if (query.isPending) return <NativePage title="主页管理" subtitle="公开资料修改需要重新审核"><View style={styles.state}><StateView kind="loading" /></View></NativePage>;
  if (!query.data || query.isError) return <NativePage title="主页管理" subtitle="公开资料修改需要重新审核"><View style={styles.state}><StateView kind="error" onRetry={() => void query.refetch()} /></View></NativePage>;
  if (!["APPROVED", "SUSPENDED"].includes(query.data.status)) return <NativePage title="主页管理" subtitle="公开资料修改需要重新审核"><NoticeBanner tone="danger" message="只有已通过审核的陪玩可以管理公开主页。" /></NativePage>;
  return <SellerProfileForm profile={query.data} refetch={query.refetch} />;
}

function SellerProfileForm({ profile, refetch }: { profile: SellerProfileApiView; refetch(): Promise<unknown> }) {
  const [current, setCurrent] = useState(profile);
  const [pending, setPending] = useState<SellerProfileRevisionApiView | null>(profile.pending_profile_revision ?? null);
  const [draft, setDraft] = useState(() => profile.pending_profile_revision?.snapshot ?? publicSnapshot(profile));
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const { control, getValues, handleSubmit, formState: { errors } } = useForm<SellerProfileValues>({ resolver: zodResolver(sellerProfileSchema), defaultValues: valuesFromSnapshot(draft) });
  const reviewLocked = pending ? ["SUBMITTED", "UNDER_REVIEW"].includes(pending.status) : false;

  const conflict = async () => {
    await refetch();
    setNotice("资料版本已变化，已读取服务端最新状态。请返回后重新进入，避免覆盖其他设备修改。");
  };

  const persistDraft = async (values: SellerProfileValues, media = draft) => {
    const result = await saveSellerProfileRevision({ seller_nickname: values.sellerNickname, seller_avatar_file_id: media.seller_avatar_file_id, cover_file_id: media.cover_file_id, introduction: values.introduction, game_rank: values.gameRank, kd: values.kd, preferred_mode: values.preferredMode, play_style: values.playStyle, game_experience: values.gameExperience, voice_file_id: media.voice_file_id, voice_duration_ms: media.voice_duration_ms, seller_version: current.version, ...(pending ? { application_version: pending.version } : {}) });
    setPending(result); setDraft(result.snapshot);
    return result;
  };

  const submit = handleSubmit(async (values) => {
    setBusy(true); setNotice(null);
    try {
      const saved = await persistDraft(values);
      const submitted = await submitSellerProfileRevision(saved.id, saved.version);
      setPending(submitted);
      await Promise.all([queryClient.invalidateQueries({ queryKey: ["seller-profile"] }), queryClient.invalidateQueries({ queryKey: ["seller-applications"] })]);
      setNotice("资料变更已提交后台审核。审核通过前，买家仍看到当前公开版本。");
    } catch (error) {
      if (error instanceof ApiClientError && error.code === "RESOURCE_VERSION_CONFLICT") await conflict();
      else setNotice(error instanceof ApiClientError ? error.message : "资料变更提交失败");
    } finally { setBusy(false); }
  });

  const toggle = async () => {
    setBusy(true); setNotice(null);
    try {
      const updated = await updateSellerProfile({ ...publicSnapshot(current), accepting_orders: !current.accepting_orders, version: current.version });
      setCurrent(updated);
      queryClient.setQueryData(["seller-profile"], { ...updated, pending_profile_revision: pending, latest_application: current.latest_application });
      await invalidateSellerPublic(updated.id);
    } catch (error) {
      if (error instanceof ApiClientError && error.code === "RESOURCE_VERSION_CONFLICT") await conflict();
      else setNotice(error instanceof ApiClientError ? error.message : "接单状态更新失败");
    } finally { setBusy(false); }
  };

  const bindImage = async (field: "seller_avatar_file_id" | "cover_file_id", file: FileApiView) => {
    const next = { ...draft, [field]: file.id };
    const saved = await persistDraft(getValues(), next);
    setNotice(`${field === "seller_avatar_file_id" ? "陪玩头像" : "主页封面"}已加入资料变更草稿，提交并审核通过后才会公开。`);
    void saved;
  };
  const bindVoice = async (file: FileApiView) => {
    const next = { ...draft, voice_file_id: file.id, voice_duration_ms: file.duration_ms };
    const saved = await persistDraft(getValues(), next);
    setNotice("声音名片已加入资料变更草稿，提交并审核通过后才会公开。");
    void saved;
  };

  return <NativePage title="主页管理" subtitle="公开资料修改需要重新审核" contentStyle={styles.content}>
    {notice ? <NoticeBanner tone={notice.includes("已提交") || notice.includes("已加入") ? "success" : "danger"} message={notice} /> : null}
    <View style={styles.cover}><FileImage fileId={current.cover_file_id} style={styles.coverImage} label="当前公开主页封面" /><View style={styles.coverBadge}><Text style={styles.coverBadgeText}>{current.accepting_orders ? "在线接单" : "暂停接单"}</Text></View><View style={styles.coverCopy}><FileImage fileId={current.seller_avatar_file_id} style={styles.avatar} label="当前公开陪玩头像" /><View style={styles.flex}><Text style={styles.coverName}>{current.seller_nickname}</Text><Text style={styles.coverMeta}>{current.game_rank || "未填写段位"} · K/D {current.kd || "--"}</Text></View></View></View>
    <NoticeBanner message="上方是买家当前看到的公开版本。昵称、介绍、头像、封面和声音名片的修改会生成审核快照，管理员通过后才会整体替换。" />
    {pending ? <NoticeBanner tone={pending.status === "NEEDS_SUPPLEMENT" ? "danger" : "info"} message={`资料变更：${revisionStatus(pending.status)}（第 ${pending.version_no} 版）${pending.rejection_reason ? `；原因：${pending.rejection_reason}` : ""}`} /> : null}
    <View style={styles.switchRow}><View style={styles.flex}><Text style={styles.section}>当前接单状态</Text><Text style={styles.meta}>接单开关即时生效，不进入资料审核。</Text></View><Switch accessibilityLabel="是否接受新订单" value={current.accepting_orders} disabled={busy || current.status !== "APPROVED"} onValueChange={() => void toggle()} trackColor={{ true: colors.brand, false: colors.border }} /></View>
    {reviewLocked ? <NoticeBanner message="该版本正在后台审核，暂时不能覆盖。审核完成或要求补充后可继续编辑。" /> : <>
      <NoticeBanner message="新文件先经过本地 MinIO 校验和人工文件审核；加入资料草稿后，还需要陪玩资料审核。声音名片不会保存预签名地址。" />
      <ImageUploadSlot fileType="SELLER_AVATAR" label="待审核陪玩头像" currentFileId={draft.seller_avatar_file_id} expectedVisibility="PUBLIC" aspect={[1, 1]} onReady={(file) => bindImage("seller_avatar_file_id", file)} />
      <ImageUploadSlot fileType="SELLER_COVER" label="待审核主页封面" currentFileId={draft.cover_file_id} expectedVisibility="PUBLIC" aspect={[16, 9]} onReady={(file) => bindImage("cover_file_id", file)} />
      <VoiceUploadSlot currentFileId={draft.voice_file_id} onReady={bindVoice} />
      <View style={styles.formPanel}><Controller control={control} name="sellerNickname" render={({ field }) => <FormField label="陪玩昵称" value={field.value} onChangeText={field.onChange} onBlur={field.onBlur} error={errors.sellerNickname?.message} />} /><Controller control={control} name="introduction" render={({ field }) => <FormField label="主页介绍" value={field.value} onChangeText={field.onChange} onBlur={field.onBlur} multiline style={styles.multiline} error={errors.introduction?.message} />} /><Controller control={control} name="gameRank" render={({ field }) => <FormField label="当前段位" value={field.value} onChangeText={field.onChange} onBlur={field.onBlur} error={errors.gameRank?.message} />} /><Controller control={control} name="kd" render={({ field }) => <FormField label="K/D" value={field.value} onChangeText={field.onChange} onBlur={field.onBlur} keyboardType="decimal-pad" error={errors.kd?.message} />} /><Controller control={control} name="preferredMode" render={({ field }) => <FormField label="擅长模式" value={field.value} onChangeText={field.onChange} onBlur={field.onBlur} error={errors.preferredMode?.message} />} /><Controller control={control} name="playStyle" render={({ field }) => <FormField label="擅长玩法" value={field.value} onChangeText={field.onChange} onBlur={field.onBlur} error={errors.playStyle?.message} />} /><Controller control={control} name="gameExperience" render={({ field }) => <FormField label="游戏经验" value={field.value} onChangeText={field.onChange} onBlur={field.onBlur} multiline style={styles.multiline} error={errors.gameExperience?.message} />}/></View>
      <PrimaryButton label="提交资料变更审核" loading={busy} disabled={busy} onPress={() => Alert.alert("提交资料变更审核", "审核通过前不会影响当前公开主页。确认提交这个完整版本？", [{ text: "取消", style: "cancel" }, { text: "确认提交", onPress: () => void submit() }])} />
    </>}
    <PrimaryButton tone="plain" label="预览当前公开主页" onPress={() => router.push("/seller/preview")} />
  </NativePage>;
}

function publicSnapshot(profile: SellerProfileApiView) { return { seller_nickname: profile.seller_nickname, seller_avatar_file_id: profile.seller_avatar_file_id, cover_file_id: profile.cover_file_id, introduction: profile.introduction, game_rank: profile.game_rank, kd: profile.kd, preferred_mode: profile.preferred_mode, play_style: profile.play_style, game_experience: profile.game_experience, voice_file_id: profile.voice_file_id, voice_duration_ms: profile.voice_duration_ms }; }
function valuesFromSnapshot(snapshot: ReturnType<typeof publicSnapshot>): SellerProfileValues { return { sellerNickname: snapshot.seller_nickname, introduction: snapshot.introduction ?? "", gameRank: snapshot.game_rank ?? "", kd: snapshot.kd ?? "", preferredMode: snapshot.preferred_mode ?? "", playStyle: snapshot.play_style ?? "", gameExperience: snapshot.game_experience ?? "" }; }
function revisionStatus(status: SellerProfileRevisionApiView["status"]) { return ({ DRAFT: "草稿", SUBMITTED: "待受理", UNDER_REVIEW: "审核中", NEEDS_SUPPLEMENT: "需要补充资料", APPROVED: "已通过", REJECTED: "已驳回" } as const)[status]; }
async function invalidateSellerPublic(sellerId: string) { await Promise.all([queryClient.invalidateQueries({ queryKey: ["seller-overview"] }), ...sellerBuyerCacheKeys(sellerId).map((queryKey) => queryClient.invalidateQueries({ queryKey }))]); }

const styles = StyleSheet.create({ content: { gap: spacing.md }, state: { minHeight: 240, justifyContent: "center", borderRadius: 18, backgroundColor: "rgba(255,253,248,0.96)", ...nativeShadow }, cover: { position: "relative", height: 255, overflow: "hidden", borderRadius: 20, backgroundColor: "#CFE8FC", ...nativeShadow }, coverImage: { width: "100%", height: "100%" }, coverBadge: { position: "absolute", left: 13, top: 13, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10, backgroundColor: "#CFF20B" }, coverBadgeText: { color: "#2D3D0B", fontSize: 11, fontWeight: "900" }, coverCopy: { position: "absolute", left: 0, right: 0, bottom: 0, minHeight: 80, flexDirection: "row", alignItems: "center", gap: 11, paddingHorizontal: 14, backgroundColor: "rgba(18,29,43,0.66)" }, avatar: { width: 54, height: 54, borderWidth: 2, borderColor: "#FFFFFF", borderRadius: 18 }, coverName: { color: "#FFFFFF", fontSize: 18, fontWeight: "900" }, coverMeta: { marginTop: 4, color: "#E5F2FC", fontSize: 11 }, switchRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, padding: spacing.lg, borderWidth: 1, borderColor: "rgba(39,143,232,0.13)", borderRadius: radii.lg, backgroundColor: "rgba(220,238,255,0.95)", ...nativeShadow }, formPanel: { gap: spacing.md, padding: spacing.lg, borderWidth: 1, borderColor: "rgba(62,57,47,0.10)", borderRadius: radii.lg, backgroundColor: "#FFFDF8", ...nativeShadow }, flex: { flex: 1 }, section: { ...typography.sectionTitle, color: colors.text }, meta: { ...typography.caption, color: colors.textSecondary }, multiline: { minHeight: 110, textAlignVertical: "top", paddingTop: spacing.md } });
