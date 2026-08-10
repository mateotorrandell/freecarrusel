/**
 * The shape of a carousel on disk.
 *
 * Slides are stored as body-level HTML, never as a scene graph: the canvas
 * editor, the preview and the PNG export all read the same markup, so there is
 * no model to keep in sync with what you see.
 */

export type AspectRatio = "1:1" | "4:5" | "9:16";

/** Pixel size Instagram expects for each ratio. */
export const DIMENSIONS: Record<AspectRatio, { width: number; height: number }> = {
  "1:1": { width: 1080, height: 1080 },
  "4:5": { width: 1080, height: 1350 },
  "9:16": { width: 1080, height: 1920 },
};

export const ASPECT_RATIOS = Object.keys(DIMENSIONS) as AspectRatio[];

export function isAspectRatio(value: unknown): value is AspectRatio {
  return typeof value === "string" && value in DIMENSIONS;
}

/** Instagram's own ceiling for a carousel post. */
export const MAX_SLIDES = 20;

/** How many previous versions of a slide are kept for the per-slide undo. */
export const MAX_VERSIONS = 5;

export interface Slide {
  id: string;
  /** Body-level markup. No <html>, <head> or <script>. */
  html: string;
  /** Newest last. Trimmed to MAX_VERSIONS on every write. */
  previousVersions: string[];
  /** Position in the carousel, zero based. */
  order: number;
  /** Free-form note the assistant leaves about what the slide is for. */
  notes: string;
}

export interface ReferenceImage {
  id: string;
  /** Web path used inside slide markup, e.g. "/uploads/abc.png". */
  url: string;
  /** Absolute path, so the assistant can open the file and look at it. */
  absPath: string;
  /** Original filename, or a description when the assistant fetched it. */
  name: string;
  addedAt: string;
}

export interface Carousel {
  id: string;
  name: string;
  aspectRatio: AspectRatio;
  slides: Slide[];
  referenceImages: ReferenceImage[];
  caption?: string;
  hashtags?: string[];
  /** Lets a conversation resume where it left off. */
  chatSessionId: string | null;
  isTemplate: boolean;
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

/** Root of data/carousels.json. */
export interface CarouselsData {
  carousels: Carousel[];
}
