import type { SecureStoreAdapter } from "@/storage/secure-credentials";

export function createSimulatorSafeSecureStore(
  primary: SecureStoreAdapter,
  allowMemoryFallback: boolean
): SecureStoreAdapter & { isTemporaryStorage(): boolean } {
  const memory = new Map<string, string>();
  let unavailable = false;

  return {
    isTemporaryStorage: () => unavailable,
    async getItemAsync(key) {
      try {
        return (await primary.getItemAsync(key)) ?? memory.get(key) ?? null;
      } catch (error) {
        if (!allowMemoryFallback) throw error;
        unavailable = true;
        return memory.get(key) ?? null;
      }
    },
    async setItemAsync(key, value, options) {
      try {
        await primary.setItemAsync(key, value, options);
        memory.delete(key);
      } catch (error) {
        if (!allowMemoryFallback) throw error;
        unavailable = true;
        memory.set(key, value);
      }
    },
    async deleteItemAsync(key) {
      try {
        await primary.deleteItemAsync(key);
      } catch (error) {
        if (!allowMemoryFallback) throw error;
        unavailable = true;
      } finally {
        memory.delete(key);
      }
    }
  };
}
