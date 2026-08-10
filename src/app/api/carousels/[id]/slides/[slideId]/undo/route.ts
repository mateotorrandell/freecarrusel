import { undoSlide } from "@/lib/carousels";
import { guard, notFound, ok } from "@/lib/http";

/** Roll a slide back one version. Fails when there is nothing behind it. */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string; slideId: string }> }
) {
  const { id, slideId } = await params;
  return guard(async () => {
    const slide = await undoSlide(id, slideId);
    return slide ? ok(slide) : notFound("No earlier version for this slide");
  });
}
