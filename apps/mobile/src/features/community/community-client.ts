import type { CreateFeedbackRequest, FeedbackResponse, PublicAnnouncementResponse } from "@xiongzai/contracts/community";
import type { ApiClient } from "@/api/client";
import { ApiClientError } from "@/api/api-error";

export type CommunityTransport = Pick<ApiClient, "request" | "publicRequest">;
export interface CommunityPage<T> { items: T[]; next_cursor: string | null }
export interface FeedbackPolicy { max_characters: number; hourly_limit: number; text_only: true; response_sla: null }
export interface AnnouncementCover { file_id: string; access: { url: string; expires_at: string } }

const segment = (id: string) => encodeURIComponent(id);
export class CommunityClient {
  constructor(private readonly transport: CommunityTransport) {}
  policy(signal?: AbortSignal) { return this.transport.request<FeedbackPolicy>("/feedback/policy", { signal }); }
  feedback(cursor = "", signal?: AbortSignal) { return this.transport.request<CommunityPage<FeedbackResponse>>(`/feedback?limit=20${cursor ? `&cursor=${segment(cursor)}` : ""}`, { signal }); }
  feedbackDetail(id: string, signal?: AbortSignal) { return this.transport.request<FeedbackResponse>(`/feedback/${segment(id)}`, { signal }); }
  feedbackByRequest(id: string, signal?: AbortSignal) { return this.transport.request<FeedbackResponse>(`/feedback/requests/${segment(id)}`, { signal, retryAfterRefresh: false }); }
  submit(body: CreateFeedbackRequest, signal?: AbortSignal) {
    // Never replay a private write with a different session after automatic refresh.
    return this.transport.request<FeedbackResponse>("/feedback", { method: "POST", body: JSON.stringify(body), signal, retryAfterRefresh: false });
  }
  announcements(cursor = "", signal?: AbortSignal) { return this.transport.publicRequest<CommunityPage<PublicAnnouncementResponse>>(`/announcements?limit=20${cursor ? `&cursor=${segment(cursor)}` : ""}`, { signal }); }
  announcement(id: string, signal?: AbortSignal) { return this.transport.publicRequest<PublicAnnouncementResponse>(`/announcements/${segment(id)}`, { signal }); }
  cover(id: string, signal?: AbortSignal) { return this.transport.publicRequest<AnnouncementCover>(`/announcements/${segment(id)}/cover`, { signal }); }
}

/** One mounted account owns one attempt; unknown results freeze the body and ID. No plaintext persistence. */
export class FeedbackAttempt {
  private attempt: CreateFeedbackRequest | null = null;
  private running: Promise<FeedbackResponse> | null = null;
  private readonly controller = new AbortController();
  constructor(private readonly client: CommunityClient, private readonly createId: () => string, private readonly isCurrent: () => boolean) {}
  get pending() { return this.attempt !== null; }
  dispose() { this.controller.abort(); }
  submit(content: string): Promise<FeedbackResponse> {
    if (this.running) return this.running;
    this.running = this.run(content).finally(() => { this.running = null; });
    return this.running;
  }
  private assertCurrent() {
    if (this.controller.signal.aborted || !this.isCurrent()) throw new ApiClientError("AUTH_REQUIRED", "请重新登录", 401);
  }
  private async run(content: string) {
    this.assertCurrent();
    const retry = this.attempt !== null;
    this.attempt ??= { client_request_id: this.createId(), content: content.trim() };
    const body = this.attempt;
    let submitting = false;
    try {
      if (retry) {
        try {
          const existing = await this.client.feedbackByRequest(body.client_request_id, this.controller.signal);
          if (existing.content !== body.content || existing.client_request_id !== body.client_request_id) throw new ApiClientError("IDEMPOTENCY_KEY_CONFLICT", "请核对原反馈记录", 409);
          this.assertCurrent(); this.attempt = null; return existing;
        } catch (error) {
          if (!(error instanceof ApiClientError) || error.code !== "FEEDBACK_NOT_FOUND") throw error;
        }
      }
      this.assertCurrent();
      submitting = true;
      const result = await this.client.submit(body, this.controller.signal);
      this.assertCurrent(); this.attempt = null; return result;
    } catch (error) {
      if (submitting && error instanceof ApiClientError && [400, 401, 403, 422, 429].includes(error.status)) this.attempt = null;
      throw error;
    }
  }
}

export function communityError(error: unknown): string {
  if (!(error instanceof ApiClientError)) return "网络暂不可用，请重试；提交结果不确定时会先核对原请求。";
  const messages: Record<string, string> = {
    FEEDBACK_CONTENT_TOO_LONG: "反馈字数超过当前限制，请缩短后重试。",
    FEEDBACK_RATE_LIMITED: "提交过于频繁，请稍后再试。",
    FEEDBACK_NOT_FOUND: "反馈不存在，或当前账号无权查看。",
    ANNOUNCEMENT_NOT_FOUND: "公告已停用或不存在。",
    AUTH_REQUIRED: "请登录后继续。", AUTH_SESSION_INVALID: "登录已失效，请重新登录。", USER_DISABLED: "当前账号不可执行此操作。"
  };
  return Object.hasOwn(messages, error.code) ? messages[error.code]! : (error.status === 401 ? "登录已失效，请重新登录。" : "暂时无法完成，请重试。提交结果不确定时会先核对原请求。");
}
