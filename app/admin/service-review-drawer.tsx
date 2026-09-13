"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { adminApiBlob, adminApiRequest, adminFailure } from "./admin-api";
import styles from "./admin.module.css";

type ServiceImage = { id: string; file_id: string; sort_order: number; is_cover: boolean };
type ServiceSku = { id: string; sku_name: string; description: string | null; price_cent: string; duration_minutes: number; status: string; sort_order: number };
type ReviewLog = { id: string; action: string; old_status: string | null; new_status: string | null; reason: string | null; created_at: string };
type ServiceDetail = {
  id: string;
  title: string;
  description: string;
  service_time_description: string | null;
  cover_file_id: string | null;
  status: string;
  rejection_reason: string | null;
  min_price_cent: string;
  sold_count: number;
  current_version_no: number | null;
  submitted_at: string | null;
  version: number;
  seller: { seller_nickname: string; game_rank?: string | null; preferred_mode?: string | null };
  skus: ServiceSku[];
  images: ServiceImage[];
  review_logs: ReviewLog[];
};

type Preview = { fileId: string; url: string | null; error: string | null };

export function ServiceReviewDrawer({ productId, title, canPreviewMedia, onClose }: { productId: string; title: string; canPreviewMedia:boolean; onClose: () => void }) {
  const [detail, setDetail] = useState<ServiceDetail | null>(null);
  const [state, setState] = useState<"loading" | "success" | "error" | "offline">("loading");
  const [error, setError] = useState("");
  const [previews, setPreviews] = useState<Preview[]>([]);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [revision, setRevision] = useState(0);
  const objectUrls = useRef<string[]>([]);

  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setState("loading"); setError(""); setDetail(null);
      adminApiRequest<ServiceDetail>(`/products/${productId}`, { signal: controller.signal })
        .then((value) => { if (!controller.signal.aborted) { setDetail(value); setState("success"); } })
        .catch((cause) => { if (!controller.signal.aborted) { const failure = adminFailure(cause); setError(failure.message); setState(failure.state); } });
    }, 0);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [productId, revision]);

  useEffect(() => {
    let cancelled = false;
    const timer = window.setTimeout(() => {
      objectUrls.current.forEach((url) => URL.revokeObjectURL(url)); objectUrls.current = []; setPreviews([]);
      if (!canPreviewMedia || !detail?.images.length) { setPreviewLoading(false); return; }
      setPreviewLoading(true);
      Promise.all(detail.images.map(async (image): Promise<Preview> => {
        try {
          const blob = await adminApiBlob(`/files/${encodeURIComponent(image.file_id)}/preview`);
          if (cancelled) return { fileId: image.file_id, url: null, error: null };
          const url = URL.createObjectURL(blob); objectUrls.current.push(url);
          return { fileId: image.file_id, url, error: null };
        } catch (cause) {
          return { fileId: image.file_id, url: null, error: previewError(cause) };
        }
      })).then((values) => { if (!cancelled) setPreviews(values); }).finally(() => { if (!cancelled) setPreviewLoading(false); });
    }, 0);
    return () => { cancelled = true; window.clearTimeout(timer); objectUrls.current.forEach((url) => URL.revokeObjectURL(url)); objectUrls.current = []; };
  }, [canPreviewMedia, detail]);

  const sortedImages = useMemo(() => [...(detail?.images ?? [])].sort((left, right) => left.sort_order - right.sort_order), [detail?.images]);
  const cover = sortedImages.find((image) => image.is_cover) ?? sortedImages[0];
  const coverPreview = previews.find((item) => item.fileId === cover?.file_id);

  return <div className={styles.drawerBackdrop} role="dialog" aria-modal="true" aria-label={`服务审核详情 ${title}`}>
    <aside className={styles.detailDrawer}>
      <header><div><span>服务审核详情</span><h2>{title}</h2></div><button type="button" aria-label="关闭" onClick={onClose}>×</button></header>
      <div className={styles.drawerBody}>
        {state === "loading" ? <DrawerState title="正在读取服务详情" note="正在从管理 API 读取服务内容、规格和图片。" /> : state === "error" || state === "offline" ? <DrawerState title="服务详情加载失败" note={error} action={() => setRevision((value) => value + 1)} /> : detail ? <>
          <section className={styles.servicePreview}>
            {coverPreview?.url ? <ServiceImagePreview src={coverPreview.url} alt={`${detail.title}主图`} /> : <div className={styles.serviceImagePlaceholder}>{previewLoading ? "正在加载主图…" : coverPreview?.error ?? "该服务没有上传主图"}</div>}
            <div><span>{serviceStatusLabel(detail.status)} · 第 {detail.current_version_no ?? 1} 版</span><h3>{detail.title}</h3><p>{detail.description || "用户未填写服务说明。"}</p><dl className={styles.serviceSummaryFacts}><div><dt>陪玩</dt><dd>{detail.seller.seller_nickname}</dd></div><div><dt>最低价格</dt><dd>{formatCent(detail.min_price_cent)}</dd></div><div><dt>服务时间说明</dt><dd>{detail.service_time_description || "未填写"}</dd></div><div><dt>提交时间</dt><dd>{formatTime(detail.submitted_at)}</dd></div></dl></div>
          </section>

          <section className={styles.detailSection}><h3>用户上传的服务图片</h3>{!canPreviewMedia && sortedImages.length ? <p className={styles.serviceReviewNote}>当前管理员没有文件读取与审核权限，未发出图片预览请求。</p> : previewLoading ? <p className={styles.serviceReviewNote}>正在通过受控管理接口读取图片，请稍候…</p> : sortedImages.length === 0 ? <p className={styles.serviceReviewNote}>当前服务没有绑定任何图片。这是真实空状态，页面没有填充占位业务图片。</p> : <div className={styles.serviceImageGrid}>{sortedImages.map((image, index) => { const preview = previews.find((item) => item.fileId === image.file_id); return <figure key={image.id}>{preview?.url ? <ServiceImagePreview src={preview.url} alt={`${detail.title}服务图片 ${index + 1}`} /> : <div>{preview?.error ?? "图片加载失败"}</div>}<figcaption>{image.is_cover ? "主图" : `详情图 ${index + 1}`} · 排序 {image.sort_order}</figcaption></figure>; })}</div>}</section>

          <section className={styles.detailSection}><h3>服务规格与价格</h3>{detail.skus.length ? <table className={styles.skuTable}><thead><tr><th>规格名称</th><th>说明</th><th>时长</th><th>价格</th><th>状态</th></tr></thead><tbody>{detail.skus.map((sku) => <tr key={sku.id}><td>{sku.sku_name}</td><td>{sku.description || "—"}</td><td>{sku.duration_minutes} 分钟</td><td>{formatCent(sku.price_cent)}</td><td>{skuStatusLabel(sku.status)}</td></tr>)}</tbody></table> : <p className={styles.serviceReviewNote}>当前服务没有可审核的规格。</p>}</section>

          <section className={styles.detailSection}><h3>审核记录</h3>{detail.review_logs.length ? <div className={styles.serviceReviewLogs}>{detail.review_logs.map((log) => <article key={log.id}><b>{reviewActionLabel(log.action)}</b><p>{log.reason || "未填写原因"}</p><small>{serviceStatusLabel(log.old_status)} → {serviceStatusLabel(log.new_status)} · {formatTime(log.created_at)}</small></article>)}</div> : <p className={styles.serviceReviewNote}>当前服务还没有管理员审核记录。</p>}</section>

          <section className={styles.moderationCard}><ShieldIcon /><div><b>服务图片通过受控管理接口读取</b><p>图片地址只存在于当前浏览器内存，关闭详情后立即释放；页面不会暴露对象存储键或预签名地址。</p></div><span className={styles.statusBadge}>{serviceStatusLabel(detail.status)}</span></section>
        </> : null}
      </div>
    </aside>
  </div>;
}

