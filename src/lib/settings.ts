import { readDataSafe, writeData } from "./data";
import { now } from "./utils";
import type { AppSettings, Language } from "@/types/settings";
import { DEFAULT_SETTINGS } from "@/types/settings";

const FILE = "settings.json";

export async function getSettings(): Promise<AppSettings> {
  const stored = await readDataSafe<Partial<AppSettings>>(FILE, {});
  return { ...DEFAULT_SETTINGS, ...stored };
}

export async function updateSettings(
  updates: Partial<Pick<AppSettings, "language">>
): Promise<AppSettings> {
  const current = await getSettings();
  const next: AppSettings = { ...current, ...updates, updatedAt: now() };
  await writeData(FILE, next);
  return next;
}

export function isLanguage(value: unknown): value is Language {
  return value === "es" || value === "en";
}
