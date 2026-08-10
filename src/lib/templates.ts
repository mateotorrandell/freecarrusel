import { readDataSafe, writeData } from "./data";
import { generateId, now } from "./utils";
import type { Carousel } from "@/types/carousel";
import type { Template, TemplatesData } from "@/types/template";

const FILE = "templates.json";
const EMPTY: TemplatesData = { templates: [] };

const load = () => readDataSafe<TemplatesData>(FILE, EMPTY);
const save = (data: TemplatesData) => writeData(FILE, data);

export async function listTemplates(): Promise<Template[]> {
  return (await load()).templates;
}

export async function getTemplate(id: string): Promise<Template | null> {
  return (await load()).templates.find((t) => t.id === id) ?? null;
}

/**
 * Freeze a carousel for reuse. The per-slide version history is deliberately
 * left behind: a template is a starting point, and carrying someone else's
 * undo stack into a new document only confuses the arrows.
 */
export async function saveAsTemplate(
  carousel: Carousel,
  name?: string,
  description?: string
): Promise<Template> {
  const data = await load();

  const template: Template = {
    id: generateId(),
    name: name?.trim() || carousel.name,
    description: description?.trim() || `Template from ${carousel.name}`,
    aspectRatio: carousel.aspectRatio,
    slides: carousel.slides.map((slide) => ({
      id: slide.id,
      html: slide.html,
      order: slide.order,
      notes: slide.notes,
    })),
    tags: [...carousel.tags],
    createdAt: now(),
  };

  data.templates.push(template);
  await save(data);
  return template;
}

export async function deleteTemplate(id: string): Promise<boolean> {
  const data = await load();
  const remaining = data.templates.filter((t) => t.id !== id);
  if (remaining.length === data.templates.length) return false;
  await save({ templates: remaining });
  return true;
}
