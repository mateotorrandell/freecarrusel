/**
 * The visual identity every slide inherits.
 *
 * This is injected into the assistant's instructions, so filling it in once is
 * what stops the AI from reaching for generic template colours.
 */

/** The five roles a colour can play in a slide. */
export interface BrandColors {
  /** Headlines and body copy. */
  primary: string;
  /** Secondary copy, captions, muted detail. */
  secondary: string;
  /** The one colour that draws the eye: CTAs, highlighted words. */
  accent: string;
  /** The canvas behind everything. */
  background: string;
  /** Cards, chips and panels sitting on the background. */
  surface: string;
}

export interface BrandFonts {
  heading: string;
  body: string;
}

/** A font file the user uploaded instead of picking from Google Fonts. */
export interface CustomFont {
  name: string;
  path: string;
}

export interface BrandConfig {
  name: string;
  colors: BrandColors;
  fonts: BrandFonts;
  customFonts: CustomFont[];
  logoPath: string | null;
  /** Words that describe the look: "editorial", "warm", "brutalist". */
  styleKeywords: string[];
  createdAt: string;
  updatedAt: string;
}

/**
 * Neutral starting point. Deliberately colourless — a brand that looks
 * unconfigured is a prompt to configure it, whereas an opinionated default
 * quietly ends up in someone's published carousel.
 */
export const DEFAULT_BRAND: BrandConfig = {
  name: "",
  colors: {
    primary: "#111111",
    secondary: "#6b7280",
    accent: "#f97316",
    background: "#ffffff",
    surface: "#f4f4f5",
  },
  fonts: {
    heading: "Inter",
    body: "Inter",
  },
  customFonts: [],
  logoPath: null,
  styleKeywords: [],
  createdAt: "",
  updatedAt: "",
};

/** True once the user has told us anything about their identity. */
export function isBrandConfigured(brand: BrandConfig): boolean {
  return brand.name.trim().length > 0;
}
