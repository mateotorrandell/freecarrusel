/**
 * The typefaces offered in the brand panel and the properties panel.
 *
 * A short, opinionated list beats the full Google catalogue: every family here
 * has the weights a carousel needs (at least 400/700), reads at both 24px and
 * 120px, and covers Latin accents — the ones that silently drop tildes are the
 * reason this is curated instead of fetched.
 */

export type FontCategory =
  | "sans-serif"
  | "serif"
  | "display"
  | "handwriting"
  | "monospace";

export interface FontOption {
  name: string;
  category: FontCategory;
}

const BY_CATEGORY: Record<FontCategory, string[]> = {
  "sans-serif": [
    "Inter",
    "Montserrat",
    "Poppins",
    "Roboto",
    "Open Sans",
    "Lato",
    "Oswald",
    "Raleway",
    "Nunito",
    "Ubuntu",
    "Rubik",
    "Work Sans",
    "DM Sans",
    "Space Grotesk",
    "Outfit",
    "Sora",
    "Manrope",
    "Plus Jakarta Sans",
    "Bebas Neue",
    "Anton",
  ],
  "serif": [
    "Playfair Display",
    "Merriweather",
    "Cormorant Garamond",
    "Libre Baskerville",
    "Lora",
    "EB Garamond",
    "Crimson Text",
    "Source Serif Pro",
    "DM Serif Display",
    "Bitter",
    "Vollkorn",
  ],
  "display": [
    "Abril Fatface",
  ],
  "handwriting": [
    "Caveat",
    "Dancing Script",
    "Pacifico",
    "Satisfy",
    "Great Vibes",
  ],
  "monospace": [
    "JetBrains Mono",
    "Fira Code",
    "Space Mono",
  ],
};

/** Flat list, grouped by category in the order designers usually scan. */
export const FONT_CATALOG: FontOption[] = (
  Object.keys(BY_CATEGORY) as FontCategory[]
).flatMap((category) =>
  BY_CATEGORY[category].map((name) => ({ name, category }))
);

export const DEFAULT_FONT = "Inter";
