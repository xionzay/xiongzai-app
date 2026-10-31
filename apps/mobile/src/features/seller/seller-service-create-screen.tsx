import { JellyIcon } from "../../components/jelly-icon";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Keyboard, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { router } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { ApiClientError, userFacingError } from "@/api/api-error";
import { useAuth } from "@/auth/auth-provider";
import { FormField } from "@/components/form-field";
import { FileImage } from "@/components/file-image";
import { BrandBackdrop } from "@/components/brand-backdrop";
import { ApprovedIllustration } from "@/components/approved-illustration";
import { MerchantHeader, MerchantDisclosure, merchantStyles } from "./merchant-page";
import { MerchantGameField } from "./merchant-game-field";
import { NoticeBanner } from "@/components/notice-banner";
import { StateView } from "@/components/state-view";
import { ImageUploadSlot } from "@/features/files/image-upload-slot";
import { addSellerSku, createSellerService, getSellerService, replaceSellerServiceImages, submitSellerService, useSellerProfile } from "@/features/seller/seller-api";
import { sellerEntry, sellerServiceSchema, sellerSkuSchema, type SellerServiceValues, type SellerSkuValues, yuanToCent } from "@/features/seller/seller-domain";
import { queryClient } from "@/query/query-client";
import { colors } from "@/theme/tokens";
import type { FileApiView } from "@/types/api";
import { fulfillmentHoursToSeconds, type ProductGame } from "@xiongzai/contracts/commerce";

