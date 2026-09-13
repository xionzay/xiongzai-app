export class AdminApiError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly status: number,
    readonly requestId: string | null = null,
  ) { super(message); this.name = "AdminApiError"; }
}

type AdminApiEvent = { type: "session-expired" };
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
  const body = await response.json().catch(() => ({})) as Record<string, unknown>;
  throwForError(response, body, path);
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
