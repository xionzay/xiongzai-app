import { useQuery } from "@tanstack/react-query";
import { StyleSheet, Text, View, type ImageResizeMode, type ImageStyle, type StyleProp } from "react-native";
import { apiClient } from "@/auth/runtime";
import { SafeImage } from "@/components/safe-image";
import { colors, spacing, typography } from "@/theme/tokens";
import type { PublicFileApiView } from "@/types/api";

export function FileImage({ fileId, style, label, resizeMode = "cover" }: { fileId: string | null | undefined; style: StyleProp<ImageStyle>; label: string; resizeMode?: ImageResizeMode }) {
  const query = useQuery({ queryKey: ["public-file", fileId], enabled: Boolean(fileId), retry: false, queryFn: ({ signal }) => apiClient.publicRequest<PublicFileApiView>(`/files/${fileId}`, { signal }) });
  if (fileId && query.data) return <SafeImage source={{ uri: query.data.content_url }} resizeMode={resizeMode} style={style} label={label} />;
  return <View style={[style, styles.fallback]} accessibilityRole="image" accessibilityLabel={`${label}，${query.isPending && fileId ? "正在加载" : "暂无可用图片"}`}><Text style={styles.mark}>{query.isPending && fileId ? "…" : "◇"}</Text><Text style={styles.text}>{query.isPending && fileId ? "图片加载中" : "图片暂不可用"}</Text></View>;
}

const styles = StyleSheet.create({ fallback: { alignItems: "center", justifyContent: "center", gap: spacing.xs, backgroundColor: colors.surfaceBlue }, mark: { color: colors.brand, fontSize: 24, fontWeight: "900" }, text: { ...typography.caption, color: colors.textSecondary } });
