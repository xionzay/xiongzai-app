import { StyleSheet, Text, View } from "react-native";
import { AppScreen } from "@/components/app-screen";
import { NoticeBanner } from "@/components/notice-banner";
import { PageHeader } from "@/components/page-header";
import { colors, radii, spacing, typography } from "@/theme/tokens";

export function UnavailableScreen({ title, description, nextStep }: { title: string; description: string; nextStep: string }) {
  return (
    <AppScreen contentContainerStyle={styles.content}>
      <PageHeader title={title} />
      <View style={styles.card}>
        <Text style={styles.title}>功能暂未开放</Text>
        <Text style={styles.body}>{description}</Text>
      </View>
      <NoticeBanner message={nextStep} />
      <NoticeBanner tone="danger" message="本页面不会在本地伪造成功结果，也不会修改您的账户资料。" />
    </AppScreen>
  );
}

const styles = StyleSheet.create({ content: { gap: spacing.md }, card: { gap: spacing.md, padding: spacing.xl, borderRadius: radii.xl, backgroundColor: colors.surfaceCard }, title: { ...typography.sectionTitle, color: colors.text }, body: { ...typography.body, color: colors.textSecondary } });
