import { getCarousel, updateCarousel } from "@/lib/carousels";
import { guard, notFound, ok, readJson } from "@/lib/http";
import type { Carousel } from "@/types/carousel";

const asPayload = (c: Carousel) => ({
  caption: c.caption ?? "",
  hashtags: c.hashtags ?? [],
});

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const carousel = await getCarousel(id);
  return carousel ? ok(asPayload(carousel)) : notFound("Carousel not found");
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  return guard(async () => {
    const body = await readJson<{ caption?: string; hashtags?: string[] }>(request);

    const updated = await updateCarousel(id, {
      caption: body?.caption,
      // Normalise: the assistant sends them with and without the hash.
      hashtags: body?.hashtags?.map((tag) =>
        tag.startsWith("#") ? tag : `#${tag}`
      ),
    });

    return updated ? ok(asPayload(updated)) : notFound("Carousel not found");
  });
}
