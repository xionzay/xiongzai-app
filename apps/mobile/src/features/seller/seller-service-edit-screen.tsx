import { useEffect, useState } from "react";
import { Alert, Pressable, StyleSheet, Text, View } from "react-native";
import { Controller, useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { router } from "expo-router";
import { ApiClientError, userFacingError } from "@/api/api-error";
import { FileImage } from "@/components/file-image";
import { FormField } from "@/components/form-field";
import { NativePage, nativeShadow } from "@/components/native-page";
import { NoticeBanner } from "@/components/notice-banner";
import { PrimaryButton } from "@/components/primary-button";
import { StateView } from "@/components/state-view";
import { ImageUploadSlot } from "@/features/files/image-upload-slot";
import { addSellerSku, deleteSellerService, deleteSellerSku, offSaleSellerService, replaceSellerServiceImages, submitSellerService, updateSellerService, updateSellerSku, useSellerProfile, useSellerService } from "@/features/seller/seller-api";
import { canSubmitSellerService, centToYuanInput, sellerBuyerCacheKeys, sellerServiceActions, sellerServiceSchema, sellerSkuSchema, type SellerServiceValues, type SellerSkuValues, yuanToCent } from "@/features/seller/seller-domain";
import { queryClient } from "@/query/query-client";
import { colors, radii, spacing, typography } from "@/theme/tokens";
import type { FileApiView, ServiceImageApiView, ServiceSkuApiView } from "@/types/api";

import { ServiceCategoryFields, PackageUnits } from "./service-category-fields";
import { validUnitCount, type BillingUnit } from "@/features/catalog/service-catalog";

const serviceStatusLabel = {
  DRAFT: "草稿",
  PENDING_REVIEW: "审核中",
  REVIEW_REJECTED: "审核未通过",
  ON_SALE: "出售中",
  OFF_SALE: "已下架",
  ADMIN_OFF_SALE: "平台下架",
  DELETED: "已删除"
} as const;

export function SellerServiceEditScreen({ id }: { id: string }) {
  const query = useSellerService(id);
  const seller = useSellerProfile();
  const categoryForm = useForm<{ id: string | null; attributes: Record<string, string> }>({ defaultValues: { id: null, attributes: {} } });
  const categoryId = useWatch({ control: categoryForm.control, name: "id" });
  const attributes = useWatch({ control: categoryForm.control, name: "attributes" });
  const [billingUnit, setBillingUnit] = useState<BillingUnit>("SESSION");
  const [unitCount, setUnitCount] = useState("1");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [confirmingSubmit, setConfirmingSubmit] = useState(false);
  const productForm = useForm<SellerServiceValues>({ resolver: zodResolver(sellerServiceSchema), defaultValues: { title: "", description: "" } });
  const newSkuForm = useForm<SellerSkuValues>({ resolver: zodResolver(sellerSkuSchema), defaultValues: { skuName: "", description: "", priceYuan: "", durationMinutes: "60" } });

  useEffect(() => {
    if (!query.data) return;
    categoryForm.reset({ id: query.data.category_id ?? null, attributes: query.data.attributes ?? {} });
    productForm.reset({ title: query.data.title, description: query.data.description });
  }, [categoryForm, productForm, query.data]);

  if (query.isPending || seller.isPending) return <NativePage title="编辑服务" subtitle="修改展示内容与服务规格"><View style={styles.state}><StateView kind="loading" /></View></NativePage>;
  if (!seller.data || seller.data.status !== "APPROVED") return <NativePage title="编辑服务" subtitle="修改展示内容与服务规格"><NoticeBanner tone="danger" message="G05 权限限制：只有 APPROVED 陪玩可以管理服务。" /><PrimaryButton tone="plain" label="查看陪玩身份" onPress={() => router.replace("/seller/status")} /></NativePage>;
  if (!query.data || query.isError) return <NativePage title="编辑服务" subtitle="修改展示内容与服务规格"><View style={styles.state}><StateView kind="error" title="服务无法加载" onRetry={() => void query.refetch()} /></View></NativePage>;
  const product = query.data;
  const editable = sellerServiceActions(product.status).includes("EDIT");
  const coverFileId = product.cover_file_id ?? product.images.find((image) => image.is_cover)?.file_id ?? product.images[0]?.file_id ?? null;

  const refresh = async () => {
    await query.refetch();
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["seller-services"] }),
      queryClient.invalidateQueries({ queryKey: ["seller-overview"] }),
      ...sellerBuyerCacheKeys(product.seller_id, product.id).map((queryKey) => queryClient.invalidateQueries({ queryKey }))
    ]);
  };
  const run = async (action: () => Promise<unknown>, success: string) => {
    if (busy) return;
    setBusy(true);
    setNotice(null);
    try {
      await action();
      await refresh();
      setNotice(success);
    } catch (error) {
      if (error instanceof ApiClientError && error.code === "RESOURCE_VERSION_CONFLICT") {
        await query.refetch();
        setNotice("服务或规格已在其他设备更新，已重新加载最新版本，请确认后重试。");
      } else setNotice(userFacingError(error));
    } finally { setBusy(false); }
  };
  const saveProduct = productForm.handleSubmit(async (values) => run(() => updateSellerService(id, { category_id: categoryId, attributes, title: values.title, description: values.description, service_time_description: product.service_time_description, cover_file_id: product.cover_file_id, version: product.version }), "服务资料已保存"));
  const addSku = newSkuForm.handleSubmit(async (values) => run(async () => {
    if (!validUnitCount(unitCount)) throw new Error("套餐数量应为 1–1000");
    await addSellerSku(id, { billing_unit: billingUnit, unit_count: Number(unitCount), sku_name: values.skuName, description: values.description || null, price_cent: yuanToCent(values.priceYuan)!, duration_minutes: Number(values.durationMinutes), sort_order: product.skus.filter((sku) => sku.status !== "DELETED").length });
    newSkuForm.reset({ skuName: "", description: "", priceYuan: "", durationMinutes: "60" });
  }, "规格已添加"));
  const submitReview = () => run(() => submitSellerService(id, product.version), "已提交平台审核");
  const imagePayload = (images: ServiceImageApiView[]) => images.map((image, index) => ({ file_id: image.file_id, sort_order: index, is_cover: image.is_cover }));
  const replaceImages = (images: ServiceImageApiView[], success: string) => run(() => replaceSellerServiceImages(id, { version: product.version, images: imagePayload(images) }), success);
  const bindProductImage = async (file: FileApiView) => {
    if (product.images.length >= 9) throw new Error("每个服务最多只能绑定 9 张图片");
    setBusy(true); setNotice(null);
    try {
      const next = [...product.images.map((image) => ({ ...image, is_cover: product.images.some((item) => item.is_cover) ? image.is_cover : false })), { id: file.id, product_id: id, file_id: file.id, sort_order: product.images.length, is_cover: product.images.length === 0 }];
      await replaceSellerServiceImages(id, { version: product.version, images: imagePayload(next) });
      await refresh(); setNotice("服务图片已绑定");
    } catch (error) {
      if (error instanceof ApiClientError && error.code === "RESOURCE_VERSION_CONFLICT") await query.refetch();
      throw error;
    } finally { setBusy(false); }
  };

  const deleteProduct = () => Alert.alert("删除服务", "删除后服务会进入已删除状态，确认继续？", [{ text: "取消", style: "cancel" }, { text: "删除", style: "destructive", onPress: async () => {
    if (busy) return;
    setBusy(true);
    try {
      await deleteSellerService(id, product.version);
      await Promise.all([queryClient.invalidateQueries({ queryKey: ["seller-services"] }), queryClient.invalidateQueries({ queryKey: ["seller-overview"] })]);
      router.replace("/(seller-tabs)/services");
    } catch (error) { setNotice(userFacingError(error)); } finally { setBusy(false); }
  } }]);

  const canDelete = sellerServiceActions(product.status).includes("DELETE");
  const canOffSale = sellerServiceActions(product.status).includes("OFF_SALE");
  const footer = (
    <View style={styles.footerBar}>
      {canOffSale ? (
        <Pressable accessibilityRole="button" accessibilityLabel="下架服务" disabled={busy} onPress={() => Alert.alert("下架服务", "下架后买家端将不再展示，确认继续？", [{ text: "取消", style: "cancel" }, { text: "下架", onPress: () => void run(() => offSaleSellerService(id, product.version), "服务已下架") }])} style={({ pressed }) => [styles.footerSecondary, busy && styles.disabled, pressed && styles.pressed]}><Text style={styles.footerSecondaryText}>下架服务</Text></Pressable>
      ) : canDelete ? (
        <Pressable accessibilityRole="button" accessibilityLabel="删除服务" disabled={busy} onPress={deleteProduct} style={({ pressed }) => [styles.footerSecondary, busy && styles.disabled, pressed && styles.pressed]}><Text style={styles.footerSecondaryText}>删除服务</Text></Pressable>
      ) : <View style={styles.footerSecondary} />}
      <Pressable accessibilityRole="button" accessibilityLabel="保存修改" disabled={busy || !editable} onPress={() => void saveProduct()} style={({ pressed }) => [styles.footerPrimary, (busy || !editable) && styles.disabled, pressed && editable && styles.pressed]}><Text style={styles.footerPrimaryText}>{busy ? "保存中…" : "保存修改"}</Text></Pressable>
    </View>
  );

  return <NativePage
    title="编辑服务"
    subtitle="修改公开展示与服务规格"
    action={<Pressable accessibilityRole="button" accessibilityLabel="预览服务" disabled={product.status !== "ON_SALE"} onPress={() => router.push({ pathname: "/services/[id]", params: { id } })} style={({ pressed }) => [styles.previewButton, product.status !== "ON_SALE" && styles.disabled, pressed && styles.pressed]}><Text style={styles.previewText}>预览</Text></Pressable>}
    footer={footer}
    contentStyle={styles.content}
  >
    <View style={styles.reviewNotice}><Text style={styles.reviewIcon}>!</Text><View style={styles.flex}><Text style={styles.reviewTitle}>重要字段修改后需要重新审核</Text><Text style={styles.reviewText}>输入框保留当前内容，可直接修改需要更新的部分。</Text></View></View>
    <View style={styles.coverHero}>
      <FileImage fileId={coverFileId} style={styles.coverImage} label="当前服务主图" />
      <Pressable accessibilityRole="button" accessibilityLabel="管理服务图片" onPress={() => setNotice("请在下方服务图片区选择、上传或设置主图。") } style={({ pressed }) => [styles.coverButton, pressed && styles.pressed]}><Text style={styles.coverButtonText}>更换主图</Text></Pressable>
    </View>
    {product.status === "PENDING_REVIEW" || product.status === "REVIEW_REJECTED" ? <PrimaryButton tone="plain" label="查看审核详情" onPress={() => router.push({ pathname: "/seller/services/[id]/review", params: { id } })} /> : null}
    {notice ? <NoticeBanner tone={notice.includes("已") ? "success" : "danger"} message={notice} /> : null}
    {!editable ? <NoticeBanner tone="danger" message={product.status === "ON_SALE" ? "出售中的服务需先下架，才能修改展示内容和规格。" : `当前状态为“${serviceStatusLabel[product.status]}”，暂不允许编辑。`} /> : null}
    <View style={styles.formPanel}>
      <ServiceCategoryFields categoryId={categoryId} snapshot={product.category} attributes={attributes} editable={editable && !busy} onChange={(id, values) => { categoryForm.setValue("id", id); categoryForm.setValue("attributes", values); }} />
      <Controller control={productForm.control} name="title" render={({ field }) => <FormField editable={editable} label="服务标题" value={field.value} onChangeText={field.onChange} onBlur={field.onBlur} error={productForm.formState.errors.title?.message} />} />
      <Controller control={productForm.control} name="description" render={({ field }) => <FormField editable={editable} label="服务详情" value={field.value} onChangeText={field.onChange} onBlur={field.onBlur} multiline style={styles.multiline} error={productForm.formState.errors.description?.message} />} />
    </View>
    <Text style={styles.heading}>服务图片（{product.images.length}/9）</Text>
    {product.images.map((image, index) => <View key={image.id} style={styles.card}>
      <FileImage fileId={image.file_id} style={styles.serviceImage} label={image.is_cover ? "服务主图" : `服务图片 ${index + 1}`} />
      <Text style={styles.cardTitle}>{image.is_cover ? "主图" : `图片 ${index + 1}`}</Text>
      {editable && !image.is_cover ? <PrimaryButton tone="plain" label="设为主图" disabled={busy} onPress={() => void replaceImages(product.images.map((item) => ({ ...item, is_cover: item.id === image.id })), "主图已更新")} /> : null}
      {editable && index > 0 ? <PrimaryButton tone="plain" label="上移" disabled={busy} onPress={() => { const next = [...product.images]; [next[index - 1], next[index]] = [next[index]!, next[index - 1]!]; void replaceImages(next, "图片顺序已更新"); }} /> : null}
      {editable && index < product.images.length - 1 ? <PrimaryButton tone="plain" label="下移" disabled={busy} onPress={() => { const next = [...product.images]; [next[index], next[index + 1]] = [next[index + 1]!, next[index]!]; void replaceImages(next, "图片顺序已更新"); }} /> : null}
      {editable ? <PrimaryButton tone="plain" label="从服务移除" disabled={busy} onPress={() => { const next = product.images.filter((item) => item.id !== image.id); if (image.is_cover && next[0]) next[0] = { ...next[0], is_cover: true }; void replaceImages(next, "图片已从服务移除"); }} /> : null}
    </View>)}
    {editable && product.images.length < 9 ? <ImageUploadSlot fileType="PRODUCT_IMAGE" label="服务图片" expectedVisibility="PUBLIC" aspect={[4, 3]} readyLabel="添加到服务图片" onReady={bindProductImage} /> : null}
    <Text style={styles.heading}>规格管理</Text>
    {product.skus.filter((sku) => sku.status !== "DELETED").map((sku) => <SkuEditor key={`${sku.id}:${sku.version}`} productId={id} sku={sku} editable={editable} busy={busy} run={run} />)}
    {editable ? <View style={styles.card}>
      <Text style={styles.cardTitle}>添加规格</Text>
      <PackageUnits unit={billingUnit} count={unitCount} onChange={(unit, count) => { setBillingUnit(unit); setUnitCount(count); if (unit === "HOUR") newSkuForm.setValue("durationMinutes", String(Number(count) * 60)); }} />
      <Controller control={newSkuForm.control} name="skuName" render={({ field }) => <FormField label="规格名称" value={field.value} onChangeText={field.onChange} onBlur={field.onBlur} error={newSkuForm.formState.errors.skuName?.message} />} />
      <Controller control={newSkuForm.control} name="description" render={({ field }) => <FormField label="规格说明" value={field.value} onChangeText={field.onChange} onBlur={field.onBlur} error={newSkuForm.formState.errors.description?.message} />} />
      <Controller control={newSkuForm.control} name="priceYuan" render={({ field }) => <FormField label="价格（元）" value={field.value} onChangeText={field.onChange} onBlur={field.onBlur} keyboardType="decimal-pad" error={newSkuForm.formState.errors.priceYuan?.message} />} />
      <Controller control={newSkuForm.control} name="durationMinutes" render={({ field }) => <FormField label="时长（分钟）" value={field.value} onChangeText={field.onChange} onBlur={field.onBlur} keyboardType="number-pad" error={newSkuForm.formState.errors.durationMinutes?.message} />} />
      <PrimaryButton tone="plain" label="添加规格" loading={busy} disabled={busy} onPress={() => void addSku()} />
    </View> : null}
    {sellerServiceActions(product.status).includes("SUBMIT") ? confirmingSubmit ? <View style={styles.card}>
      <Text style={styles.cardTitle}>确认提交审核</Text>
      <Text style={styles.confirmText}>审核使用已保存的内容。请先保存修改，再核对下方信息。</Text><Text>{product.title}</Text><Text>{product.description}</Text><Text>{product.category?.name ?? "旧版未分类服务"}</Text>{product.category?.fields.map((field) => <Text key={field.key}>{field.label}：{product.attributes?.[field.key] || "未填写"}</Text>)}{product.skus.filter((sku) => sku.status === "ACTIVE").map((sku) => <Text key={sku.id}>{sku.sku_name} · {sku.unit_count ?? 1} {({ MATCH: "局", HOUR: "小时", SESSION: "次" })[sku.billing_unit ?? "SESSION"]} · ¥{centToYuanInput(sku.price_cent)}</Text>)}
      <PrimaryButton tone="plain" label="取消" disabled={busy} onPress={() => setConfirmingSubmit(false)} />
      <PrimaryButton label="确认提交" loading={busy} disabled={busy} onPress={() => { setConfirmingSubmit(false); void submitReview(); }} accessibilityLabel="确认提交服务审核" />
    </View> : <PrimaryButton label="提交审核" loading={busy} disabled={busy || !canSubmitSellerService(product.skus) || product.images.length === 0 || !product.images.some((image) => image.is_cover)} onPress={() => setConfirmingSubmit(true)} accessibilityLabel="提交服务审核" /> : null}
    {!canSubmitSellerService(product.skus) ? <NoticeBanner tone="danger" message="至少需要一个有效规格才能提交审核。" /> : null}
    {product.images.length === 0 || !product.images.some((image) => image.is_cover) ? <NoticeBanner tone="danger" message="至少需要一张已通过审核并设置为主图的服务图片，才能提交审核。" /> : null}
  </NativePage>;
}

