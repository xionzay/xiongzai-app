import type { MobilePlatform, MobileTokenResponse } from "@/types/api";

export interface MobileLoginInput {
  phone: string;
  code: string;
  device_id: string;
  device_name: string;
  platform: MobilePlatform;
  app_version?: string;
}

export interface MobileRefreshInput {
  refresh_token: string;
  device_id: string;
}

export type { MobileTokenResponse };
