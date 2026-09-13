import type { MobilePlatform } from "@/types/api";

export interface MobileLoginDevice {
  deviceId: string;
  deviceName: string;
  platform: MobilePlatform;
  appVersion?: string;
}

export function buildMobileLoginRequest(input: {
  phone: string;
  code: string;
  policyVersionIds: string[];
  device: MobileLoginDevice;
}) {
  return {
    phone: input.phone,
    code: input.code,
    device_id: input.device.deviceId,
    device_name: input.device.deviceName,
    platform: input.device.platform,
    ...(input.device.appVersion ? { app_version: input.device.appVersion } : {}),
    policy_version_ids: [...new Set(input.policyVersionIds)]
  };
}
