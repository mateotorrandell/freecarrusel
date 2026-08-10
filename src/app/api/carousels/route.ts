import { createCarousel, listCarousels } from "@/lib/carousels";
import { badRequest, created, guard, ok, readJson, text } from "@/lib/http";
import { isAspectRatio, type AspectRatio } from "@/types/carousel";

const DEFAULT_RATIO: AspectRatio = "4:5";

export async function GET() {
  return ok({ carousels: await listCarousels() });
}

export async function POST(request: Request) {
  return guard(async () => {
    const body = await readJson<{ name?: string; aspectRatio?: string }>(request);
    const name = text(body?.name);
    if (!name) return badRequest("A name is required");

    // An unknown ratio falls back rather than failing: the value comes from a
    // picker with three options, and the portrait one is what people want.
    const ratio = isAspectRatio(body?.aspectRatio) ? body.aspectRatio : DEFAULT_RATIO;

    return created(await createCarousel(name, ratio));
  });
}
