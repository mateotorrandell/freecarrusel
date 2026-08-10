import { NextResponse } from "next/server";
import { spawn } from "child_process";
import path from "path";
import { generateId } from "@/lib/utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// The first call downloads the ONNX model (~40MB); later ones are quicker.
export const maxDuration = 300;

import { UPLOAD_DIR } from "@/lib/paths";

/**
 * Cut the subject out of an already-uploaded image, saving a transparent PNG.
 * Everything runs on this machine — no image leaves it.
 *
 * The work happens in a CHILD PROCESS (scripts/remove-bg.mjs). Running the model
 * inline blocked the server's event loop for minutes: the whole app froze and
 * the AI agent's own API calls timed out mid-carousel.
 */
export async function POST(request: Request) {
  let body: { url?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const url = typeof body.url === "string" ? body.url : "";
  // Only accept paths this app produced: no traversal, no arbitrary reads.
  if (!/^\/uploads\/[A-Za-z0-9-]+\.(png|jpe?g|webp)$/i.test(url)) {
    return NextResponse.json(
      { error: "url must be an /uploads/... path from this app" },
      { status: 400 }
    );
  }

  const source = path.join(UPLOAD_DIR, path.basename(url));
  const id = generateId();
  const outPath = path.join(UPLOAD_DIR, `${id}.png`);

  const result = await new Promise<{ ok: boolean; detail: string }>((resolve) => {
    const child = spawn(
      process.execPath,
      [path.join(process.cwd(), "scripts", "remove-bg.mjs"), source, outPath],
      { cwd: process.cwd(), stdio: ["ignore", "ignore", "pipe"] }
    );

    let stderr = "";
    child.stderr?.on("data", (c: Buffer) => {
      stderr = (stderr + c.toString()).slice(-2000);
    });

    const timer = setTimeout(() => {
      child.kill();
      resolve({ ok: false, detail: "timed out" });
    }, 240_000);

    child.on("error", (e) => {
      clearTimeout(timer);
      resolve({ ok: false, detail: e.message });
    });
    child.on("exit", (code) => {
      clearTimeout(timer);
      resolve({ ok: code === 0, detail: stderr.trim() || `exit ${code}` });
    });
  });

  if (!result.ok) {
    console.error("[remove-background] failed", result.detail);
    return NextResponse.json(
      { error: `Background removal failed: ${result.detail}` },
      { status: 500 }
    );
  }

  return NextResponse.json({ id, url: `/uploads/${id}.png` });
}
