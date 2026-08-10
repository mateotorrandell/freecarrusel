import { duplicateCarousel } from "@/lib/carousels";
import { created, guard, notFound } from "@/lib/http";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  return guard(async () => {
    const copy = await duplicateCarousel(id);
    return copy ? created(copy) : notFound("Carousel not found");
  });
}
