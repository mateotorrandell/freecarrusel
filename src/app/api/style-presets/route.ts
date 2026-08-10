import { badRequest, created, guard, ok, readJson, text } from "@/lib/http";
import { createPreset, listPresets } from "@/lib/style-presets";
import { DEFAULT_BRAND, type BrandConfig } from "@/types/brand";
import { isAspectRatio } from "@/types/carousel";
import type { StylePreset } from "@/types/style-preset";

export async function GET() {
  return ok({ presets: await listPresets() });
}

export async function POST(request: Request) {
  return guard(async () => {
    const body = await readJson<Partial<StylePreset> & { brand?: BrandConfig }>(
      request
    );

    const name = text(body?.name);
    const designRules = text(body?.designRules);
    if (!name || !designRules) {
      return badRequest("Both name and designRules are required");
    }

    return created(
      await createPreset({
        name,
        description: body?.description ?? "",
        brand: body?.brand ?? DEFAULT_BRAND,
        designRules,
        exampleSlideHtml: body?.exampleSlideHtml ?? "",
        aspectRatio: isAspectRatio(body?.aspectRatio) ? body.aspectRatio : "4:5",
        tags: body?.tags ?? [],
      })
    );
  });
}
