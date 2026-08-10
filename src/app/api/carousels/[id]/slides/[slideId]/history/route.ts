import { NextResponse } from "next/server";
import { initHistory, syncHistory } from "@/lib/edit-history";
import { getCarousel } from "@/lib/carousels";
import { sanitizeSlideHtml } from "@/lib/sanitize-slide";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string; slideId: string }> };

/** Current stack for a slide — the editor loads this when it opens. */
export async function GET(_request: Request, { params }: Params) {
  const { id, slideId } = await params;
  const carousel = await getCarousel(id);
  const slide = carousel?.slides.find((s) => s.id === slideId);
  if (!slide) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Seed from the slide's current HTML so the first undo has a destination.
  const history = await initHistory(id, slideId, slide.html);
  return NextResponse.json(history);
}

/**
 * Replace the stored stack with the editor's. The client is the source of
 * truth: it observes every discrete edit, the server only sees debounced saves.
 */
export async function PUT(request: Request, { params }: Params) {
  const { id, slideId } = await params;
  let body: { items?: unknown; index?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (
    !Array.isArray(body.items) ||
    !body.items.every((i) => typeof i === "string") ||
    typeof body.index !== "number"
  ) {
    return NextResponse.json(
      { error: "items (string[]) and index (number) are required" },
      { status: 400 }
    );
  }

  const stored = await syncHistory(id, slideId, {
    items: (body.items as string[]).map(sanitizeSlideHtml),
    index: body.index,
  });
  return NextResponse.json(stored);
}
