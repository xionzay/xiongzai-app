import * as Application from "expo-application";
import * as Crypto from "expo-crypto";
import * as Device from "expo-device";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";
import { ApiClient } from "@/api/client";
import { resolveApiBaseUrl } from "@/api/config";
import { TokenVault } from "@/auth/token-vault";
import { SecureCredentialsStore, type SecureStoreAdapter } from "@/storage/secure-credentials";
import { CheckoutSessionStore } from "@/storage/checkout-session";
import { AfterSaleIntentStore } from "@/storage/after-sale-intent";
import { ChatOutboxStore } from "@/storage/chat-outbox";
import { WithdrawalIntentStore } from "@/storage/withdrawal-intent";
import type { MobilePlatform } from "@/types/api";
import { runtimeFlags } from "@/config/runtime-flags";
import { createSimulatorSafeSecureStore } from "@/storage/simulator-safe-secure-store";

const nativeSecureStoreAdapter: SecureStoreAdapter = {
  getItemAsync: (key) => SecureStore.getItemAsync(key),
  setItemAsync: (key, value) => SecureStore.setItemAsync(key, value, {
    keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY
  }),
  deleteItemAsync: (key) => SecureStore.deleteItemAsync(key)
};

export const secureStoreAdapter = createSimulatorSafeSecureStore(
  nativeSecureStoreAdapter,
  Platform.OS === "ios" && !Device.isDevice && runtimeFlags.appEnvironment !== "production"
);

export const tokenVault = new TokenVault();
export const credentialsStore = new SecureCredentialsStore(secureStoreAdapter);
export const checkoutSessionStore = new CheckoutSessionStore(secureStoreAdapter);
export const afterSaleIntentStore = new AfterSaleIntentStore(secureStoreAdapter, () => Crypto.randomUUID());
export const chatOutboxStore = new ChatOutboxStore(secureStoreAdapter, () => Crypto.randomUUID());
export const withdrawalIntentStore = new WithdrawalIntentStore(secureStoreAdapter, () => Crypto.randomUUID());

const platform = Platform.OS === "android" ? "android" : Platform.OS === "ios" ? "ios" : "other";

export const apiClient = new ApiClient(
  resolveApiBaseUrl({
    configuredUrl: process.env.EXPO_PUBLIC_API_BASE_URL,
    appEnvironment: runtimeFlags.appEnvironment,
    platform,
    isPhysicalDevice: Device.isDevice
  }),
  tokenVault,
  credentialsStore
);

export async function getDeviceDescriptor(): Promise<{
  deviceId: string;
  deviceName: string;
  platform: MobilePlatform;
  appVersion?: string;
}> {
  const deviceId = await credentialsStore.getOrCreateDeviceId(() => Crypto.randomUUID());
  return {
    deviceId,
    deviceName: Device.deviceName?.trim() || `${Platform.OS} device`,
    platform: Platform.OS === "android" ? "ANDROID" : "IOS",
    appVersion: Application.nativeApplicationVersion ?? undefined
  };
}
