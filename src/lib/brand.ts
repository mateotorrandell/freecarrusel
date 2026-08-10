import { readDataSafe, writeData } from "./data";
import { now } from "./utils";
import { DEFAULT_BRAND, type BrandConfig } from "@/types/brand";

const FILE = "brand.json";

export async function getBrand(): Promise<BrandConfig> {
  return readDataSafe<BrandConfig>(FILE, DEFAULT_BRAND);
}

/**
 * Patch the brand. Colours and fonts merge field by field, so sending only
 * `{ colors: { accent } }` doesn't wipe the other four — the panel saves one
 * control at a time and would otherwise erase the rest on every keystroke.
 */
export async function updateBrand(
  patch: Partial<Omit<BrandConfig, "createdAt" | "updatedAt">>
): Promise<BrandConfig> {
  const current = await getBrand();
  const stamp = now();

  const next: BrandConfig = {
    ...current,
    ...patch,
    colors: { ...current.colors, ...patch.colors },
    fonts: { ...current.fonts, ...patch.fonts },
    createdAt: current.createdAt || stamp,
    updatedAt: stamp,
  };

  await writeData(FILE, next);
  return next;
}

export { isBrandConfigured } from "@/types/brand";
