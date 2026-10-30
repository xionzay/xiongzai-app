import { JellyLabel } from "./jelly-icon";
import type { ReactNode } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle
} from "react-native";
import { router, useSegments } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { ChevronLeftIcon, ChevronRightIcon } from "@/components/ui-icons";
import { colors } from "@/theme/tokens";
import { BrandBackdrop } from "@/components/brand-backdrop";

export const nativeShadow = {
  shadowColor: "#326BA5",
  shadowOffset: { width: 0, height: 5 },
  shadowOpacity: 0.08,
  shadowRadius: 14,
  elevation: 3
} as const;

export function NativePage({
  title,
  subtitle,
  children,
  action,
  footer,
  contentStyle,
  refreshing = false,
  onRefresh,
  onBack = () => router.back()
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
  action?: ReactNode;
  footer?: ReactNode;
  contentStyle?: StyleProp<ViewStyle>;
  refreshing?: boolean;
  onRefresh?: () => void;
  onBack?: () => void;
}) {
  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom", "left", "right"]}>
      <NativeBackdrop />
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={0}
      >
        <NativeHeader title={title} subtitle={subtitle} action={action} onBack={onBack} />
        <ScrollView
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}
          automaticallyAdjustKeyboardInsets={Platform.OS === "ios"}
          contentContainerStyle={[styles.content, contentStyle]}
          refreshControl={onRefresh ? <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.brand} /> : undefined}
        >
          {children}
        </ScrollView>
        {footer ? <View style={styles.footer}>{footer}</View> : null}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

export function NativeBackdrop() {
  const segments: readonly string[] = useSegments();
  return <BrandBackdrop seller={segments.includes("seller") || segments.includes("(seller-tabs)")} />;
}

export function NativeHeader({ title, subtitle, action, onBack = () => router.back() }: {
  title: string;
  subtitle: string;
  action?: ReactNode;
  onBack?: () => void;
}) {
  return (
    <View style={styles.header}>
      <Pressable accessibilityRole="button" accessibilityLabel="返回" onPress={onBack} style={({ pressed }) => [styles.back, Boolean(action) && styles.wideBack, pressed && styles.pressed]}>
        <ChevronLeftIcon size={23} />
      </Pressable>
      <View style={styles.headerCopy}>
        <Text accessibilityRole="header" style={styles.pageTitle}>{title}</Text>
        {subtitle ? <Text style={styles.pageSubtitle}>{subtitle}</Text> : null}
      </View>
      <View style={[styles.headerAction, Boolean(action) && styles.wideAction]}>{action}</View>
    </View>
  );
}

export function PaperCard({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.paper, style]}>{children}</View>;
}

export function NativeRow({
  label,
  note,
  value,
  leading,
  trailing,
  onPress,
  last = false,
  danger = false,
  disabled = false
}: {
  label: string;
  note?: string;
  value?: string;
  leading?: ReactNode;
  trailing?: ReactNode;
  onPress?: () => void;
  last?: boolean;
  danger?: boolean;
  disabled?: boolean;
}) {
  const content = (
    <>
      {leading}
      <View style={styles.rowCopy}>
        <Text style={[styles.rowLabel, danger && styles.dangerText]}><JellyLabel text={label} /></Text>
        {note ? <Text style={styles.rowNote}>{note}</Text> : null}
      </View>
      {value ? <Text style={styles.rowValue}>{value}</Text> : null}
      {trailing ?? (onPress ? <ChevronRightIcon size={21} /> : null)}
    </>
  );
  const rowStyle = [styles.row, !last && styles.rowBorder, disabled && styles.disabled];
  if (!onPress) return <View style={rowStyle}>{content}</View>;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={[label, note, value].filter(Boolean).join("，")}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [rowStyle, pressed && styles.pressed]}
    >
      {content}
    </Pressable>
  );
}

export function NativeButton({ label, onPress, disabled = false, tone = "primary" }: {
  label: string;
  onPress(): void;
  disabled?: boolean;
  tone?: "primary" | "secondary" | "danger";
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [styles.button, tone === "secondary" && styles.secondaryButton, tone === "danger" && styles.dangerButton, disabled && styles.disabled, pressed && styles.pressed]}
    >
      <Text style={[styles.buttonText, tone === "secondary" && styles.secondaryButtonText]}><JellyLabel text={label} /></Text>
    </Pressable>
  );
}

export function SectionHeading({ title, note }: { title: string; note?: string }) {
  return <View style={styles.sectionHeading}><Text style={styles.sectionTitle}>{title}</Text>{note ? <Text style={styles.sectionNote}>{note}</Text> : null}</View>;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#DEF0FF" },
  flex: { flex: 1 },
  backdrop: { position: "absolute", top: 0, right: 0, bottom: 0, left: 0 },
  band: { flex: 1 },
  content: { flexGrow: 1, paddingHorizontal: 12, paddingBottom: 24 },
  header: { minHeight: 60, flexDirection: "row", alignItems: "center", paddingHorizontal: 8, paddingVertical: 4 },
  back: { width: 48, minHeight: 48, alignItems: "center", justifyContent: "center" },
  headerCopy: { flex: 1, minWidth: 0 },
  pageTitle: { color: colors.text, fontSize: 19, lineHeight: 26, fontWeight: "600", textAlign: "center" },
  pageSubtitle: { marginTop: 3, color: colors.textSecondary, fontSize: 12, lineHeight: 18, textAlign: "center" },
  headerAction: { width: 48, alignItems: "flex-end" },
  wideAction: { width: 96 },
  wideBack: { width: 96, alignItems: "flex-start", paddingLeft: 12 },
  footer: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.divider, backgroundColor: colors.dock },
  paper: { borderBottomWidth: StyleSheet.hairlineWidth, borderColor: colors.divider, backgroundColor: "transparent" },
  row: { minHeight: 72, flexDirection: "row", alignItems: "center", gap: 11, paddingHorizontal: 14 },
  rowBorder: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.divider },
  rowCopy: { flex: 1 },
  rowLabel: { color: colors.text, fontSize: 15, lineHeight: 22, fontWeight: "600" },
  rowNote: { marginTop: 4, color: colors.textSecondary, fontSize: 12, lineHeight: 17 },
  rowValue: { maxWidth: "34%", color: colors.textSecondary, fontSize: 12, lineHeight: 17, fontWeight: "700", textAlign: "right" },
  dangerText: { color: colors.danger },
  button: { minHeight: 48, alignItems: "center", justifyContent: "center", paddingHorizontal: 18, paddingVertical: 10, borderRadius: 10, backgroundColor: colors.brand },
  secondaryButton: { borderWidth: 1, borderColor: colors.controlBorder, backgroundColor: "transparent" },
  dangerButton: { backgroundColor: colors.danger },
  buttonText: { color: colors.white, fontSize: 15, lineHeight: 20, fontWeight: "900" },
  secondaryButtonText: { color: colors.text },
  sectionHeading: { minHeight: 48, justifyContent: "center", paddingHorizontal: 14, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: "rgba(62,57,47,0.12)" },
  sectionTitle: { color: colors.text, fontSize: 16, lineHeight: 22, fontWeight: "900" },
  sectionNote: { marginTop: 2, color: colors.textSecondary, fontSize: 12, lineHeight: 17 },
  disabled: { opacity: 0.45 },
  pressed: { opacity: 0.72 }
});
