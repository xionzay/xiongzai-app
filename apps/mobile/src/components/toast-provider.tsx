import { createContext, useCallback, useContext, useEffect, useMemo, useState, type PropsWithChildren } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, radii, spacing, typography } from "@/theme/tokens";

type ToastTone = "info" | "success" | "danger";
interface ToastValue { showToast(message: string, tone?: ToastTone): void }
interface ToastState { message: string; tone: ToastTone; nonce: number }
const ToastContext = createContext<ToastValue | null>(null);

export function ToastProvider({ children }: PropsWithChildren) {
  const [toast, setToast] = useState<ToastState | null>(null);
  const insets = useSafeAreaInsets();
  const showToast = useCallback((message: string, tone: ToastTone = "info") => setToast({ message, tone, nonce: Date.now() }), []);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast((current) => current?.nonce === toast.nonce ? null : current), 2_800);
    return () => clearTimeout(timer);
  }, [toast]);
  const value = useMemo(() => ({ showToast }), [showToast]);
  return <ToastContext.Provider value={value}>{children}{toast ? <View pointerEvents="none" accessibilityRole="alert" accessibilityLiveRegion="assertive" style={[styles.toast, styles[toast.tone], { top: insets.top + spacing.sm }]}><Text style={[styles.copy, toast.tone === "danger" && styles.dangerCopy]}>{toast.message}</Text></View> : null}</ToastContext.Provider>;
}

export function useToast(): ToastValue {
  const value = useContext(ToastContext);
  if (!value) throw new Error("useToast 必须在 ToastProvider 内使用");
  return value;
}

const styles = StyleSheet.create({ toast: { position: "absolute", zIndex: 1000, left: spacing.lg, right: spacing.lg, minHeight: 48, justifyContent: "center", paddingHorizontal: spacing.lg, paddingVertical: spacing.md, borderRadius: radii.md, shadowColor: "#000", shadowOpacity: 0.16, shadowRadius: 12, shadowOffset: { width: 0, height: 5 }, elevation: 8 }, info: { backgroundColor: colors.brandDeep }, success: { backgroundColor: "#176B45" }, danger: { backgroundColor: colors.danger }, copy: { ...typography.body, color: colors.white, textAlign: "center", fontWeight: "700" }, dangerCopy: { color: colors.white } });
