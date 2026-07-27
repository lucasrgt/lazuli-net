// DESIGN TOKENS — this app's values for the Skies design taxonomy (docs/DESIGN-CONVENTIONS.md).
// Names are the convention, protected by the design band (SKYFE024-026); values are YOURS — edit the
// values freely (brand, dark mode, white-label), never the names. Raw colors (hex) live ONLY here
// (SKYFE012 exempts this file by name); everything else references the semantic `color.*` roles.

export type SpaceToken = "none" | "xs" | "sm" | "md" | "lg" | "xl" | "2xl";
export type RadiusToken = "none" | "sm" | "md" | "lg" | "full";
export type TextRole = "display" | "title" | "heading" | "body" | "label" | "caption";
export type ShadowToken = "none" | "raised" | "overlay";
export type MotionToken = "instant" | "fast" | "base" | "slow";
export type ColorRole =
  | "bg" | "surface" | "surfaceRaised" | "border" | "borderStrong"
  | "text" | "textMuted" | "textInverse"
  | "primary" | "primaryHover" | "primaryActive" | "onPrimary"
  | "danger" | "dangerHover" | "onDanger" | "dangerSurface"
  | "success" | "successSurface" | "warning" | "warningSurface"
  | "focusRing" | "scrim";

export interface TextStyle {
  fontSize: number;
  lineHeight: number;
  fontWeight: 400 | 500 | 600 | 700;
}

/** Spacing — a 4px grid. Rhythm comes from the scale; there is no eighth step. */
export const space: Record<SpaceToken, number> = { none: 0, xs: 4, sm: 8, md: 12, lg: 16, xl: 24, "2xl": 32 };

/** Corner radii. `full` is the pill/circle. */
export const radius: Record<RadiusToken, number> = { none: 0, sm: 4, md: 8, lg: 12, full: 9999 };

/** Type — a 1.25 modular scale from 16. A role carries size + line-height + weight together. */
export const text: Record<TextRole, TextStyle> = {
  caption: { fontSize: 12, lineHeight: 16, fontWeight: 400 },
  label: { fontSize: 14, lineHeight: 20, fontWeight: 500 },
  body: { fontSize: 16, lineHeight: 24, fontWeight: 400 },
  heading: { fontSize: 20, lineHeight: 28, fontWeight: 600 },
  title: { fontSize: 25, lineHeight: 32, fontWeight: 600 },
  display: { fontSize: 31, lineHeight: 40, fontWeight: 700 },
};

/** Elevation levels — web box-shadow strings; a RN impl maps these to `elevation`. */
export const shadow: Record<ShadowToken, string> = {
  none: "none",
  raised: "0 1px 3px rgba(0,0,0,0.12)",
  overlay: "0 8px 24px rgba(0,0,0,0.16)",
};

/** Motion durations (ms). Timing is a system decision, not per-component creativity. */
export const motionMs: Record<MotionToken, number> = { instant: 0, fast: 100, base: 200, slow: 300 };

/** Layout breakpoints (px, min-width). Compact-first; layout shifts only at these. */
export const breakpoints = { compact: 0, regular: 768, wide: 1200 } as const;

/** The semantic themes — same role names, swapped values. Dark shipping proves the semantic layer. */
export const themes: { light: Record<ColorRole, string>; dark: Record<ColorRole, string> } = {
  light: {
    bg: "#f8fafc",
    surface: "#ffffff",
    surfaceRaised: "#ffffff",
    border: "#e2e8f0",
    borderStrong: "#cbd5e1",
    text: "#0f172a",
    textMuted: "#64748b",
    textInverse: "#ffffff",
    primary: "#2563eb",
    primaryHover: "#1d4ed8",
    primaryActive: "#1e40af",
    onPrimary: "#ffffff",
    danger: "#dc2626",
    dangerHover: "#b91c1c",
    onDanger: "#ffffff",
    dangerSurface: "#fef2f2",
    success: "#16a34a",
    successSurface: "#f0fdf4",
    warning: "#d97706",
    warningSurface: "#fffbeb",
    focusRing: "#2563eb",
    scrim: "rgba(15, 23, 42, 0.5)",
  },
  dark: {
    bg: "#0b1220",
    surface: "#111a2c",
    surfaceRaised: "#16213a",
    border: "#243049",
    borderStrong: "#334766",
    text: "#e6edf7",
    textMuted: "#94a3b8",
    textInverse: "#0f172a",
    primary: "#3b82f6",
    primaryHover: "#60a5fa",
    primaryActive: "#2563eb",
    onPrimary: "#0b1220",
    danger: "#ef4444",
    dangerHover: "#f87171",
    onDanger: "#0b1220",
    dangerSurface: "#2a1416",
    success: "#22c55e",
    successSurface: "#11251a",
    warning: "#f59e0b",
    warningSurface: "#2a2012",
    focusRing: "#60a5fa",
    scrim: "rgba(0, 0, 0, 0.6)",
  },
};

/** The default binding. Components read `color.<role>`; a theme switch rebinds values, never names. */
export const color: Record<ColorRole, string> = themes.light;
