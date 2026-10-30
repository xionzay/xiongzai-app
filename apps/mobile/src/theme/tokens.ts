import type { ImageStyle, TextStyle, ViewStyle } from "react-native";

export const colors = {
  brand: "#087BF5",
  brandDeep: "#0864CE",
  accent: "#087BF5",
  accentSoft: "#E4F3FF",
  lime: "#FFEA72",
  violet: "#527BD3",
  surface: "#F2FAFF",
  surfaceCard: "#FFFFFF",
  surfaceBlue: "#EAF6FF",
  text: "#102653",
  textSecondary: "#536B87",
  border: "#CCE4F5",
  canvas: "#D9F3FF",
  input: "rgba(204,234,255,0.60)",
  summary: "rgba(185,221,250,0.33)",
  divider: "rgba(102,138,171,0.19)",
  controlBorder: "rgba(98,143,186,0.50)",
  dialog: "#DCEFFC",
  dock: "#D9EDF8",
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
    shadowColor: "#326BA5",
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 3
  } satisfies ViewStyle | ImageStyle
};
