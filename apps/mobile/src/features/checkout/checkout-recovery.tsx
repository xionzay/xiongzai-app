import { useEffect, useRef } from "react";
import { router, usePathname } from "expo-router";
import { useAuth } from "@/auth/auth-provider";
import { checkoutSessionStore } from "@/auth/runtime";

export function CheckoutRecovery() {
  const { status, user } = useAuth();
  const pathname = usePathname();
  const restored = useRef(false);
  useEffect(() => {
    if (restored.current || status !== "authenticated" || !user || pathname !== "/") return;
    restored.current = true;
    void checkoutSessionStore.read().then((session) => {
      if (!session || session.userId !== user.id) return;
      if (session.paymentId && session.orderId) router.replace({ pathname: "/payments/[id]/processing", params: { id: session.paymentId, orderId: session.orderId } });
      else if (session.orderId) router.replace({ pathname: "/orders/[id]/pay", params: { id: session.orderId } });
    });
  }, [pathname, status, user]);
  return null;
}
