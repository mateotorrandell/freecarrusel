import path from "node:path";
import {
  addReferenceImage,
  getCarousel,
  removeReferenceImage,
} from "@/lib/carousels";
import {
  badRequest,
  created,
  guard,
  noContent,
  notFound,
  ok,
  readJson,
  text,
} from "@/lib/http";
import { generateId, now } from "@/lib/utils";

const UPLOADS = "/uploads/";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const carousel = await getCarousel(id);
  return carousel
    ? ok({ references: carousel.referenceImages ?? [] })
    : notFound("Carousel not found");
}

/**
 * Attach an already-uploaded image to a carousel.
 *
 * The URL is restricted to /uploads/ and rejected if it contains any traversal:
 * the assistant calls this route, and `absPath` is handed straight back to it
 * as a file to open. Without the guard, a crafted url would turn this into a
 * "read me any file on the machine" endpoint.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  return guard(async () => {
    const body = await readJson<{ url?: string; name?: string }>(request);
    const url = text(body?.url);

    if (!url || !url.startsWith(UPLOADS) || url.includes("..")) {
      return badRequest(`url must be a path under ${UPLOADS}`);
    }

    const publicDir = path.resolve(process.cwd(), "public");
    const absPath = path.resolve(publicDir, `.${url}`);
    if (!absPath.startsWith(publicDir)) {
      return badRequest("url resolves outside the uploads folder");
    }

    const carousel = await addReferenceImage(id, {
      id: generateId(),
      url,
      absPath,
      name: text(body?.name) ?? path.basename(url),
      addedAt: now(),
    });

    return carousel ? created(carousel) : notFound("Carousel not found");
  });
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  return guard(async () => {
    const imageId = new URL(request.url).searchParams.get("imageId");
    if (!imageId) return badRequest("imageId is required");

    const removed = await removeReferenceImage(id, imageId);
    return removed ? noContent() : notFound("Image not found");
  });
}