export function SellerServiceCreateScreen() {
  const { status, user, bootstrapError, retryBootstrap } = useAuth();
  const [busy, setBusy] = useState(false);
  const createdId = useRef<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [coverFile, setCoverFile] = useState<FileApiView | null>(null);
  const [game, setGame] = useState<ProductGame>("PEACE_ELITE"), [hours, setHours] = useState(""), [single, setSingle] = useState(true), [price, setPrice] = useState("");
  const [gallery, setGallery] = useState<FileApiView[]>([]), [detailImages, setDetailImages] = useState<FileApiView[]>([]);
  const [showUploader, setShowUploader] = useState(false);
  const [showGallery, setShowGallery] = useState(false), [showDetails, setShowDetails] = useState(false);
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const [specs, setSpecs] = useState<SpecDraft[]>(() => [createSpecDraft(), createSpecDraft()]);
  const [specErrors, setSpecErrors] = useState<Record<string, { skuName?: string; priceYuan?: string }>>({});
  const seller = useSellerProfile(status === "authenticated" && Boolean(user));
  const service = useForm<SellerServiceValues>({ resolver: zodResolver(sellerServiceSchema), defaultValues: { title: "", description: "" } });

  useEffect(() => {
    const showEvent = Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvent = Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";
    const showSubscription = Keyboard.addListener(showEvent, () => setKeyboardVisible(true));
    const hideSubscription = Keyboard.addListener(hideEvent, () => setKeyboardVisible(false));
    return () => {
      showSubscription.remove();
      hideSubscription.remove();
    };
  }, []);

  const save = (submitForReview: boolean) => service.handleSubmit(async (serviceValues) => {
    if (busy) return;
    if (createdId.current) { router.replace({ pathname: "/seller/services/[id]/edit", params: { id: createdId.current } }); return; }
    let seconds: number;
    try { seconds = fulfillmentHoursToSeconds(hours); } catch { setNotice("完成时限须为整数秒，最长 168 小时。"); return; }
    if (single && (!yuanToCent(price) || BigInt(yuanToCent(price)!) < 1n)) { setNotice("请输入有效的默认单价，最多两位小数。"); return; }
    if (!single && !specs.length) {
      setNotice("至少添加一个服务规格。");
      return;
    }
    const parsed = (single ? [] : specs).map((item) => ({ item, result: sellerSkuSchema.safeParse(item) }));
    const nextErrors: Record<string, { skuName?: string; priceYuan?: string }> = {};
    for (const row of parsed) {
      if (row.result.success) continue;
      const flattened = row.result.error.flatten().fieldErrors;
      nextErrors[row.item.localId] = { skuName: flattened.skuName?.[0], priceYuan: flattened.priceYuan?.[0] };
    }
    setSpecErrors(nextErrors);
    if (parsed.some((row) => !row.result.success)) {
      setNotice("请先完善规格名称和价格。");
      return;
    }
    if (submitForReview && !coverFile) {
      setNotice("提交审核前必须先上传并绑定一张通过审核的服务主图。");
      setShowUploader(true);
      return;
    }
    setBusy(true);
    setNotice(null);
    try {
      const product = await createSellerService({ title: serviceValues.title, description: serviceValues.description, service_time_description: null, cover_file_id: coverFile?.id ?? null, game, fulfillment_seconds: seconds, pricing_mode: single ? "SINGLE" : "MULTI", ...(single ? { price_cent: yuanToCent(price)! } : {}) });
      createdId.current = product.id;
      if (coverFile) {
        await replaceSellerServiceImages(product.id, {
          version: product.version,
          images: [{ file_id: coverFile.id, sort_order: 0, is_cover: true, image_kind: "GALLERY" }, ...gallery.filter(file=>file.id!==coverFile.id).map((file,index)=>({file_id:file.id,sort_order:index+1,is_cover:false,image_kind:"GALLERY" as const})), ...detailImages.filter(file=>file.id!==coverFile.id && !gallery.some(other=>other.id===file.id)).map((file,index)=>({file_id:file.id,sort_order:gallery.length+index+1,is_cover:false,image_kind:"DETAIL" as const}))]
        });
      }
      const validSpecs = parsed.map((row) => row.result.success ? row.result.data : null).filter((row): row is SellerSkuValues => Boolean(row));
      for (const [index, skuValues] of validSpecs.entries()) {
        await addSellerSku(product.id, { sku_name: skuValues.skuName, description: null, price_cent: yuanToCent(skuValues.priceYuan)!, sort_order: index });
      }
      if (submitForReview) {
        const latest = await getSellerService(product.id);
        await submitSellerService(product.id, latest.version);
      }
      await Promise.all([queryClient.invalidateQueries({ queryKey: ["seller-services"] }), queryClient.invalidateQueries({ queryKey: ["seller-overview"] })]);
      if (submitForReview) router.replace("/(seller-tabs)/services");
      else router.replace({ pathname: "/seller/services/[id]/edit", params: { id: product.id } });
    } catch (error) {
      setNotice(`${userFacingError(error)}${createdId.current ? " 草稿已创建，再次点击保存会进入已有草稿，不会重复创建。" : ""}`);
    } finally { setBusy(false); }
  });

  const updateSpec = (localId: string, field: "skuName" | "priceYuan", value: string) => {
    setSpecs((items) => items.map((item) => item.localId === localId ? { ...item, [field]: value } : item));
    setSpecErrors((errors) => ({ ...errors, [localId]: { ...errors[localId], [field]: undefined } }));
  };

  const safeBack = () => {
    if (router.canGoBack()) router.back();
    else router.replace("/(seller-tabs)/services");
  };

  if (status === "booting") return <StatePage onBack={safeBack}>{bootstrapError ? <StateView kind="error" title="无法恢复登录状态" message={bootstrapError} actionLabel="重试" onRetry={() => void retryBootstrap()} /> : <StateView kind="loading" title="正在恢复登录状态" />}</StatePage>;
  if (!user) return <StatePage onBack={safeBack}><StateView kind="empty" title="登录后发布服务" message="发布服务需要先登录并通过陪玩身份审核。" actionLabel="去登录" onRetry={() => router.replace({ pathname: "/(auth)/required", params: { returnTo: "/seller/services/new", action: "发布服务" } })} /></StatePage>;
  if (seller.isPending) return <StatePage onBack={safeBack}><StateView kind="loading" title="正在验证陪玩权限" /></StatePage>;
  if (seller.isError) {
    const notApplied = seller.error instanceof ApiClientError && seller.error.code === "SELLER_NOT_FOUND";
    return <StatePage onBack={safeBack}>{notApplied ? <StateView kind="empty" title="尚未申请陪玩身份" message="提交陪玩资料并通过审核后，才可以发布服务。" actionLabel="开始申请" onRetry={() => router.replace("/settings/switch-identity")} /> : <StateView kind="error" title="无法验证陪玩权限" message={userFacingError(seller.error)} actionLabel="重试" onRetry={() => void seller.refetch()} />}</StatePage>;
  }
  if (!seller.data || seller.data.status !== "APPROVED") {
    const entry = sellerEntry(seller.data?.status ?? "NOT_APPLIED", seller.data?.latest_application?.status);
    const copy = sellerPermissionCopy(entry);
    return <StatePage onBack={safeBack}><StateView kind={copy.kind} title={copy.title} message={copy.message} actionLabel={copy.actionLabel} onRetry={copy.onPress} /></StatePage>;
  }

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom", "left", "right"]}>
      <BrandBackdrop seller />
      <KeyboardAvoidingView style={styles.pageFlex} behavior={Platform.OS === "ios" ? "padding" : "height"} keyboardVerticalOffset={0}>
        <MerchantHeader title="发布商品" onBack={safeBack} />
        {notice ? <View style={styles.feedback}><NoticeBanner tone={notice.includes("已准备好") ? "success" : "danger"} message={notice} /></View> : null}
        <ScrollView
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}
          automaticallyAdjustKeyboardInsets={Platform.OS === "ios"}
          contentContainerStyle={styles.content}
        >
          <Text style={merchantStyles.sectionTitle}>商品信息</Text>
          <MerchantGameField value={game} onChange={setGame} disabled={busy} />
          <Pressable accessibilityRole="button" accessibilityLabel="上传主图" disabled={busy} accessibilityState={{ expanded: showUploader }} onPress={() => setShowUploader(value => !value)} style={styles.cover}>
            {coverFile ? <FileImage fileId={coverFile.id} style={styles.coverImage} label="服务主图预览" compact /> : <ApprovedIllustration kind="image" size={36} />}
            <View style={styles.pageFlex}><Text style={merchantStyles.sectionTitle}>{coverFile ? '更换商品封面' : '添加商品图片'}</Text><Text style={merchantStyles.note}>第一张作为封面，上传并审核通过后可使用。</Text></View><ApprovedIllustration kind="plus" size={24} />
          </Pressable>
          {showUploader ? <ImageUploadSlot
            fileType="PRODUCT_IMAGE"
            label="服务主图"
            currentFileId={coverFile?.id}
            expectedVisibility="PUBLIC"
            aspect={[1, 1]}
            readyLabel="使用为服务主图"
            onReady={async (file) => {
              setCoverFile(file);
              setShowUploader(false);
              setNotice("服务主图已准备好，保存草稿或提交审核时会绑定到商品。");
            }}
          /> : null}
          <MerchantDisclosure title="更多商品图片" summary={`已添加 ${gallery.length} 张`} expanded={showGallery} onToggle={() => setShowGallery(value => !value)}>
            <ImageUploadSlot key={`gallery-${gallery.length}`} fileType="PRODUCT_IMAGE" label="添加商品图（主图为首图）" expectedVisibility="PUBLIC" onReady={async(file)=>setGallery(rows=>rows.some(row=>row.id===file.id)?rows:[...rows,file])} />
            <View style={styles.thumbnails}>{gallery.map(file => <FileImage key={file.id} fileId={file.id} style={styles.thumbnail} label="已选择商品图" compact />)}</View>
          </MerchantDisclosure>
          <View style={styles.panel}>
            <View style={styles.required}><Text style={styles.requiredText}>必填</Text></View>
            <Controller control={service.control} name="title" render={({ field }) => <FormField label="商品标题（必填）" placeholder="例如：和平精英 · 经典组队陪玩" value={field.value} onChangeText={field.onChange} onBlur={field.onBlur} maxLength={40} editable={!busy} style={merchantStyles.input} error={service.formState.errors.title?.message} />} />
            <Controller control={service.control} name="description" render={({ field }) => <FormField label="商品描述（必填）" placeholder="介绍服务内容、沟通方式和注意事项" value={field.value} onChangeText={field.onChange} onBlur={field.onBlur} multiline maxLength={1000} editable={!busy} style={[merchantStyles.input, styles.multiline]} error={service.formState.errors.description?.message} />} />
          </View>
          <MerchantDisclosure title="详情图片（选填）" summary={`已添加 ${detailImages.length} 张`} expanded={showDetails} onToggle={() => setShowDetails(value => !value)}>
            <ImageUploadSlot key={`detail-${detailImages.length}`} fileType="PRODUCT_IMAGE" label="添加详情图" expectedVisibility="PUBLIC" onReady={async(file)=>setDetailImages(rows=>rows.some(row=>row.id===file.id)?rows:[...rows,file])} />
            <View style={styles.thumbnails}>{detailImages.map(file => <FileImage key={file.id} fileId={file.id} style={styles.thumbnail} label="已选择详情图" compact />)}</View>
          </MerchantDisclosure>
          <View style={styles.panel}>
            {single ? <FormField label="价格（元）" style={merchantStyles.input} value={price} onChangeText={setPrice} editable={!busy} keyboardType="decimal-pad" /> : null}
            <Pressable accessibilityRole="switch" accessibilityLabel="使用多规格" accessibilityState={{ checked: !single }} disabled={busy} onPress={() => setSingle(value => !value)} style={merchantStyles.disclosure}><View style={styles.pageFlex}><Text style={merchantStyles.sectionTitle}>{single ? '添加多规格' : '多规格与价格'}</Text><Text style={merchantStyles.note}>{single ? '当前使用单价，可按服务内容设置多个规格' : '点击切回单价，已填写的规格在本页保留'}</Text></View><ApprovedIllustration kind="chevron" rotation={single ? -90 : 0} size={18} /></Pressable>
          </View>
          {!single ? <View style={styles.panel}>
            <View style={styles.panelTitle}><Text style={styles.panelTitleText}>自定义规格与价格</Text><Text style={styles.panelTag}>卖家自主设计</Text></View>
            {specs.map((item, index) => <View key={item.localId} style={styles.specBlock}>
              <View style={styles.specRow}>
                <TextInput accessibilityLabel={`规格${index + 1}名称`} placeholder={`输入规格 ${index + 1} 名称`} placeholderTextColor="#9A9DA5" value={item.skuName} onChangeText={(value) => updateSpec(item.localId, "skuName", value)} maxLength={30} style={[styles.specName, specErrors[item.localId]?.skuName && styles.inputError]} />
                <View style={[styles.specPrice, specErrors[item.localId]?.priceYuan && styles.inputError]}><Text style={styles.currency}>¥</Text><TextInput accessibilityLabel={`规格${index + 1}价格`} placeholder="价格" placeholderTextColor="#9A9DA5" value={item.priceYuan} onChangeText={(value) => updateSpec(item.localId, "priceYuan", value)} keyboardType="decimal-pad" style={styles.specPriceInput} /></View>
                <Pressable accessibilityRole="button" accessibilityLabel={`删除规格${index + 1}`} onPress={() => setSpecs((items) => items.filter((row) => row.localId !== item.localId))} style={({ pressed }) => [styles.removeSpec, pressed && styles.pressed]}><Text style={styles.removeSpecText}><JellyIcon kind="close" label="关闭" /></Text></Pressable>
              </View>
              {specErrors[item.localId]?.skuName || specErrors[item.localId]?.priceYuan ? <Text style={styles.specError}>{specErrors[item.localId]?.skuName ?? specErrors[item.localId]?.priceYuan}</Text> : null}
            </View>)}
            <Pressable accessibilityRole="button" accessibilityLabel="添加规格" disabled={specs.length >= 9} onPress={() => setSpecs((items) => [...items, createSpecDraft()])} style={({ pressed }) => [styles.addSpec, specs.length >= 9 && styles.disabled, pressed && styles.pressed]}><Text style={styles.addSpecText}><JellyIcon kind="plus" /> 添加规格</Text></Pressable>
          </View> : null}
          <View style={styles.panel}><Text style={merchantStyles.sectionTitle}>服务约定</Text><FormField label="付款后完成时限（小时，最长 168）" style={merchantStyles.input} value={hours} onChangeText={setHours} editable={!busy} keyboardType="decimal-pad" /><Text style={merchantStyles.note}>自付款成功起计算，最长七天。</Text></View>
        </ScrollView>
        {!keyboardVisible ? <View style={styles.submitBar}>
          <Pressable accessibilityRole="button" disabled={busy} onPress={() => { void save(false)(); }} style={({ pressed }) => [styles.draftButton, busy && styles.disabled, pressed && styles.pressed]}><Text style={styles.draftText}>保存草稿</Text></Pressable>
          <Pressable accessibilityRole="button" disabled={busy} onPress={() => { void save(true)(); }} style={({ pressed }) => [styles.submitButton, busy && styles.disabled, pressed && styles.pressed]}><Text style={styles.submitText}>{busy ? "正在保存…" : "提交审核"}</Text></Pressable>
        </View> : null}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

