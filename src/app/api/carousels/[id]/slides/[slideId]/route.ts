import { NextResponse } from "next/server";
import { updateSlide, deleteSlide } from "@/lib/carousels";
import { sanitizeSlideHtml } from "@/lib/sanitize-slide";

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string; slideId: string }> }
) {
  const { id, slideId } = await params;
  try {
    const body = await request.json();
    if (typeof body.html === "string") {
      body.html = sanitizeSlideHtml(body.html);
    }

    // Optimistic concurrency. The editor and the AI agent both write slides,
    // and the editor's save is debounced — so a snapshot taken before the agent
    // rewrote the slide could land afterwards and silently undo its work (this
    // is exactly how a Pikachu and a grid layer disappeared). The caller says
    // which version it was editing; if the stored one moved on, we refuse and
    // hand back what's there now.
    const { expectedHtml, ...patch } = body as {
      expectedHtml?: string;
      html?: string;
    };

    const slide = await updateSlide(id, slideId, patch, expectedHtml);
    if (!slide) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    if ("conflict" in slide) {
      return NextResponse.json(
        { error: "Stale edit", html: slide.conflict.html },
        { status: 409 }
      );
    }
    return NextResponse.json(slide);
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string; slideId: string }> }
) {
  const { id, slideId } = await params;
  const deleted = await deleteSlide(id, slideId);
  if (!deleted) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json({ success: true });
}
