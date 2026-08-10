import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { resolveUpload } from "@/lib/paths";
import { notFound } from "@/lib/http";

/**
 * Serve uploaded images.
 *
 * Running from source these files sit in `public/uploads` and Next's static
 * handler answers first, so this route never runs. Installed as a desktop app
 * the uploads live in the user's data folder — outside anything Next serves
 * statically — and this is what makes `/uploads/…` keep working. Slides and
 * exports reference that path, so it has to resolve identically either way.
 */

export const dynamic = "force-dynamic";

const MIME: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".woff2": "font/woff2",
  ".woff": "font/woff",
};

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ file: string[] }> }
) {
  const { file } = await params;
  // resolveUpload refuses anything that climbs out of the uploads folder.
  const target = resolveUpload(`/uploads/${file.map(encodeURIComponent).join("/")}`);
  if (!target) return notFound("File not found");

  try {
    const info = await stat(target);
    if (!info.isFile()) return notFound("File not found");

    const stream = Readable.toWeb(
      createReadStream(target)
    ) as unknown as ReadableStream;

    return new Response(stream, {
      headers: {
        "Content-Type": MIME[path.extname(target).toLowerCase()] ?? "application/octet-stream",
        "Content-Length": String(info.size),
        // Names are random ids, so a file never changes under a given URL.
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  } catch {
    return notFound("File not found");
  }
}
