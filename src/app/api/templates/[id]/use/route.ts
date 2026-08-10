import { addSlide, createCarousel } from "@/lib/carousels";
import { created, guard, notFound } from "@/lib/http";
import { getTemplate } from "@/lib/templates";

/** Start a new carousel from a saved template. */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  return guard(async () => {
    const template = await getTemplate(id);
    if (!template) return notFound("Template not found");

    const carousel = await createCarousel(template.name, template.aspectRatio);

    // Sequentially: addSlide appends by position, so racing them would shuffle
    // the deck.
    for (const slide of [...template.slides].sort((a, b) => a.order - b.order)) {
      await addSlide(carousel.id, slide.html, slide.notes);
    }

    return created(await refresh(carousel.id));
  });
}

async function refresh(id: string) {
  const { getCarousel } = await import("@/lib/carousels");
  return (await getCarousel(id))!;
}
