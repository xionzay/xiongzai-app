"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { adminApiBlob, adminApiRequest, adminFailure } from "./admin-api";
import styles from "./admin.module.css";

type SellerSnapshot = {
  seller_nickname?: string | null;
  seller_avatar_file_id?: string | null;
  cover_file_id?: string | null;
  introduction?: string | null;
  game_rank?: string | null;
  kd?: string | null;
  preferred_mode?: string | null;
  play_style?: string | null;
  game_experience?: string | null;
  voice_file_id?: string | null;
  voice_duration_ms?: number | null;
};

type PolicyReference = { policy_type: string; title: string; version_no: number; status: string; effective_at?: string | null };
type SellerReviewLog = { id: string; action: string; old_status: string | null; new_status: string | null; reason: string | null; created_at: string };
type SellerApplicationDetail = {
  id: string;
  version_no: number;
  status: string;
  submitted_at: string | null;
  reviewed_at: string | null;
  rejection_reason: string | null;
  required_fields: string[] | null;
  snapshot: SellerSnapshot;
  revision_kind?: "INITIAL_ONBOARDING" | "PROFILE_UPDATE";
  current_public_profile?: SellerSnapshot;
  logs: SellerReviewLog[];
  onboarding_policy: PolicyReference | null;
  voice_authorization_policy: PolicyReference | null;
};

type MediaKind = "proposed-avatar" | "proposed-cover" | "proposed-voice" | "current-avatar" | "current-cover" | "current-voice";
type MediaPreview = { kind: MediaKind; fileId: string; url: string | null; error: string | null };