type SpecDraft = SellerSkuValues & { localId: string };
let nextSpecId = 0;
function createSpecDraft(): SpecDraft {
  nextSpecId += 1;
  return { localId: `spec-${nextSpecId}`, skuName: "", description: "", priceYuan: "", durationMinutes: "60" };
}

function sellerPermissionCopy(entry: ReturnType<typeof sellerEntry>) {
  if (entry === "WAITING") return { kind: "empty" as const, title: "陪玩身份审核中", message: "审核完成前暂时不能发布服务。", actionLabel: "查看审核状态", onPress: () => router.replace("/settings/switch-identity") };
  if (entry === "SUPPLEMENT") return { kind: "error" as const, title: "申请需要补充资料", message: "请根据平台要求补充资料后重新提交。", actionLabel: "补充申请资料", onPress: () => router.replace("/settings/switch-identity") };
  if (entry === "REJECTED") return { kind: "error" as const, title: "陪玩身份审核未通过", message: "请查看审核原因并修改申请资料。", actionLabel: "修改申请资料", onPress: () => router.replace("/settings/switch-identity") };
  if (entry === "SUSPENDED") return { kind: "error" as const, title: "陪玩资格已暂停", message: "资格暂停期间不能发布新服务。", actionLabel: "查看陪玩身份", onPress: () => router.replace("/settings/switch-identity") };
  if (entry === "BANNED") return { kind: "error" as const, title: "陪玩资格已封禁", message: "当前账号不能发布新服务。", actionLabel: "查看陪玩身份", onPress: () => router.replace("/settings/switch-identity") };
  return { kind: "empty" as const, title: "陪玩申请尚未完成", message: "完成并提交陪玩申请后，才可以发布服务。", actionLabel: "继续申请", onPress: () => router.replace("/settings/switch-identity") };
}

