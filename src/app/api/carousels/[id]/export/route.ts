import archiver from "archiver";
import { getCarousel } from "@/lib/carousels";
import { exportAllSlides } from "@/lib/export-slides";
import { badRequest, notFound, serverError } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/** Rendering ten slides in headless Chromium takes a while. */
export const maxDuration = 120;

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const carousel = await getCarousel(id);
  if (!carousel) return notFound("Carousel not found");
  if (carousel.slides.length === 0) return badRequest("This carousel has no slides");

  try {
    const files = await exportAllSlides(carousel.slides, carousel.aspectRatio);
    const zip = await bundle(files);

    return new Response(new Uint8Array(zip), {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${downloadName(carousel.name)}"`,
      },
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    return serverError(`Export failed: ${detail}`);
  }
}

/** Collect the archive in memory: the response needs its full length anyway. */
function bundle(files: { name: string; buffer: Buffer }[]): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const archive = archiver("zip", { zlib: { level: 5 } });
    const chunks: Buffer[] = [];

    archive.on("data", (chunk: Buffer) => chunks.push(chunk));
    archive.on("end", () => resolve(Buffer.concat(chunks)));
    archive.on("error", reject);

    for (const file of files) archive.append(file.buffer, { name: file.name });
    archive.finalize().catch(reject);
  });
}

/** Keep the carousel's name, minus anything a filesystem would object to. */
function downloadName(name: string): string {
  const safe = name.trim().replace(/[^\p{L}\p{N}\-_ ]+/gu, "").replace(/\s+/g, "-");
  return `${safe || "carousel"}.zip`;
}
