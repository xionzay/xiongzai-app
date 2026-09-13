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
import { router } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { ChevronLeftIcon, ChevronRightIcon } from "@/components/ui-icons";
import { colors } from "@/theme/tokens";

const backgroundBands = Array.from({ length: 48 }, (_, index) => {
  const ratio = index / 47;
  const transition = Math.max(0, Math.min(1, (ratio - 0.19) / 0.34));
  const from = [222, 240, 255];
  const to = [249, 244, 235];
  const channel = (value: number, target: number) => Math.round(value + (target - value) * transition);
  return `rgb(${channel(from[0]!, to[0]!)}, ${channel(from[1]!, to[1]!)}, ${channel(from[2]!, to[2]!)})`;
});

export const nativeShadow = {
  shadowColor: "#4B3920",
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
        <ScrollView
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}
          automaticallyAdjustKeyboardInsets={Platform.OS === "ios"}
          contentContainerStyle={[styles.content, contentStyle]}
          refreshControl={onRefresh ? <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.brand} /> : undefined}
        >
          <NativeHeader title={title} subtitle={subtitle} action={action} onBack={onBack} />
          {children}
        </ScrollView>
        {footer ? <View style={styles.footer}>{footer}</View> : null}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

export function NativeBackdrop() {
  return (
    <View pointerEvents="none" style={styles.backdrop}>
      {backgroundBands.map((color, index) => <View key={`${index}-${color}`} style={[styles.band, { backgroundColor: color }]} />)}
    </View>
  );
}

export function NativeHeader({ title, subtitle, action, onBack = () => router.back() }: {
  title: string;
  subtitle: string;
  action?: ReactNode;
  onBack?: () => void;
}) {
  return (
    <View style={styles.header}>
      <Pressable accessibilityRole="button" accessibilityLabel="返回" onPress={onBack} style={({ pressed }) => [styles.back, pressed && styles.pressed]}>
        <ChevronLeftIcon size={23} />
      </Pressable>
      <View style={styles.headerCopy}>
        <Text style={styles.pageTitle}>{title}</Text>
        <Text style={styles.pageSubtitle}>{subtitle}</Text>
      </View>
      {action ? <View style={styles.headerAction}>{action}</View> : null}
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
        <Text style={[styles.rowLabel, danger && styles.dangerText]}>{label}</Text>
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
      <Text style={[styles.buttonText, tone === "secondary" && styles.secondaryButtonText]}>{label}</Text>
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
  header: { minHeight: 76, flexDirection: "row", alignItems: "center" },
  back: { width: 44, height: 44, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: "rgba(62,57,47,0.10)", borderRadius: 14, backgroundColor: "#FFFDF8", ...nativeShadow },
  headerCopy: { flex: 1, marginLeft: 11 },
  pageTitle: { color: colors.text, fontSize: 24, lineHeight: 29, fontWeight: "800" },
  pageSubtitle: { marginTop: 3, color: colors.textSecondary, fontSize: 13, lineHeight: 18 },
  headerAction: { marginLeft: 8 },
  footer: { borderTopWidth: 1, borderTopColor: "rgba(62,57,47,0.11)", backgroundColor: "rgba(255,252,245,0.98)" },
  paper: { overflow: "hidden", borderWidth: 1, borderColor: "rgba(62,57,47,0.10)", borderRadius: 18, backgroundColor: "rgba(255,253,248,0.96)", ...nativeShadow },
  row: { minHeight: 72, flexDirection: "row", alignItems: "center", gap: 11, paddingHorizontal: 14 },
  rowBorder: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: "rgba(62,57,47,0.12)" },
  rowCopy: { flex: 1 },
  rowLabel: { color: colors.text, fontSize: 16, lineHeight: 22, fontWeight: "800" },
  rowNote: { marginTop: 4, color: colors.textSecondary, fontSize: 12, lineHeight: 17 },
  rowValue: { maxWidth: "34%", color: colors.textSecondary, fontSize: 12, lineHeight: 17, fontWeight: "700", textAlign: "right" },
  dangerText: { color: colors.danger },
  button: { minHeight: 48, alignItems: "center", justifyContent: "center", paddingHorizontal: 18, borderRadius: 14, backgroundColor: colors.brand, ...nativeShadow },
  secondaryButton: { borderWidth: 1, borderColor: "rgba(62,57,47,0.14)", backgroundColor: "#FFFDF8" },
  dangerButton: { backgroundColor: colors.danger },
  buttonText: { color: colors.white, fontSize: 15, lineHeight: 20, fontWeight: "900" },
  secondaryButtonText: { color: colors.text },
  sectionHeading: { minHeight: 48, justifyContent: "center", paddingHorizontal: 14, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: "rgba(62,57,47,0.12)" },
  sectionTitle: { color: colors.text, fontSize: 16, lineHeight: 22, fontWeight: "900" },
  sectionNote: { marginTop: 2, color: colors.textSecondary, fontSize: 12, lineHeight: 17 },
  disabled: { opacity: 0.45 },
  pressed: { opacity: 0.72 }
});