export function SellerReviewDrawer({ applicationId, title, canPreviewMedia, onClose }: { applicationId: string; title: string; canPreviewMedia: boolean; onClose: () => void }) {
  const [detail, setDetail] = useState<SellerApplicationDetail | null>(null);
  const [state, setState] = useState<"loading" | "success" | "error" | "offline">("loading");
  const [error, setError] = useState("");
  const [media, setMedia] = useState<MediaPreview[]>([]);
  const [mediaLoading, setMediaLoading] = useState(false);
  const [revision, setRevision] = useState(0);
  const objectUrls = useRef<string[]>([]);

  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setState("loading"); setError(""); setDetail(null);
      adminApiRequest<SellerApplicationDetail>(`/seller-applications/${applicationId}`, { signal: controller.signal })
        .then((value) => { if (!controller.signal.aborted) { setDetail(value); setState("success"); } })
        .catch((cause) => { if (!controller.signal.aborted) { const failure = adminFailure(cause); setError(failure.message); setState(failure.state); } });
    }, 0);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [applicationId, revision]);

  const requestedMedia = useMemo(() => {
    const snapshot = detail?.snapshot;
    if (!snapshot || !canPreviewMedia) return [];
    const current = detail.revision_kind === "PROFILE_UPDATE" ? detail.current_public_profile : undefined;
    return [
      snapshot.seller_avatar_file_id ? { kind: "proposed-avatar" as const, fileId: snapshot.seller_avatar_file_id } : null,
      snapshot.cover_file_id ? { kind: "proposed-cover" as const, fileId: snapshot.cover_file_id } : null,
      snapshot.voice_file_id ? { kind: "proposed-voice" as const, fileId: snapshot.voice_file_id } : null,
      current?.seller_avatar_file_id ? { kind: "current-avatar" as const, fileId: current.seller_avatar_file_id } : null,
      current?.cover_file_id ? { kind: "current-cover" as const, fileId: current.cover_file_id } : null,
      current?.voice_file_id ? { kind: "current-voice" as const, fileId: current.voice_file_id } : null,
    ].filter((item): item is { kind: MediaKind; fileId: string } => Boolean(item));
  }, [canPreviewMedia, detail]);

  useEffect(() => {
    let cancelled = false;
    const timer = window.setTimeout(() => {
      objectUrls.current.forEach((url) => URL.revokeObjectURL(url)); objectUrls.current = []; setMedia([]);
      if (!requestedMedia.length) { setMediaLoading(false); return; }
      setMediaLoading(true);
      Promise.all(requestedMedia.map(async (item): Promise<MediaPreview> => {
        try {
          const blob = await adminApiBlob(`/files/${encodeURIComponent(item.fileId)}/preview`);
          if (cancelled) return { ...item, url: null, error: null };
          const url = URL.createObjectURL(blob); objectUrls.current.push(url);
          return { ...item, url, error: null };
        } catch (cause) {
          return { ...item, url: null, error: previewError(cause) };
        }
      })).then((items) => { if (!cancelled) setMedia(items); }).finally(() => { if (!cancelled) setMediaLoading(false); });
    }, 0);
    return () => { cancelled = true; window.clearTimeout(timer); objectUrls.current.forEach((url) => URL.revokeObjectURL(url)); objectUrls.current = []; };
  }, [requestedMedia]);

  const snapshot = detail?.snapshot;
  const nickname = readable(snapshot?.seller_nickname) ?? title;
  const avatar = media.find((item) => item.kind === "proposed-avatar");
  const cover = media.find((item) => item.kind === "proposed-cover");
  const voice = media.find((item) => item.kind === "proposed-voice");

  return <div className={styles.drawerBackdrop} role="dialog" aria-modal="true" aria-label={`陪玩审核详情 ${title}`}>
    <aside className={styles.detailDrawer}>
      <header><div><span>{detail?.revision_kind === "PROFILE_UPDATE" ? "陪玩公开资料变更审核" : "陪玩入驻审核详情"}</span><h2>{nickname}</h2></div><button type="button" aria-label="关闭" onClick={onClose}>×</button></header>
      <div className={styles.drawerBody}>
        {state === "loading" ? <DrawerState title="正在读取陪玩申请" note="正在从管理 API 读取提交快照、主页资料和审核记录。" /> : state === "error" || state === "offline" ? <DrawerState title="陪玩申请加载失败" note={error} action={() => setRevision((value) => value + 1)} /> : detail && snapshot ? <>
          <section className={styles.sellerReviewHero}>
            <div className={styles.sellerReviewCover}>
              {cover?.url ? <ProtectedImage src={cover.url} alt={`${nickname}主页封面`} /> : <div>{!canPreviewMedia && snapshot.cover_file_id ? "当前账号没有主页封面预览权限" : mediaLoading && snapshot.cover_file_id ? "正在加载主页封面…" : cover?.error ?? (snapshot.cover_file_id ? "主页封面加载失败" : "用户未上传主页封面（选填）")}</div>}
            </div>
            <div className={styles.sellerReviewIdentity}>
              <div className={styles.sellerReviewAvatar}>{avatar?.url ? <ProtectedImage src={avatar.url} alt={`${nickname}陪玩头像`} /> : <span>{mediaLoading && snapshot.seller_avatar_file_id ? "…" : nickname.slice(0, 1)}</span>}</div>
              <div><small>陪玩昵称</small><h3>{nickname}</h3><p>{statusLabel(detail.status)} · 第 {detail.version_no} 次申请{detail.revision_kind === "PROFILE_UPDATE" ? " · 资料变更" : " · 首次入驻"}</p></div>
            </div>
            {snapshot.seller_avatar_file_id && !canPreviewMedia ? <p className={styles.sellerMediaError}>陪玩头像：当前账号缺少文件读取与审核权限。</p> : avatar?.error ? <p className={styles.sellerMediaError}>陪玩头像：{avatar.error}</p> : null}
          </section>

          {detail.revision_kind === "PROFILE_UPDATE" && detail.current_public_profile ? <section className={styles.detailSection}><h3>当前公开版本与待审核版本</h3><p className={styles.serviceReviewNote}>只有管理员通过后，右侧待审核值才会整体替换当前公开主页；驳回或要求补充不会影响买家正在看到的版本。</p><div className={styles.sellerProfileDiff}>{profileDiff(detail.current_public_profile, snapshot).map((item) => <article key={item.key}><small>{item.label}{item.changed ? " · 已修改" : " · 未修改"}</small><div><span>当前公开：{item.before}</span><b>待审核：{item.after}</b></div></article>)}</div><SellerMediaComparison current={detail.current_public_profile} proposed={snapshot} media={media} loading={mediaLoading} canPreview={canPreviewMedia} /></section> : null}

          <section className={styles.detailSection}><h3>主页介绍</h3><p className={styles.sellerReviewIntroduction}>{readable(snapshot.introduction) ?? "用户未填写主页介绍。"}</p></section>

          <section className={styles.detailSection}><h3>和平精英资料</h3><dl className={styles.sellerReviewFacts}><div><dt>当前段位</dt><dd>{field(snapshot.game_rank)}</dd></div><div><dt>K/D</dt><dd>{field(snapshot.kd)}</dd></div><div><dt>擅长模式</dt><dd>{field(snapshot.preferred_mode)}</dd></div><div><dt>擅长玩法</dt><dd>{field(snapshot.play_style)}</dd></div><div className={styles.sellerReviewWideFact}><dt>游戏经验</dt><dd>{field(snapshot.game_experience)}</dd></div><div><dt>提交时间</dt><dd>{formatTime(detail.submitted_at)}</dd></div></dl></section>

          <section className={styles.detailSection}><h3>声音名片</h3>{snapshot.voice_file_id ? !canPreviewMedia ? <p className={styles.serviceReviewNote}>当前账号缺少文件读取与审核权限，不能试听声音名片。</p> : voice?.url ? <div className={styles.sellerVoiceCard}><div><b>用户提交的声音名片</b><span>{snapshot.voice_duration_ms ? `${(snapshot.voice_duration_ms / 1_000).toFixed(1)} 秒` : "时长未记录"}</span></div><audio controls controlsList="nodownload" preload="metadata" src={voice.url}><track kind="captions" src="/assets/voice-sample-captions.vtt" srcLang="zh-CN" label="声音名片说明" default />当前浏览器不支持音频播放。</audio></div> : <p className={styles.serviceReviewNote}>{mediaLoading ? "正在加载声音名片…" : voice?.error ?? "声音名片加载失败"}</p> : <p className={styles.serviceReviewNote}>该申请没有提交声音名片。</p>}</section>

          <section className={styles.detailSection}><h3>协议确认版本</h3><div className={styles.sellerPolicyGrid}><PolicyCard label="陪玩入驻协议" policy={detail.onboarding_policy} /><PolicyCard label="声音名片授权" policy={detail.voice_authorization_policy} empty={snapshot.voice_file_id ? "未读取到声音授权版本" : "未提交声音名片，无需声音授权"} /></div></section>

          <section className={styles.detailSection}><h3>审核记录</h3>{detail.logs.length ? <div className={styles.serviceReviewLogs}>{detail.logs.map((log) => <article key={log.id}><b>{reviewActionLabel(log.action)}</b><p>{log.reason || "未填写原因"}</p><small>{statusLabel(log.old_status)} → {statusLabel(log.new_status)} · {formatTime(log.created_at)}</small></article>)}</div> : <p className={styles.serviceReviewNote}>当前申请还没有管理员审核记录。</p>}</section>

          {detail.rejection_reason ? <section className={styles.detailSection}><h3>最近驳回原因</h3><p className={styles.sellerReviewIntroduction}>{detail.rejection_reason}</p></section> : null}

          <section className={styles.moderationCard}><ShieldIcon /><div><b>审核展示使用提交时快照</b><p>{detail.revision_kind === "PROFILE_UPDATE" ? "审核通过才会发布新主页；" : "通过后才会成为公开陪玩资料；"}头像、封面和声音名片通过受控管理接口读取，页面不会暴露对象存储键或预签名地址。</p></div><span className={styles.statusBadge}>{statusLabel(detail.status)}</span></section>
        </> : detail ? <DrawerState title="申请快照不可用" note="服务端没有返回可审核的申请快照，请重新加载或检查该历史记录。" action={() => setRevision((value) => value + 1)} /> : null}
      </div>
    </aside>
  </div>;
}

