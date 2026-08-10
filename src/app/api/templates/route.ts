import { getCarousel } from "@/lib/carousels";
import { badRequest, created, guard, notFound, ok, readJson, text } from "@/lib/http";
import { listTemplates, saveAsTemplate } from "@/lib/templates";

export async function GET() {
  return ok({ templates: await listTemplates() });
}

export async function POST(request: Request) {
  return guard(async () => {
    const body = await readJson<{
      carouselId?: string;
      name?: string;
      description?: string;
    }>(request);

    const carouselId = text(body?.carouselId);
    if (!carouselId) return badRequest("carouselId is required");

    const carousel = await getCarousel(carouselId);
    if (!carousel) return notFound("Carousel not found");

    return created(
      await saveAsTemplate(carousel, body?.name, body?.description)
    );
  });
}
