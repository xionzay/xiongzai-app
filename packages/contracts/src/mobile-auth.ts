export const mobilePlatforms = ["IOS", "ANDROID"] as const;

export type MobilePlatform = (typeof mobilePlatforms)[number];

export interface MobileSmsLoginRequest {
  phone: string;
  code: string;
  device_id: string;
  device_name: string;
  platform: MobilePlatform;
  app_version?: string;
  policy_version_ids: string[];
}

export interface MobileTokenRefreshRequest {
  refresh_token: string;
  device_id: string;
}

export interface MobileTokenResponse<TUser = unknown> {
  token_type: "Bearer";
  access_token: string;
  access_token_expires_in_seconds: number;
  refresh_token: string;
  refresh_token_expires_in_seconds: number;
  session_id: string;
  user: TUser;
}
