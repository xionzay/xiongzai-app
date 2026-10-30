import { StyleSheet, Text, TextInput, View, type TextInputProps } from "react-native";
import { colors, spacing, typography } from "@/theme/tokens";

interface FormFieldProps extends TextInputProps {
  label: string;
  error?: string;
}

export function FormField({ label, error, style, ...props }: FormFieldProps) {
  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        {...props}
        accessibilityLabel={props.accessibilityLabel ?? label}
        accessibilityHint={error}
        placeholderTextColor="#9A9DA5"
        style={[styles.input, error && styles.inputError, style]}
      />
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.xs },
  label: { ...typography.caption, color: colors.textSecondary, fontWeight: "700" },
  input: { minHeight: 48, borderWidth: 1, borderColor: colors.controlBorder, borderRadius: 10, backgroundColor: colors.input, paddingHorizontal: spacing.md, paddingVertical: 10, color: colors.text, fontSize: 16 },
  inputError: { borderColor: colors.danger },
  error: { ...typography.caption, color: colors.danger }
});
