export interface SecureStoreAdapter {
  getItemAsync(key: string): Promise<string | null>;
  setItemAsync(key: string, value: string, options?: Record<string, unknown>): Promise<void>;
  deleteItemAsync(key: string): Promise<void>;
}

export interface CredentialKeys {
  refreshToken: string;
  deviceId: string;
}

const defaultKeys: CredentialKeys = {
  refreshToken: "xiongzai.refresh_token",
  deviceId: "xiongzai.device_id"
};

export class SecureCredentialsStore {
  constructor(
    private readonly adapter: SecureStoreAdapter,
    private readonly keys: CredentialKeys = defaultKeys,
    private readonly secureOptions: Record<string, unknown> = {}
  ) {}

  getRefreshToken(): Promise<string | null> {
    return this.adapter.getItemAsync(this.keys.refreshToken);
  }

  setRefreshToken(token: string): Promise<void> {
    return this.adapter.setItemAsync(this.keys.refreshToken, token, this.secureOptions);
  }

  clearRefreshToken(): Promise<void> {
    return this.adapter.deleteItemAsync(this.keys.refreshToken);
  }

  async getOrCreateDeviceId(createId: () => string): Promise<string> {
    const current = await this.adapter.getItemAsync(this.keys.deviceId);
    if (current) return current;
    const created = createId();
    await this.adapter.setItemAsync(this.keys.deviceId, created, this.secureOptions);
    return created;
  }

  getDeviceId(): Promise<string | null> {
    return this.adapter.getItemAsync(this.keys.deviceId);
  }

  async clearSession(): Promise<void> {
    await this.clearRefreshToken();
  }
}
