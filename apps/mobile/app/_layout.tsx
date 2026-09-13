import { QueryClientProvider } from "@tanstack/react-query";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { AuthProvider } from "@/auth/auth-provider";
import { queryClient } from "@/query/query-client";
import { QueryLifecycleSync } from "@/query/query-lifecycle-sync";
import { CheckoutRecovery } from "@/features/checkout/checkout-recovery";
import { ToastProvider } from "@/components/toast-provider";
import { GlobalNetworkBanner } from "@/components/global-network-banner";

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <QueryLifecycleSync>
          <ToastProvider>
            <AuthProvider>
              <StatusBar style="dark" />
              <CheckoutRecovery />
              <Stack screenOptions={{ headerShown: false, animation: "fade" }} />
              <GlobalNetworkBanner />
            </AuthProvider>
          </ToastProvider>
        </QueryLifecycleSync>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}
