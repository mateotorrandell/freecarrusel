import { readDataSafe, writeData } from "./data";
import { generateId, now } from "./utils";
import type { StylePreset, StylePresetsData } from "@/types/style-preset";

const FILE = "style-presets.json";
const EMPTY: StylePresetsData = { presets: [] };

const load = () => readDataSafe<StylePresetsData>(FILE, EMPTY);
const save = (data: StylePresetsData) => writeData(FILE, data);

export async function listPresets(): Promise<StylePreset[]> {
  return (await load()).presets;
}

export async function getPreset(id: string): Promise<StylePreset | null> {
  return (await load()).presets.find((p) => p.id === id) ?? null;
}

export async function createPreset(
  input: Omit<StylePreset, "id" | "createdAt">
): Promise<StylePreset> {
  const data = await load();
  const preset: StylePreset = { ...input, id: generateId(), createdAt: now() };
  data.presets.push(preset);
  await save(data);
  return preset;
}

export async function deletePreset(id: string): Promise<boolean> {
  const data = await load();
  const remaining = data.presets.filter((p) => p.id !== id);
  if (remaining.length === data.presets.length) return false;
  await save({ presets: remaining });
  return true;
}