function ServiceImagePreview({ src, alt }: { src: string; alt: string }) {
  // Protected Blob URL only exists in this browser session.
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt={alt} referrerPolicy="no-referrer" decoding="async" loading="lazy" />;
}

function ShieldIcon() {
  // Fixed same-origin icon; Vinext has no next/image runtime.
  // eslint-disable-next-line @next/next/no-img-element
  return <img src="/assets/admin-icons/icon-shield.png" alt="" width={190} height={190} />;
}

function DrawerState({ title, note, action }: { title: string; note: string; action?: () => void }) { return <section className={styles.dataState}><span>!</span><h2>{title}</h2><p>{note}</p>{action ? <button type="button" onClick={action}>重新加载</button> : null}</section>; }
function previewError(cause: unknown) { const failure = adminFailure(cause); return /权限|MFA/u.test(failure.message) ? "当前账号缺少文件预览权限，请授予文件读取与审核权限。" : failure.message; }
function formatCent(value: string | number | bigint | null | undefined) { try { const amount = BigInt(value ?? 0); return `¥ ${(amount / 100n).toString()}.${(amount % 100n).toString().padStart(2, "0")}`; } catch { return "—"; } }
function formatTime(value: string | null | undefined) { if (!value) return "—"; const date = new Date(value); return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString("zh-CN", { hour12: false }); }
function serviceStatusLabel(value: string | null | undefined) { return ({ DRAFT: "草稿", PENDING_REVIEW: "待审核", ON_SALE: "在售", REVIEW_REJECTED: "审核驳回", OFF_SALE: "已下架", ADMIN_OFF_SALE: "平台下架", DELETED: "已软删除", APPROVED: "已通过", REJECTED: "已驳回" } as Record<string, string>)[value ?? ""] ?? (value ? "其他状态" : "无"); }
function skuStatusLabel(value: string) { return ({ ACTIVE: "启用", INACTIVE: "停用", DELETED: "已删除" } as Record<string, string>)[value] ?? "其他状态"; }
function reviewActionLabel(value: string) { return ({ SUBMIT: "用户提交审核", APPROVE: "管理员审核通过", REJECT: "管理员审核驳回", ADMIN_OFF_SALE: "平台强制下架", ADMIN_RESTORE: "平台恢复服务", SOFT_DELETE: "软删除违规服务", SELLER_RESTORE: "陪玩重新提交" } as Record<string, string>)[value] ?? "服务审核操作"; }
