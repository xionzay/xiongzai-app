import { createContext, useCallback, useContext, useEffect, useMemo, useState, type PropsWithChildren } from "react";
import { ApiClientError } from "@/api/api-error";
import { afterSaleIntentStore, apiClient, chatOutboxStore, checkoutSessionStore, credentialsStore, getDeviceDescriptor, withdrawalIntentStore } from "@/auth/runtime";
import { buildMobileLoginRequest } from "@/auth/mobile-login-request";
import type { AuthStatus } from "@/auth/route-guard";
import type { MobileTokenResponse, Viewer } from "@/types/api";
import { queryClient } from "@/query/query-client";
import { clearSessionScopedCache } from "@/query/session-cache";

interface AuthContextValue {
  status: AuthStatus;
  user: Viewer | null;
  bootstrapError: string | null;
  retryBootstrap(): Promise<void>;
  sendSms(phone: string): Promise<void>;
  login(phone: string, code: string, policyVersionIds: string[]): Promise<Viewer>;
  completeProfile(nickname: string): Promise<Viewer>;
  updateProfile(input: { nickname: string; bio: string | null; avatarFileId: string | null; profileVersion: number; userVersion: number }): Promise<Viewer>;
  refreshUser(): Promise<Viewer>;
  clearRevokedSession(): Promise<void>;
  logout(): Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);
const terminalAuthCodes = new Set(["AUTH_SESSION_INVALID", "AUTH_REFRESH_INVALID", "USER_DISABLED"]);

export function AuthProvider({ children }: PropsWithChildren) {
  const [status, setStatus] = useState<AuthStatus>("booting");
  const [user, setUser] = useState<Viewer | null>(null);
  const [bootstrapError, setBootstrapError] = useState<string | null>(null);

  const clearLocalState = useCallback(async () => {
    await apiClient.clearAuthentication().catch(() => undefined);
    await checkoutSessionStore.clear().catch(() => undefined);
    await afterSaleIntentStore.clearRefund().catch(() => undefined);
    await chatOutboxStore.clearAll().catch(() => undefined);
    await withdrawalIntentStore.clear().catch(() => undefined);
    clearSessionScopedCache(queryClient);
    setUser(null);
    setStatus("anonymous");
  }, []);

  const bootstrap = useCallback(async () => {
    setStatus("booting");
    setBootstrapError(null);
    let refreshToken: string | null;
    try {
      refreshToken = await credentialsStore.getRefreshToken();
    } catch {
      setUser(null);
      setBootstrapError("无法读取系统安全存储，请解锁设备后重试；未清除已有登录凭证");
      return;
    }
    if (!refreshToken) {
      await clearLocalState();
      return;
    }
    try {
      await apiClient.refresh();
      const currentUser = await apiClient.request<Viewer>("/me");
      setUser(currentUser);
      setStatus("authenticated");
    } catch (error) {
      setUser(null);
      if (error instanceof ApiClientError && terminalAuthCodes.has(error.code)) {
        await clearLocalState();
        return;
      }
      setStatus("booting");
      setBootstrapError("无法恢复登录状态，已保留安全凭证，请检查网络后重试");
    }
  }, [clearLocalState]);

  useEffect(() => {
    apiClient.setAuthFailureHandler(clearLocalState);
    queueMicrotask(() => void bootstrap());
    return () => apiClient.setAuthFailureHandler(null);
  }, [bootstrap, clearLocalState]);

  const value = useMemo<AuthContextValue>(() => ({
    status,
    user,
    bootstrapError,
    retryBootstrap: bootstrap,
    sendSms: async (phone) => {
      await apiClient.publicRequest<void>("/auth/sms/send", {
        method: "POST",
        body: JSON.stringify({ phone })
      });
    },
    login: async (phone, code, policyVersionIds) => {
      const device = await getDeviceDescriptor();
      const response = await apiClient.publicRequest<MobileTokenResponse>("/auth/mobile/sms/login", {
        method: "POST",
        body: JSON.stringify(buildMobileLoginRequest({
          phone,
          code,
          device,
          policyVersionIds
        }))
      });
      await apiClient.acceptTokens(response);
      setUser(response.user);
      setStatus("authenticated");
      return response.user;
    },
    completeProfile: async (nickname) => {
      if (!user) throw new ApiClientError("AUTH_REQUIRED", "请先完成登录", 401);
      const updated = await apiClient.request<Viewer>("/me/profile", {
        method: "PATCH",
        body: JSON.stringify({
          nickname: nickname.trim(),
          bio: user.profile?.bio ?? null,
          avatar_file_id: user.profile?.avatar_file_id ?? null,
          version: user.profile?.version ?? 0,
          user_version: user.version
        })
      });
      setUser(updated);
      return updated;
    },
    updateProfile: async (input) => {
      const updated = await apiClient.request<Viewer>("/me/profile", { method: "PATCH", body: JSON.stringify({ nickname: input.nickname.trim(), bio: input.bio, avatar_file_id: input.avatarFileId, version: input.profileVersion, user_version: input.userVersion }) });
      setUser(updated); return updated;
    },
    refreshUser: async () => { const updated = await apiClient.request<Viewer>("/me"); setUser(updated); return updated; },
    clearRevokedSession: clearLocalState,
    logout: async () => {
      try {
        await apiClient.request<void>("/auth/mobile/logout", { method: "POST", retryAfterRefresh: false });
      } finally {
        await clearLocalState();
      }
    }
  }), [bootstrap, bootstrapError, clearLocalState, status, user]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth 必须在 AuthProvider 内使用");
  return value;
}