function ProtectedImage({ src, alt }: { src: string; alt: string }) {
  // Protected Blob URL only exists in this browser session.
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt={alt} referrerPolicy="no-referrer" decoding="async" />;
}

function PolicyCard({ label, policy, empty = "未读取到协议版本" }: { label: string; policy: PolicyReference | null; empty?: string }) {
  return <article><small>{label}</small>{policy ? <><b>{policy.title}</b><span>版本 v{policy.version_no} · {policyStatusLabel(policy.status)}</span></> : <p>{empty}</p>}</article>;
}

function SellerMediaComparison({ current, proposed, media, loading, canPreview }: { current: SellerSnapshot; proposed: SellerSnapshot; media: MediaPreview[]; loading: boolean; canPreview: boolean }) {
  const rows: Array<{ label: string; field: "seller_avatar_file_id" | "cover_file_id" | "voice_file_id"; currentKind: MediaKind; proposedKind: MediaKind; audio?: boolean }> = [
    { label: "陪玩头像", field: "seller_avatar_file_id", currentKind: "current-avatar", proposedKind: "proposed-avatar" },
    { label: "主页封面", field: "cover_file_id", currentKind: "current-cover", proposedKind: "proposed-cover" },
    { label: "声音名片", field: "voice_file_id", currentKind: "current-voice", proposedKind: "proposed-voice", audio: true },
  ];
  return <div className={styles.sellerMediaComparison}><h4>媒体版本对比</h4>{rows.map((row) => <article key={row.field}><b>{row.label}</b><div><SellerMediaVersion label="当前公开" fileId={current[row.field]} preview={media.find((item) => item.kind === row.currentKind)} loading={loading} canPreview={canPreview} audio={row.audio} /><SellerMediaVersion label="待审核" fileId={proposed[row.field]} preview={media.find((item) => item.kind === row.proposedKind)} loading={loading} canPreview={canPreview} audio={row.audio} /></div></article>)}</div>;
}

