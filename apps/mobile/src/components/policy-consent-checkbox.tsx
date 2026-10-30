import { Pressable, StyleSheet, Text, View } from "react-native";
import { JellyIcon } from "@/components/jelly-icon";
import { colors } from "@/theme/tokens";

export function PolicyConsentCheckbox({ label, checked, disabled = false, onPress }: {
  label: string;
  checked: boolean;
  disabled?: boolean;
  onPress(): void;
}) {
  return <Pressable
    accessibilityRole="checkbox"
    accessibilityLabel={label}
    accessibilityState={{ checked, disabled }}
    disabled={disabled}
    onPress={onPress}
    style={({ pressed }) => [styles.target, pressed && !disabled && styles.pressed]}
  >
    <View accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={[styles.box, checked && styles.checked]}>
      {checked ? <Text style={styles.mark}><JellyIcon kind="check" label="已选" /></Text> : null}
    </View>
  </Pressable>;
}

const styles = StyleSheet.create({
  target: { minWidth: 48, minHeight: 48, alignItems: "center", justifyContent: "center", flexShrink: 0 },
  box: { width: 21, height: 21, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: colors.border, borderRadius: 6, backgroundColor: colors.surfaceCard },
  checked: { borderColor: colors.brand, backgroundColor: colors.brand },
  mark: { color: colors.white, fontWeight: "900" },
  pressed: { opacity: 0.68 }
});
