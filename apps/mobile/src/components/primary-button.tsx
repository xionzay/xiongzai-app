import { ActivityIndicator, Pressable, StyleSheet, Text } from "react-native";
import { colors, radii, typography } from "@/theme/tokens";

interface PrimaryButtonProps {
  label: string;
  onPress(): void;
  loading?: boolean;
  disabled?: boolean;
  tone?: "accent" | "brand" | "plain";
  accessibilityLabel?: string;
}

export function PrimaryButton({ label, onPress, loading = false, disabled = false, tone = "accent", accessibilityLabel }: PrimaryButtonProps) {
  const inactive = disabled || loading;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled: inactive, busy: loading }}
      disabled={inactive}
      onPress={onPress}
      style={({ pressed }) => [styles.button, styles[tone], inactive && styles.disabled, pressed && !inactive && styles.pressed]}
    >
      {loading ? <ActivityIndicator color={tone === "plain" ? colors.text : colors.white} /> : <Text style={[styles.label, tone === "plain" && styles.plainLabel]}>{label}</Text>}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: { minHeight: 50, borderRadius: radii.md, alignItems: "center", justifyContent: "center", paddingHorizontal: 18 },
  accent: { backgroundColor: colors.accent },
  brand: { backgroundColor: colors.brand },
  plain: { backgroundColor: colors.surfaceBlue },
  disabled: { backgroundColor: colors.disabled },
  pressed: { transform: [{ scale: 0.985 }], opacity: 0.9 },
  label: { ...typography.body, color: colors.white, fontWeight: "800" },
  plainLabel: { color: colors.brandDeep }
});