function StatePage({ children, onBack }: { children: ReactNode; onBack(): void }) {
  return <SafeAreaView style={styles.safe} edges={["top", "bottom", "left", "right"]}><BrandBackdrop seller /><View style={styles.stateContent}><MerchantHeader title="发布商品" onBack={onBack} />{children}</View></SafeAreaView>;
}

const styles = StyleSheet.create({
  feedback: { paddingHorizontal: 12, paddingVertical: 8 },
  safe: { flex: 1, backgroundColor: "#D8EDFF" },
  pageFlex: { flex: 1 },
  thumbnails: { flexDirection: "row", flexWrap: "wrap", gap: 8 }, thumbnail: { width: 64, height: 64, borderRadius: 8 },
  content: { paddingHorizontal: 12, paddingBottom: 104, gap: 10 },
  stateContent: { flex: 1, paddingHorizontal: 12, gap: 12 },
  cover: { minHeight: 88, flexDirection: "row", alignItems: "center", gap: 12, padding: 12, borderWidth: 1, borderStyle: "dashed", borderColor: "rgba(112,134,180,0.5)", borderRadius: 8 },
  coverImage: { width: 64, height: 64, borderRadius: 8 },
  coverButton: { position: "absolute", right: 12, bottom: 12, minHeight: 44, justifyContent: "center", paddingHorizontal: 15, borderRadius: 12, backgroundColor: "#CFF20B",  },
  coverButtonText: { color: "#27350B", fontSize: 13, fontWeight: "900" },
  panel: { gap: 12, paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: "rgba(83,107,135,0.16)" },
  required: { alignSelf: "flex-end", paddingHorizontal: 8, paddingVertical: 4, borderRadius: 7, backgroundColor: "#EEE9FF" },
  requiredText: { color: "#674DBB", fontSize: 11, fontWeight: "800" },
  panelTitle: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  panelTitleText: { color: colors.text, fontSize: 16, fontWeight: "900" },
  panelTag: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 7, color: "#674DBB", backgroundColor: "#EEE9FF", fontSize: 11, fontWeight: "800" },
  multiline: { minHeight: 92, paddingTop: 13, textAlignVertical: "top" },
  specBlock: { gap: 4 },
  specRow: { minHeight: 50, flexDirection: "row", alignItems: "center", gap: 7 },
  specName: { flex: 1, minHeight: 50, paddingHorizontal: 13, borderWidth: 1, borderColor: "rgba(62,57,47,0.16)", borderRadius: 12, backgroundColor: "rgba(214,229,251,0.6)", color: colors.text, fontSize: 14 },
  specPrice: { width: 105, minHeight: 50, flexDirection: "row", alignItems: "center", paddingHorizontal: 10, borderWidth: 1, borderColor: "rgba(62,57,47,0.16)", borderRadius: 12, backgroundColor: "rgba(214,229,251,0.6)" },
  specPriceInput: { flex: 1, minHeight: 48, color: colors.text, fontSize: 14 },
  currency: { marginRight: 4, color: colors.text, fontSize: 14, fontWeight: "800" },
  removeSpec: { width: 44, height: 44, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: "rgba(62,57,47,0.13)", borderRadius: 12, backgroundColor: "#FFFFFF" },
  removeSpecText: { color: colors.textSecondary, fontSize: 24, lineHeight: 28 },
  addSpec: { minHeight: 48, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: "rgba(62,57,47,0.14)", borderRadius: 13, backgroundColor: "rgba(214,229,251,0.6)" },
  addSpecText: { color: colors.brandDeep, fontSize: 13, fontWeight: "900" },
  specError: { color: colors.danger, fontSize: 11, lineHeight: 15 },
  inputError: { borderColor: colors.danger },
  submitBar: { flexDirection: "row", gap: 9, paddingHorizontal: 13, paddingTop: 10, paddingBottom: 10, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: "rgba(62,57,47,0.10)", backgroundColor: "rgba(220,228,250,0.96)", shadowColor: "#4B3A23", shadowOffset: { width: 0, height: -8 }, shadowOpacity: 0.06, shadowRadius: 22, elevation: 8 },
  draftButton: { width: 115, minHeight: 50, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: "rgba(62,57,47,0.14)", borderRadius: 15, backgroundColor: "rgba(214,229,251,0.6)" },
  draftText: { color: colors.text, fontSize: 14, fontWeight: "900" },
  submitButton: { flex: 1, minHeight: 50, alignItems: "center", justifyContent: "center", borderRadius: 15, backgroundColor: "#4b5ed7",  },
  submitText: { color: "#FFFFFF", fontSize: 14, fontWeight: "900" },
  disabled: { opacity: 0.48 },
  pressed: { opacity: 0.72 }
});