function SkuEditor({ productId, sku, editable, busy, run }: { productId: string; sku: ServiceSkuApiView; editable: boolean; busy: boolean; run(action: () => Promise<unknown>, success: string): Promise<void> }) {
  const [billingUnit, setBillingUnit] = useState<BillingUnit>(sku.billing_unit ?? "SESSION");
  const [unitCount, setUnitCount] = useState(String(sku.unit_count ?? 1));
  const form = useForm<SellerSkuValues>({ resolver: zodResolver(sellerSkuSchema), defaultValues: { skuName: sku.sku_name, description: sku.description ?? "", priceYuan: centToYuanInput(sku.price_cent), durationMinutes: String(sku.duration_minutes) } });
  const save = form.handleSubmit(async (values) => run(() => { if (!validUnitCount(unitCount)) throw new Error("套餐数量应为 1–1000"); return updateSellerSku(productId, sku.id, { billing_unit: billingUnit, unit_count: Number(unitCount), sku_name: values.skuName, description: values.description || null, price_cent: yuanToCent(values.priceYuan)!, duration_minutes: Number(values.durationMinutes), sort_order: sku.sort_order, version: sku.version }); }, "规格已保存"));
  return <View style={styles.card}>
    <PackageUnits unit={billingUnit} count={unitCount} editable={editable && !busy} onChange={(unit, count) => { setBillingUnit(unit); setUnitCount(count); if (unit === "HOUR") form.setValue("durationMinutes", String(Number(count) * 60)); }} />
    <Text style={styles.cardTitle}>{sku.status === "ACTIVE" ? "有效规格" : "已停用规格"}</Text>
    <Controller control={form.control} name="skuName" render={({ field }) => <FormField editable={editable} label="规格名称" value={field.value} onChangeText={field.onChange} onBlur={field.onBlur} error={form.formState.errors.skuName?.message} />} />
    <Controller control={form.control} name="description" render={({ field }) => <FormField editable={editable} label="规格说明" value={field.value} onChangeText={field.onChange} onBlur={field.onBlur} error={form.formState.errors.description?.message} />} />
    <Controller control={form.control} name="priceYuan" render={({ field }) => <FormField editable={editable} label="价格（元）" value={field.value} onChangeText={field.onChange} onBlur={field.onBlur} keyboardType="decimal-pad" error={form.formState.errors.priceYuan?.message} />} />
    <Controller control={form.control} name="durationMinutes" render={({ field }) => <FormField editable={editable} label="时长（分钟）" value={field.value} onChangeText={field.onChange} onBlur={field.onBlur} keyboardType="number-pad" error={form.formState.errors.durationMinutes?.message} />} />
    {editable ? <><PrimaryButton tone="plain" label="保存规格" disabled={busy} onPress={() => void save()} /><PrimaryButton tone="plain" label={sku.status === "ACTIVE" ? "停用规格" : "启用规格"} disabled={busy} onPress={() => void run(() => updateSellerSku(productId, sku.id, { status: sku.status === "ACTIVE" ? "INACTIVE" : "ACTIVE", version: sku.version }), sku.status === "ACTIVE" ? "规格已停用" : "规格已启用")} /><PrimaryButton tone="plain" label="删除规格" disabled={busy} onPress={() => Alert.alert("删除规格", "删除后不能恢复，确认继续？", [{ text: "取消", style: "cancel" }, { text: "删除", style: "destructive", onPress: () => void run(() => deleteSellerSku(productId, sku.id, sku.version), "规格已删除") }])} /></> : null}
  </View>;
}