function SellerMediaVersion({ label, fileId, preview, loading, canPreview, audio = false }: { label: string; fileId: string | null | undefined; preview?: MediaPreview; loading: boolean; canPreview: boolean; audio?: boolean }) {
  return <section><small>{label}</small>{!fileId ? <span>未上传</span> : !canPreview ? <span>当前账号无预览权限</span> : preview?.url ? audio ? <audio controls controlsList="nodownload" preload="metadata" src={preview.url}><track kind="captions" src="/assets/voice-sample-captions.vtt" srcLang="zh-CN" label="声音名片说明" default />当前浏览器不支持音频播放。</audio> : <ProtectedImage src={preview.url} alt={`${label}${audio ? "声音名片" : "审核图片"}`} /> : <span>{loading ? "正在加载…" : preview?.error ?? "媒体加载失败"}</span>}</section>;
}

function ShieldIcon() {
  // Fixed same-origin icon; Vinext has no next/image runtime.
  // eslint-disable-next-line @next/next/no-img-element
  return <img src="/assets/admin-icons/icon-shield.png" alt="" width={190} height={190} />;
}

function DrawerState({ title, note, action }: { title: string; note: string; action?: () => void }) { return <section className={styles.dataState}><span>!</span><h2>{title}</h2><p>{note}</p>{action ? <button type="button" onClick={action}>重新加载</button> : null}</section>; }
function readable(value: unknown) { return typeof value === "string" && value.trim() ? value.trim() : null; }
function field(value: unknown) { if (typeof value === "number" && Number.isFinite(value)) return String(value); return readable(value) ?? "未填写"; }
function previewError(cause: unknown) { const failure = adminFailure(cause); return /权限|MFA/u.test(failure.message) ? "当前账号缺少文件预览权限，请授予文件读取与审核权限。" : failure.message; }
function formatTime(value: string | null | undefined) { if (!value) return "—"; const date = new Date(value); return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString("zh-CN", { hour12: false }); }
function statusLabel(value: string | null | undefined) { return ({ SUBMITTED: "待受理", UNDER_REVIEW: "审核中", APPROVED: "已通过", REJECTED: "已驳回", NEEDS_SUPPLEMENT: "待补充", PENDING_REVIEW: "待审核" } as Record<string, string>)[value ?? ""] ?? (value ? "其他状态" : "无"); }
function policyStatusLabel(value: string) { return ({ DRAFT: "草稿", PUBLISHED: "已发布", RETIRED: "已停用" } as Record<string, string>)[value] ?? "其他状态"; }
function reviewActionLabel(value: string) { return ({ SUBMIT: "用户提交申请", START_REVIEW: "管理员开始审核", APPROVE: "管理员审核通过", REJECT: "管理员审核驳回", REQUEST_SUPPLEMENT: "要求用户补充资料" } as Record<string, string>)[value] ?? "陪玩审核操作"; }
function profileDiff(current:SellerSnapshot,proposed:SellerSnapshot){const fields:Array<{key:keyof SellerSnapshot;label:string}>=[{key:"seller_nickname",label:"陪玩昵称"},{key:"seller_avatar_file_id",label:"陪玩头像"},{key:"cover_file_id",label:"主页封面"},{key:"introduction",label:"主页介绍"},{key:"game_rank",label:"游戏段位"},{key:"kd",label:"K/D"},{key:"preferred_mode",label:"擅长模式"},{key:"play_style",label:"陪玩风格"},{key:"game_experience",label:"游戏经历"},{key:"voice_file_id",label:"声音名片"}];return fields.map(({key,label})=>{const before=displayDiffValue(key,current[key]);const after=displayDiffValue(key,proposed[key]);return {key,label,before,after,changed:String(current[key]??"")!==String(proposed[key]??"")};});}
function displayDiffValue(key:keyof SellerSnapshot,value:unknown){if(key.endsWith("file_id"))return value?"已上传（使用下方受控预览核对）":"未上传";return field(value);}
