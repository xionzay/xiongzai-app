import { ApiClientError, readApiError } from "@/api/api-error";
import type { MobileTokenResponse } from "@/auth/contracts";
import { TokenVault } from "@/auth/token-vault";
import { SecureCredentialsStore } from "@/storage/secure-credentials";

type FetchLike = typeof fetch;
type AuthFailureHandler = (error: ApiClientError) => void | Promise<void>;

interface RequestOptions extends RequestInit {
  authenticated?: boolean;
  retryAfterRefresh?: boolean;
  timeoutMs?: number;
}

const nonRefreshableCodes = new Set(["AUTH_SESSION_INVALID", "AUTH_REFRESH_INVALID", "USER_DISABLED"]);

export class ApiClient {
  #refreshPromise: Promise<MobileTokenResponse> | null = null;
  #onAuthFailure: AuthFailureHandler | null = null;

  constructor(
    private readonly baseUrl: string,
    private readonly tokenVault: TokenVault,
    private readonly credentials: SecureCredentialsStore,
    private readonly fetchImpl: FetchLike = fetch
  ) {}

  setAuthFailureHandler(handler: AuthFailureHandler | null): void {
    this.#onAuthFailure = handler;
  }

  /** Public review proxy only; never attaches Bearer credentials or an object-store grant. */
  reviewContentUrl(path: string): string {
    if (!/^\/api\/v1\/files\/review-images\/[0-9a-f-]{36}\/[0-9a-f-]{36}\/content$/iu.test(path)) throw new Error('Invalid review content path');
    return `${this.baseUrl.replace(/\/api\/v1\/?$/u, '')}${path}`;
  }

  async request<T>(path: string, options: RequestOptions = {}): Promise<T> {
    const authenticated = options.authenticated ?? true;
    const retryAfterRefresh = options.retryAfterRefresh ?? true;
    const tokenUsed = authenticated ? this.tokenVault.getAccessToken() : null;
    if (authenticated && !tokenUsed) {
      throw new ApiClientError("AUTH_REQUIRED", "请先登录", 401);
    }
    const response = await this.perform(path, options, authenticated);

    if ((response.status === 401 || response.status === 403) && authenticated) {
      const originalError = await readApiError(response);
      if (nonRefreshableCodes.has(originalError.code)) {
        await this.failAuthentication(originalError);
        throw originalError;
      }

      if (response.status !== 401 || !retryAfterRefresh) throw originalError;
      const currentToken = this.tokenVault.getAccessToken();
      if (currentToken && tokenUsed !== currentToken) {
        return this.request<T>(path, { ...options, retryAfterRefresh: false });
      }

      try {
        await this.refresh();
      } catch (error) {
        const refreshError = error instanceof ApiClientError
          ? error
          : new ApiClientError("AUTH_REFRESH_INVALID", "登录状态已失效，请重新登录", 401);
        await this.failAuthentication(refreshError);
        throw refreshError;
      }
      return this.request<T>(path, { ...options, retryAfterRefresh: false });
    }

    if (response.status === 204) return undefined as T;
    if (!response.ok) throw await readApiError(response);
    return response.json() as Promise<T>;
  }

  publicRequest<T>(path: string, options: Omit<RequestOptions, "authenticated"> = {}): Promise<T> {
    return this.request<T>(path, { ...options, authenticated: false, retryAfterRefresh: false });
  }

  async acceptTokens(response: MobileTokenResponse): Promise<void> {
    try {
      await this.credentials.setRefreshToken(response.refresh_token);
      this.tokenVault.setAccessToken(response.access_token, response.session_id);
    } catch (error) {
      this.tokenVault.clear();
      await this.credentials.clearSession().catch(() => undefined);
      throw error;
    }
  }

  async clearAuthentication(): Promise<void> {
    this.tokenVault.clear();
    await this.credentials.clearSession();
  }

  async refresh(): Promise<MobileTokenResponse> {
    if (this.#refreshPromise) return this.#refreshPromise;
    this.#refreshPromise = this.performRefresh().finally(() => {
      this.#refreshPromise = null;
    });
    return this.#refreshPromise;
  }

  private async perform(path: string, options: RequestOptions, authenticated: boolean): Promise<Response> {
    const { authenticated: _authenticated, retryAfterRefresh: _retryAfterRefresh, timeoutMs = 15_000, ...fetchOptions } = options;
    void _authenticated; void _retryAfterRefresh;
    const headers = new Headers(options.headers);
    if (options.body && !headers.has("content-type")) headers.set("content-type", "application/json");
    if (authenticated) {
      const token = this.tokenVault.getAccessToken();
      if (token) headers.set("authorization", `Bearer ${token}`);
    }
    const controller = new AbortController();
    let timedOut = false;
    const abortFromCaller = () => controller.abort();
    options.signal?.addEventListener("abort", abortFromCaller, { once: true });
    if (options.signal?.aborted) controller.abort();
    const timer = setTimeout(() => { timedOut = true; controller.abort(); }, timeoutMs);
    try {
      return await this.fetchImpl(`${this.baseUrl}${path}`, { ...fetchOptions, headers, signal: controller.signal });
    } catch (error) {
      if (timedOut) throw new ApiClientError("NETWORK_TIMEOUT", "网络请求超时，请确认结果后安全重试", 408);
      throw error;
    } finally {
      clearTimeout(timer);
      options.signal?.removeEventListener("abort", abortFromCaller);
    }
  }

  private async performRefresh(): Promise<MobileTokenResponse> {
    const [refreshToken, deviceId] = await Promise.all([
      this.credentials.getRefreshToken(),
      this.credentials.getDeviceId()
    ]);
    if (!refreshToken || !deviceId) {
      throw new ApiClientError("AUTH_REFRESH_INVALID", "登录状态已失效，请重新登录", 401);
    }

    const response = await this.perform("/auth/mobile/token/refresh", {
      method: "POST",
      body: JSON.stringify({ refresh_token: refreshToken, device_id: deviceId })
    }, false);
    if (!response.ok) throw await readApiError(response);
    const body = await response.json() as MobileTokenResponse;
    await this.acceptTokens(body);
    return body;
  }

  private async failAuthentication(error: ApiClientError): Promise<void> {
    await this.clearAuthentication().catch(() => undefined);
    await this.#onAuthFailure?.(error);
  }
}