const styles = StyleSheet.create({ content: { gap: spacing.md, paddingBottom: 24 }, state: { minHeight: 240, justifyContent: "center", borderRadius: 18, backgroundColor: "rgba(255,253,248,0.96)", ...nativeShadow }, flex: { flex: 1 }, previewButton: { minWidth: 64, minHeight: 44, alignItems: "center", justifyContent: "center", borderRadius: 13, backgroundColor: "#FFFDF8", ...nativeShadow }, previewText: { color: colors.text, fontSize: 13, fontWeight: "900" }, reviewNotice: { minHeight: 70, flexDirection: "row", alignItems: "center", gap: 11, padding: 13, borderWidth: 1, borderColor: "#E8B38F", borderRadius: 16, backgroundColor: "#FFF4E8", ...nativeShadow }, reviewIcon: { width: 34, height: 34, borderRadius: 11, color: "#FFFFFF", backgroundColor: colors.accent, fontSize: 21, lineHeight: 34, fontWeight: "900", textAlign: "center" }, reviewTitle: { color: colors.text, fontSize: 14, fontWeight: "900" }, reviewText: { marginTop: 4, color: colors.textSecondary, fontSize: 11, lineHeight: 15 }, coverHero: { position: "relative", height: 235, overflow: "hidden", borderRadius: 20, backgroundColor: "#D9EDFF", ...nativeShadow }, coverImage: { width: "100%", height: "100%" }, coverButton: { position: "absolute", right: 12, bottom: 12, minHeight: 44, justifyContent: "center", paddingHorizontal: 15, borderRadius: 12, backgroundColor: "#CFF20B", ...nativeShadow }, coverButtonText: { color: "#29390B", fontSize: 13, fontWeight: "900" }, formPanel: { gap: spacing.md, padding: spacing.lg, borderWidth: 1, borderColor: "rgba(62,57,47,0.10)", borderRadius: radii.lg, backgroundColor: "rgba(255,253,248,0.96)", ...nativeShadow }, multiline: { minHeight: 120, textAlignVertical: "top" }, heading: { ...typography.sectionTitle, color: colors.text, marginTop: spacing.md }, card: { gap: spacing.md, padding: spacing.lg, borderWidth: 1, borderColor: "rgba(62,57,47,0.10)", borderRadius: radii.lg, backgroundColor: "rgba(255,253,248,0.96)", ...nativeShadow }, cardTitle: { ...typography.cardTitle, color: colors.text }, confirmText: { ...typography.body, color: colors.textSecondary }, serviceImage: { width: "100%", aspectRatio: 4 / 3, borderRadius: radii.lg }, footerBar: { minHeight: 70, flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 12, paddingVertical: 10 }, footerSecondary: { flex: 1, minHeight: 48, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: "rgba(62,57,47,0.14)", borderRadius: 14, backgroundColor: "#FFFDF8" }, footerSecondaryText: { color: colors.danger, fontSize: 14, fontWeight: "900" }, footerPrimary: { flex: 1.35, minHeight: 48, alignItems: "center", justifyContent: "center", borderRadius: 14, backgroundColor: colors.accent, ...nativeShadow }, footerPrimaryText: { color: colors.white, fontSize: 14, fontWeight: "900" }, disabled: { opacity: 0.45 }, pressed: { opacity: 0.72 } });
