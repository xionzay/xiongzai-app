import type { SecureStoreAdapter } from "../src/storage/secure-credentials";
import type { MobileTokenResponse } from "../src/types/api";

export class MemorySecureStore implements SecureStoreAdapter {
  readonly values = new Map<string, string>();
  async getItemAsync(key: string) { return this.values.get(key) ?? null; }
  async setItemAsync(key: string, value: string) { this.values.set(key, value); }
  async deleteItemAsync(key: string) { this.values.delete(key); }
}

export function tokenResponse(suffix = "1"): MobileTokenResponse {
  return {
    token_type: "Bearer",
    access_token: `access-${suffix}`,
    access_token_expires_in_seconds: 900,
    refresh_token: `refresh-${suffix}`,
    refresh_token_expires_in_seconds: 2_592_000,
    session_id: `session-${suffix}`,
    user: {
      id: "user-1",
      phone_mask: "138****8000",
      status: "NORMAL",
      profile_initialized: true,
      version: 1,
      profile: { nickname: "熊崽", avatar_file_id: null, bio: null, public_user_no: "XZ10001", version: 1 },
      identity_verification: null
    }
  };
}

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}
