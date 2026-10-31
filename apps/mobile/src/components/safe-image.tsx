import { JellyIcon } from "./jelly-icon";
import { useMemo, useState } from "react";
import { Image, StyleSheet, Text, View, type ImageResizeMode, type ImageSourcePropType, type ImageStyle, type StyleProp } from "react-native";
import { colors, spacing, typography } from "@/theme/tokens";

type SafeImageProps = { source: ImageSourcePropType; style: StyleProp<ImageStyle>; label: string; resizeMode?: ImageResizeMode };

export function SafeImage(props: SafeImageProps) {
  const sourceKey = useMemo(() => JSON.stringify(props.source), [props.source]);
  return <SafeImageContent key={sourceKey} {...props} />;
}

function SafeImageContent({ source, style, label, resizeMode = "cover" }: SafeImageProps) {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return (
      <View style={[style, styles.fallback]} accessibilityRole="image" accessibilityLabel={`${label}，图片加载失败`}>
        <JellyIcon kind="image" size={24} />
        <Text style={styles.text}>图片暂不可用</Text>
      </View>
    );
  }
  return <Image source={source} resizeMode={resizeMode} style={style} onError={() => setFailed(true)} accessibilityLabel={label} />;
}

const styles = StyleSheet.create({
  fallback: { alignItems: "center", justifyContent: "center", gap: spacing.xs, backgroundColor: colors.surfaceBlue },
  mark: { color: colors.brand, fontSize: 24, fontWeight: "900" },
  text: { ...typography.caption, color: colors.textSecondary }
});
