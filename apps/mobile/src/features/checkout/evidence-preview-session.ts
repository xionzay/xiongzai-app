import { trustedEvidenceUrl } from "./evidence-access";

export interface EvidenceFile { file_id: string; kind: string }
export interface EvidenceAccess {
  id: string; file_type: string; mime_type: string; visibility: string;
  upload_status: string; moderation_status: string;
  access: { url: string; expires_at: string | null };
}
export interface EvidencePreviewState {
  phase: "idle" | "loading" | "ready" | "error";
  orderId: string; fileId: string | null; kind: string | null;
  url: string | null; message: string;
}
type Request = (path: string, signal: AbortSignal) => Promise<EvidenceAccess>;

/** Ephemeral access only. Never put this state in a query cache, storage or telemetry. */
export class EvidencePreviewSession {
  private generation = 0;
  private controller: AbortController | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private disposed = false;
  private state: EvidencePreviewState;

  constructor(private orderId: string, private files: EvidenceFile[], private request: Request,
    private publish: (state: EvidencePreviewState) => void, private now = Date.now) {
    this.state = this.empty();
  }

  setContext(orderId: string, files: EvidenceFile[]) {
    const invalidated = orderId !== this.orderId || (this.state.fileId && !files.some(file => file.file_id === this.state.fileId));
    this.orderId = orderId; this.files = files;
    if (invalidated) this.close();
  }

  async open(fileId: string): Promise<void> {
    if (this.disposed) return;
    const file = this.files.find(item => item.file_id === fileId && ["IMAGE", "VIDEO"].includes(item.kind));
    this.cancel();
    if (!file) { this.emit({ ...this.empty(), phase: "error", message: "凭证不存在或无权查看。" }); return; }
    const generation = this.generation;
    const controller = new AbortController(); this.controller = controller;
    const selection = { orderId: this.orderId, fileId, kind: file.kind };
    this.emit({ ...selection, phase: "loading", url: null, message: "正在获取本次凭证访问权限…" });
    try {
      const result = await this.request(`/files/order-evidence/${encodeURIComponent(this.orderId)}/${encodeURIComponent(fileId)}/access`, controller.signal);
      if (this.disposed || controller.signal.aborted || generation !== this.generation) return;
      const purpose = file.kind === "VIDEO" ? "ORDER_FULFILLMENT_VIDEO" : "ORDER_FULFILLMENT_IMAGE";
      if (result.id !== fileId || result.file_type !== purpose || result.visibility !== "PRIVATE" || result.upload_status !== "VERIFIED" || result.moderation_status !== "APPROVED" ||
        !(file.kind === "VIDEO" ? result.mime_type === "video/mp4" : ["image/jpeg", "image/png", "image/webp"].includes(result.mime_type))) throw new Error("invalid_evidence_metadata");
      const expiresAt = result.access.expires_at ? Date.parse(result.access.expires_at) : NaN;
      if (!Number.isFinite(expiresAt) || expiresAt <= this.now()) throw new Error("expired_evidence_access");
      const url = trustedEvidenceUrl(result.access.url);
      this.emit({ ...selection, phase: "ready", url, message: "" });
      this.timer = setTimeout(() => this.fail("本次访问权限已过期，请重新获取后继续查看。"), Math.min(expiresAt - this.now(), 2_147_483_647));
    } catch (error) {
      if (this.disposed || controller.signal.aborted || generation !== this.generation) return;
      const status = error && typeof error === "object" && "status" in error ? error.status : null;
      const message = status === 401 ? "登录状态已失效，请重新登录。" : status === 403 ? "没有查看此订单凭证的权限。" : status === 404 || status === 409 ? "凭证不可用、尚未审核通过或已解除绑定，请刷新订单。" : "凭证读取失败或网络异常，请检查网络后重新获取。";
      this.emit({ ...selection, phase: "error", url: null, message });
    } finally { if (this.controller === controller) this.controller = null; }
  }

  retry() { return this.state.fileId ? this.open(this.state.fileId) : Promise.resolve(); }
  activate() { this.disposed = false; }
  fail(message = "凭证加载失败，请重新获取访问权限。") {
    if (!this.state.fileId) return;
    this.cancel();
    this.emit({ ...this.state, phase: "error", url: null, message });
  }
  close() { this.cancel(); this.emit(this.empty()); }
  dispose() { this.cancel(); this.state = this.empty(); this.disposed = true; }

  private empty(): EvidencePreviewState { return { phase: "idle", orderId: this.orderId, fileId: null, kind: null, url: null, message: "" }; }
  private emit(state: EvidencePreviewState) { this.state = state; if (!this.disposed) this.publish(state); }
  private cancel() { this.generation++; this.controller?.abort(); this.controller = null; if (this.timer) clearTimeout(this.timer); this.timer = null; }
}
