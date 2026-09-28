// Local pilot: only home and messages receive the new material treatment.
// Disable to keep the preceding visual treatment; "solid" disables backdrop blur.
export const UI_REFINEMENT: { enabled: boolean; material: "soft" | "solid" } = {
  enabled: true,
  material: "soft",
};
