import { NextResponse } from "next/server";
import { extractBrand } from "@/lib/brand-extract";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 180;

/**
 * Read a site's brand by rendering it. Works on any URL — including JS apps
 * whose markup contains no logo, and sites that serve their assets from
 * another subdomain.
 */
export async function POST(request: Request) {
  let body: { url?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const raw = typeof body.url === "string" ? body.url.trim() : "";
  if (!raw) {
    return NextResponse.json({ error: "url is required" }, { status: 400 });
  }

  let url: URL;
  try {
    url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
  } catch {
    return NextResponse.json({ error: "url is not valid" }, { status: 400 });
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return NextResponse.json({ error: "only http(s) URLs" }, { status: 400 });
  }

  try {
    return NextResponse.json(await extractBrand(url.href));
  } catch (error) {
    console.error("[brand/extract] failed", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { error: `No se pudo leer el sitio: ${message}` },
      { status: 500 }
    );
  }
}
