import type { AspectRatio, Slide } from "./carousel";

/**
 * A carousel frozen for reuse. Version history is dropped on the way in — a
 * template is a starting point, not a document with a past.
 */
export interface Template {
  id: string;
  name: string;
  description: string;
  aspectRatio: AspectRatio;
  slides: TemplateSlide[];
  tags: string[];
  createdAt: string;
}

export type TemplateSlide = Omit<Slide, "previousVersions">;

/** Root of data/templates.json. */
export interface TemplatesData {
  templates: Template[];
}
