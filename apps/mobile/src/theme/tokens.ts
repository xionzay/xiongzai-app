import type { ImageStyle, TextStyle, ViewStyle } from "react-native";

export const colors = {
  brand: "#278FE8",
  brandDeep: "#155E9F",
  accent: "#FF5A24",
  accentSoft: "#FFF0E8",
  lime: "#CBEA2B",
  violet: "#7D62F2",
  surface: "#FFF9EF",
  surfaceCard: "#FFFFFF",
  surfaceBlue: "#EAF6FF",
  text: "#181A1F",
  textSecondary: "#666B75",
  border: "#E8E2D8",
  success: "#2BA471",
  warning: "#F59E0B",
  danger: "#E5484D",
  disabled: "#B7BAC1",
  white: "#FFFFFF"
} as const;

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;
export const radii = { sm: 10, md: 14, lg: 18, xl: 24, pill: 999 } as const;
export const typography = {
  caption: { fontSize: 12, lineHeight: 17 } satisfies TextStyle,
  body: { fontSize: 15, lineHeight: 22 } satisfies TextStyle,
  cardTitle: { fontSize: 17, lineHeight: 22, fontWeight: "700" } satisfies TextStyle,
  sectionTitle: { fontSize: 19, lineHeight: 25, fontWeight: "700" } satisfies TextStyle,
  pageTitle: { fontSize: 26, lineHeight: 32, fontWeight: "800" } satisfies TextStyle
} as const;

export const shadows = {
  card: {
    shadowColor: "#4B3920",
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 3
  } satisfies ViewStyle | ImageStyle
};
