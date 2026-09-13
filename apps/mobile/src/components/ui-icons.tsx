import { StyleSheet, View } from "react-native";
import { colors } from "@/theme/tokens";

type IconProps = {
  color?: string;
  size?: number;
};

export function ChevronLeftIcon({ color = colors.text, size = 20 }: IconProps) {
  const edge = Math.round(size * 0.52);
  return <View style={[styles.chevronLeft, { width: edge, height: edge, borderColor: color }]} />;
}

export function ChevronRightIcon({ color = colors.textSecondary, size = 20 }: IconProps) {
  const edge = Math.round(size * 0.52);
  return <View style={[styles.chevronRight, { width: edge, height: edge, borderColor: color }]} />;
}

export function TargetIcon({ color = colors.text, size = 24 }: IconProps) {
  return (
    <View style={[styles.targetOuter, { width: size, height: size, borderColor: color, borderRadius: size / 2 }]}>
      <View style={[styles.targetMiddle, { width: size * 0.52, height: size * 0.52, borderColor: color, borderRadius: size }]}>
        <View style={[styles.targetDot, { width: size * 0.17, height: size * 0.17, backgroundColor: color, borderRadius: size }]} />
      </View>
    </View>
  );
}

export function RefreshIcon({ color = colors.text, size = 22 }: IconProps) {
  return (
    <View style={[styles.refreshRing, { width: size, height: size, borderColor: color, borderRadius: size / 2 }]}>
      <View style={[styles.refreshHead, { borderBottomColor: color, borderRightColor: color }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  chevronLeft: {
    borderLeftWidth: 2.2,
    borderBottomWidth: 2.2,
    transform: [{ rotate: "45deg" }]
  },
  chevronRight: {
    borderRightWidth: 2.2,
    borderBottomWidth: 2.2,
    transform: [{ rotate: "-45deg" }]
  },
  targetOuter: { alignItems: "center", justifyContent: "center", borderWidth: 2 },
  targetMiddle: { alignItems: "center", justifyContent: "center", borderWidth: 2 },
  targetDot: {},
  refreshRing: { borderWidth: 2, borderRightColor: "transparent" },
  refreshHead: {
    position: "absolute",
    right: -1,
    top: -2,
    width: 7,
    height: 7,
    borderBottomWidth: 2,
    borderRightWidth: 2,
    transform: [{ rotate: "-18deg" }]
  }
});
