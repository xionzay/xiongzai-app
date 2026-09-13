import type { SecureStoreAdapter } from "@/storage/secure-credentials";

export function createSimulatorSafeSecureStore(
  primary: SecureStoreAdapter,
  allowMemoryFallback: boolean
): SecureStoreAdapter {
  const memory = new Map<string, string>();

  return {
    async getItemAsync(key) {
      try {
        return (await primary.getItemAsync(key)) ?? memory.get(key) ?? null;
      } catch (error) {
        if (!allowMemoryFallback) throw error;
        return memory.get(key) ?? null;
      }
    },
    async setItemAsync(key, value, options) {
      try {
        await primary.setItemAsync(key, value, options);
        memory.delete(key);
      } catch (error) {
        if (!allowMemoryFallback) throw error;
        memory.set(key, value);
      }
    },
    async deleteItemAsync(key) {
      try {
        await primary.deleteItemAsync(key);
      } catch (error) {
        if (!allowMemoryFallback) throw error;
      } finally {
        memory.delete(key);
      }
    }
  };
}
