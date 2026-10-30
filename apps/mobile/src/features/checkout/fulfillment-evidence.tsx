import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, AppState, Image, Text, View } from "react-native";
import { useFocusEffect } from "expo-router";
import { useAuth } from "@/auth/auth-provider";
import { useOnlineStatus } from "@/hooks/use-online-status";
import { EvidencePreviewSession, type EvidenceAccess, type EvidenceFile, type EvidencePreviewState } from "./evidence-preview-session";
import { EvidenceVideo } from "./evidence-video";
import { fulfillmentEvidenceError } from "@xiongzai/contracts/commerce";
import * as DocumentPicker from "expo-document-picker";
import { apiClient } from "@/auth/runtime";
import { NoticeBanner } from "@/components/notice-banner";
import { PrimaryButton } from "@/components/primary-button";
import { ImageUploadSlot } from "@/features/files/image-upload-slot";
import { completeOwnedFile, imageUploadDependencies, listFilePolicies, listMyFiles } from "@/features/files/file-upload-api";
import type { FileApiView, FileUploadRequestApiView, RecoverableFileApiView } from "@/types/api";

export function FulfillmentEvidence({ orderId, files }: { orderId: string; files: { file_id: string; kind: string }[] }) {
  return <OrderEvidencePreview key={orderId} orderId={orderId} files={files} />;
}

