export class AdminApiError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly status: number,
    readonly requestId: string | null = null,
  ) { super(message); this.name = "AdminApiError"; }
}

type AdminApiEvent = { type: "session-expired" | "data-changed" };
type AdminApiListener = (event: AdminApiEvent) => void;
const listeners = new Set<AdminApiListener>();

export function subscribeAdminApi(listener: AdminApiListener) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function emit(event: AdminApiEvent) {
  for (const listener of listeners) listener(event);
}

function adminApiBaseUrl() {
  if (typeof window === "undefined") return "http://127.0.0.1:3002/admin-api/v1";
  const host = window.location.hostname.replace(/^\[|\]$/gu, "").toLowerCase();
  if (host === "localhost" || host === "::1" || /^127(?:\.\d{1,3}){3}$/u.test(host)) {
    const api = new URL(window.location.origin); api.port = "3002"; api.pathname = "/admin-api/v1"; return api.toString().replace(/\/$/u, "");
  }
  return "/admin-api/v1";
}

export async function adminApiRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await adminApiFetch(path, init);
  const body: unknown = response.status === 204 ? {} : await response.json().catch(() => null);
  const structured = body !== null && typeof body === "object";
  // An HTTP success alone is not a valid JSON business acknowledgement. Never
  // turn proxy HTML, truncated JSON or scalar payloads into a successful write.
  throwForError(response, structured ? body as Record<string, unknown> : {}, path);
  if (!structured) throw new AdminApiError(
    "管理服务响应格式异常，操作结果尚未确认，请重新读取记录后核对",
    "ADMIN_RESPONSE_INVALID", response.status, response.headers.get("x-request-id"),
  );
  if (init.method && !["GET", "HEAD"].includes(init.method.toUpperCase()) && !path.startsWith("/auth/")) emit({ type: "data-changed" });
  return body as T;
}

export async function adminApiBlob(path: string, init: RequestInit = {}): Promise<Blob> {
  const response = await adminApiFetch(path, init);
  if (!response.ok) {
    const body = await response.json().catch(() => ({})) as Record<string, unknown>;
    throwForError(response, body, path);
  }
  return response.blob();
}

/** Cookie-authenticated media endpoint, not an object-store or signed URL. Browser video uses Range. */
export function adminFilePreviewUrl(fileId: string): string {
  if (!/^[0-9a-f-]{36}$/iu.test(fileId)) throw new AdminApiError("文件编号无效", "FILE_ID_INVALID", 400);
  return `${adminApiBaseUrl()}/files/${encodeURIComponent(fileId)}/preview`;
}

async function adminApiFetch(path: string, init: RequestInit): Promise<Response> {
  let response: Response;
  try {
    response = await fetch(`${adminApiBaseUrl()}${path}`, {
      ...init,
      credentials: "include",
      headers: { ...(init.body ? { "content-type": "application/json" } : {}), ...init.headers },
    });
  } catch {
    const offline = typeof navigator !== "undefined" && navigator.onLine === false;
    throw new AdminApiError(
      offline ? "网络连接已断开，请恢复网络后重试" : "无法连接管理服务，请稍后重试",
      offline ? "ADMIN_NETWORK_OFFLINE" : "ADMIN_NETWORK_UNAVAILABLE",
      0,
    );
  }
  return response;
}

function throwForError(response: Response, body: Record<string, unknown>, path: string): void {
  const requestId = response.headers.get("x-request-id") ?? (typeof body.request_id === "string" ? body.request_id : null);
  if (!response.ok) {
    if (response.status === 401 && !path.startsWith("/auth/login") && !path.startsWith("/auth/mfa/verify")) emit({ type: "session-expired" });
    throw new AdminApiError(String(body.message ?? "后台接口请求失败"), String(body.code ?? "ADMIN_API_ERROR"), response.status, requestId);
  }
}

export function adminFailure(cause: unknown) {
  if (!(cause instanceof AdminApiError)) return { state: "error" as const, message: "后台请求失败，请稍后重试", requestId: null };
  return {
    state: cause.code === "ADMIN_NETWORK_OFFLINE" ? "offline" as const : "error" as const,
    message: cause.status === 403 ? (cause.message || "当前管理员没有执行此操作的权限") : cause.message,
    requestId: cause.requestId,
  };
}
