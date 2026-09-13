import { StyleSheet, Text, View } from "react-native";
import { AppScreen } from "@/components/app-screen";
import { BrandHeader } from "@/components/brand-header";
import { colors, radii, spacing, typography } from "@/theme/tokens";

export function EmptyBusinessTab({ title, message, mark }: { title: string; message: string; mark: string }) {
  return (
    <AppScreen scroll={false} contentContainerStyle={styles.content}>
      <BrandHeader subtitle={title} />
      <View style={styles.empty} accessibilityRole="summary">
        <Text style={styles.mark}>{mark}</Text>
        <Text style={styles.title}>{title}为空</Text>
        <Text style={styles.message}>{message}</Text>
      </View>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  content: { paddingTop: spacing.md },
  empty: { flex: 1, alignItems: "center", justifyContent: "center", gap: spacing.md, marginVertical: spacing.xl, borderRadius: radii.xl, backgroundColor: colors.surfaceCard, padding: spacing.xl },
  mark: { fontSize: 48, color: colors.brand },
  title: { ...typography.sectionTitle, color: colors.text },
  message: { ...typography.body, color: colors.textSecondary, textAlign: "center" }
});
