/**
 * AUTO-GENERATED — DO NOT EDIT BY HAND.
 *
 * Design tokens derived from the vc-frontend source so our layout audits measure
 * against the REAL design system instead of a hand-transcribed copy that goes stale
 * at the next redesign.
 *
 * Source:      https://github.com/VirtoCommerce/vc-frontend
 * Ref:         dev
 * Tailwind:    3.4.19 (vc-frontend declares "^3.4.19")
 * Regenerate:  npm run tokens:sync
 * Drift-guard: npm run tokens:check   (CI gate)
 */

/** Tailwind's default `theme.spacing`, read from the pinned tailwindcss version. */
export const TAILWIND_DEFAULT_SPACING_PX: readonly number[] = [
  1, 0, 2, 4, 6, 8, 10, 12, 14, 16, 20, 24, 28, 32, 36, 40, 44, 48, 56, 64, 80, 96, 112, 128, 144, 160, 176, 192, 208, 224, 240, 256, 288, 320, 384,
] as const;

/** `theme.extend.spacing` from vc-frontend's tailwind.config.ts, in px. */
export const EXTEND_SPACING_PX: readonly number[] = [
  18, 68, 72, 76,
] as const; // keys: 4.5, 17, 18, 19

/**
 * Every computed padding/margin/gap value the design system can legitimately produce
 * (default scale ∪ project additions). This IS the BL-UI-002 grid — do not narrow it.
 */
export const SPACING_GRID_PX: readonly number[] = [
  0, 1, 2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 24, 28, 32, 36, 40, 44, 48, 56, 64, 68, 72, 76, 80, 96, 112, 128, 144, 160, 176, 192, 208, 224, 240, 256, 288, 320, 384,
] as const;

/** Real responsive breakpoints from the ui-kit (NOT Tailwind defaults — 2xl is 1500, not 1536). */
export const BREAKPOINTS_PX = {
  xs: 480,
  sm: 640,
  md: 768,
  lg: 1024,
  xl: 1280,
  "2xl": 1500,
} as const;

/**
 * Control sizes the UI kit actually ships (vc-button `--size`), in px.
 * Use to sanity-check a touch-target finding: a control matching one of these is a
 * deliberate design-system size, not an accidental regression.
 */
export const UI_KIT_BUTTON_SIZES_PX = {
  xxs: 26,
  xs: 32,
  sm: 38,
  md: 44,
  lg: 52,
} as const;

/** Viewports worth sweeping: each breakpoint edge, just below it, and the fluid midpoints. */
export const AUDIT_VIEWPORTS_PX: readonly number[] = [
  375, 479, 480, 560, 639, 640, 704, 767, 768, 896, 1023, 1024, 1152, 1279, 1280, 1390, 1499, 1500, 1920,
] as const;