function OrderEvidencePreview({ orderId, files }: { orderId: string; files: EvidenceFile[] }) {
  const { status } = useAuth(), online = useOnlineStatus();
  const [state, setState] = useState<EvidencePreviewState>({ phase: "idle", orderId, fileId: null, kind: null, url: null, message: "" });
  const [foreground, setForeground] = useState(AppState.currentState === "active");
  const [imageLoading, setImageLoading] = useState(false);
  const [session] = useState(() => new EvidencePreviewSession(orderId, files, (path, signal) => apiClient.request<EvidenceAccess>(path, { signal }), setState));
  useEffect(() => { session.activate(); return () => session.dispose(); }, [session]);
  useEffect(() => { session.setContext(orderId, files); }, [session, orderId, files]);
  useFocusEffect(useCallback(() => () => session.close(), [session]));
  useEffect(() => {
    const subscription = AppState.addEventListener("change", next => {
      setForeground(next === "active");
      if (next !== "active") session.fail("已关闭后台预览，请重新获取访问权限。" );
    });
    return () => subscription.remove();
  }, [session]);
  useEffect(() => {
    if (status !== "authenticated") session.close();
    else if (!online) session.fail("网络已断开，请恢复连接后重新获取访问权限。");
  }, [session, online, status]);
  const onFailure = useCallback(() => session.fail(), [session]);
  const open = (fileId: string) => { setImageLoading(true); void session.open(fileId); };
  const url = online && foreground && status === "authenticated" && state.orderId === orderId && files.some(file => file.file_id === state.fileId) ? state.url : null;
  return <View style={{ gap: 8 }}><Text>真实完成凭证</Text>
    {files.length ? files.map((file, i) => <PrimaryButton key={file.file_id} tone="plain" disabled={!online || !foreground || status !== "authenticated"} label={file.kind === "VIDEO" ? "查看连续录屏" : `查看完成截图 ${i + 1}`} onPress={() => open(file.file_id)} />) : <Text>卖家尚未提交完成凭证。</Text>}
    {state.phase === "loading" ? <NoticeBanner message={state.message} /> : null}
    {url && state.kind === "VIDEO" ? <EvidenceVideo key={`${orderId}:${state.fileId}`} url={url} onFailure={onFailure} /> : null}
    {url && state.kind === "IMAGE" ? <>
      {imageLoading ? <ActivityIndicator accessibilityLabel="截图加载中" /> : null}
      <Image source={{ uri: url, cache: "reload" }} style={{ width: "100%", aspectRatio: 1 }} resizeMode="contain" accessibilityLabel="受控订单完成截图" onLoad={() => setImageLoading(false)} onError={onFailure} />
    </> : null}
    {state.message && state.phase === "error" ? <NoticeBanner tone="danger" message={state.message} /> : null}
    {state.fileId && state.phase === "error" ? <PrimaryButton tone="plain" label="重新获取访问权限" disabled={!online || !foreground || status !== "authenticated"} onPress={() => { setImageLoading(true); void session.retry(); }} /> : null}
    {state.fileId ? <PrimaryButton tone="plain" label="关闭凭证预览" onPress={() => session.close()} /> : null}
  </View>;
}
export function FulfillmentEvidencePicker({ paidCent, onChange }: { paidCent: string; onChange: (ids: string[], ready: boolean) => void }) {
  const [rows, setRows] = useState<RecoverableFileApiView[]>([]), [selected, setSelected] = useState<string[]>([]), [notice, setNotice] = useState(""), [busy, setBusy] = useState(false);
  const lock = useRef(false), mounted = useRef(true);
  const refresh = async () => { try { const pages = await Promise.all([listMyFiles({ fileType: "ORDER_FULFILLMENT_IMAGE", limit: 100 }), listMyFiles({ fileType: "ORDER_FULFILLMENT_VIDEO", limit: 100 })]); if (mounted.current) { setRows(pages.flatMap(p => p.items)); setNotice(""); } } catch { if (mounted.current) setNotice("凭证列表读取失败，请重新加载。"); } };
  useEffect(() => { mounted.current = true; void Promise.resolve().then(refresh); return () => { mounted.current = false; }; }, []);
  useEffect(() => { const ready = !fulfillmentEvidenceError(rows, selected, paidCent); onChange(selected, ready); }, [selected, rows, paidCent, onChange]);
  const video = async () => {
    if (lock.current) return; lock.current = true; setBusy(true);
    try {
      const result = await DocumentPicker.getDocumentAsync({ type: "video/mp4", copyToCacheDirectory: true }); if (result.canceled) return;
      const asset = result.assets[0]!; const policy = (await listFilePolicies()).find(p => p.file_type === "ORDER_FULFILLMENT_VIDEO");
      if (!policy || !asset.size || asset.size > policy.maximum_bytes) { setNotice("录屏大小不符合服务端策略，最大 100MB。"); return; }
      const signal = new AbortController().signal, bytes = await imageUploadDependencies.readBytes(asset.uri, signal);
      if (bytes.byteLength > policy.maximum_bytes) { setNotice("录屏过大，请重新选择。"); return; }
      const sha256 = await imageUploadDependencies.sha256(bytes);
      const ticket = await apiClient.request<FileUploadRequestApiView>("/files/uploads", { method: "POST", body: JSON.stringify({ file_type: "ORDER_FULFILLMENT_VIDEO", mime_type: "video/mp4", size_bytes: bytes.byteLength, sha256 }) });
      await imageUploadDependencies.put(ticket.upload, bytes, signal); await completeOwnedFile(ticket.file.id); await refresh(); setNotice("录屏已完成校验，等待管理员实际观看并核验连续性。");
    } catch { setNotice("录屏上传或校验未完成，请先刷新已上传记录再重试。"); }
    finally { lock.current = false; if (mounted.current) setBusy(false); }
  };
  const add = async (file: FileApiView) => { setSelected(ids => ids.includes(file.id) ? ids : [...ids, file.id]); await refresh(); };
  const retryComplete = async (fileId: string) => {
    if (lock.current) return;
    lock.current = true; setBusy(true);
    try { await completeOwnedFile(fileId); await refresh(); }
    catch { if (mounted.current) setNotice("校验未完成，请重试；不会重复上传文件。"); }
    finally { lock.current = false; if (mounted.current) setBusy(false); }
  };
  return <View><Text>至少 5 张人工审核通过截图；实付达到 200 元另需连续录屏。绑定后不可删除、覆盖或跨订单复用。</Text><ImageUploadSlot fileType="ORDER_FULFILLMENT_IMAGE" label="完成截图" expectedVisibility="PRIVATE" onReady={add} /><PrimaryButton tone="plain" label="上传连续录屏" loading={busy} disabled={busy} onPress={() => void video()} /><PrimaryButton tone="plain" label="刷新凭证人工审核状态" onPress={() => void refresh()} />{notice ? <NoticeBanner message={notice} /> : null}{rows.map(file => <View key={file.id}><PrimaryButton tone="plain" label={`${selected.includes(file.id) ? "已选 · " : "选择 · "}${file.file_type === "ORDER_FULFILLMENT_VIDEO" ? "录屏" : "截图"} ${file.id.slice(-8)} · ${file.moderation_status === "APPROVED" ? "人工审核通过" : "待人工审核"}`} disabled={file.upload_status !== "VERIFIED" || file.moderation_status !== "APPROVED" || file.visibility !== "PRIVATE" || !!file.bound_order_id} onPress={() => setSelected(ids => ids.includes(file.id) ? ids.filter(id => id !== file.id) : [...ids, file.id])} />{file.upload_status === "PENDING" || file.upload_status === "UPLOADED" ? <PrimaryButton tone="plain" label="重试完成校验" loading={busy} disabled={busy} onPress={() => void retryComplete(file.id)} /> : null}</View>)}<Text>格式和哈希校验与人工审核独立；恶意文件扫描服务尚未接入。</Text></View>;
}
