import { readFile } from "node:fs/promises";
import path from "node:path";
import type { Browser } from "puppeteer";
import sharp from "sharp";
import { extractFontFamilies, wrapSlideHtml } from "./slide-html";
import { getInlinedFontCSS } from "./fonts";
import { DIMENSIONS, type AspectRatio, type Slide } from "@/types/carousel";
import { resolveUpload } from "./paths";

/**
 * Slides to PNG, at the exact pixel size Instagram wants.
 *
 * The document handed to the browser is made SELF-CONTAINED first — fonts and
 * images become data: URIs — so a render never depends on the network or on
 * the dev server still being up. Without that, an export can quietly come back
 * with a fallback typeface or an empty image box and still look like a success.
 */

const CONCURRENT_PAGES = 3;
/** Chromium leaks a little per page; recycle it rather than watch it grow. */
const PAGES_BEFORE_RESTART = 50;

const MIME_BY_EXT: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
};

/**
 * When the app runs inside its desktop shell this points at a small local
 * service backed by the Chromium that Electron already ships. Rendering there
 * instead of shipping a second copy of Chromium takes ~670 MB off the
 * installer. Running from source it is unset and Puppeteer does the work.
 */
const RENDER_SERVICE = process.env.FREECARRUSEL_RENDER_URL;

let chrome: Browser | null = null;
let rendersSinceLaunch = 0;

async function getBrowser(): Promise<Browser> {
  if (chrome && rendersSinceLaunch >= PAGES_BEFORE_RESTART) {
    await chrome.close().catch(() => {});
    chrome = null;
  }
  if (!chrome || !chrome.isConnected()) {
    // Imported lazily: a packaged build never reaches this path, so Puppeteer
    // does not need to be on disk at all.
    const puppeteer = (await import("puppeteer")).default;
    chrome = await puppeteer.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-gpu"],
    });
    rendersSinceLaunch = 0;
  }
  return chrome;
}

/** Replace every /uploads/... reference with the file's bytes. */
async function embedImages(html: string): Promise<string> {
  const referenced = new Set(
    [...html.matchAll(/(?:src=["']|url\(["']?)(\/uploads\/[^"'\s)]+)/g)].map(
      (m) => m[1]
    )
  );

  let out = html;
  for (const webPath of referenced) {
    try {
      const file = resolveUpload(webPath);
      if (!file) continue;
      const bytes = await readFile(file);
      const mime = MIME_BY_EXT[path.extname(webPath).toLowerCase()] ?? "image/png";
      out = out
        .split(webPath)
        .join(`data:${mime};base64,${bytes.toString("base64")}`);
    } catch {
      // Missing file: leave the path so the failure is visible in the PNG
      // rather than silently producing a blank area.
    }
  }
  return out;
}

export async function exportSlide(
  slide: Slide,
  aspectRatio: AspectRatio
): Promise<Buffer> {
  const { width, height } = DIMENSIONS[aspectRatio];

  const [fontCss, markup] = await Promise.all([
    getInlinedFontCSS(extractFontFamilies(slide.html)),
    embedImages(slide.html),
  ]);

  const html = wrapSlideHtml(markup, aspectRatio, { inlineFontCss: fontCss });

  const shot = RENDER_SERVICE
    ? await renderViaService(html, width, height)
    : await renderViaPuppeteer(html, width, height);

  // Normalise to sRGB: Instagram assumes it, and a wide-gamut screenshot comes
  // out visibly duller once uploaded.
  return await sharp(shot).toColorspace("srgb").png().toBuffer();
}

/**
 * Ask the desktop shell to paint the page and hand back the pixels. It renders
 * in the Chromium that Electron already ships, which is why the installer does
 * not carry a second copy of it.
 */
async function renderViaService(
  html: string,
  width: number,
  height: number
): Promise<Buffer> {
  const response = await fetch(RENDER_SERVICE as string, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      // Proves the request came from our own server, not from anything else
      // that happened to find the port.
      "X-Render-Token": process.env.FREECARRUSEL_RENDER_TOKEN ?? "",
    },
    body: JSON.stringify({ html, width, height }),
  });
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Renderer answered ${response.status}: ${detail}`);
  }
  return Buffer.from(await response.arrayBuffer());
}

async function renderViaPuppeteer(
  html: string,
  width: number,
  height: number
): Promise<Buffer> {
  const page = await (await getBrowser()).newPage();
  try {
    await page.setViewport({ width, height, deviceScaleFactor: 1 });
    await page.setContent(html, {
      waitUntil: "domcontentloaded",
      timeout: 15_000,
    });

    // Screenshotting before the faces are ready captures the fallback font.
    await page
      .waitForFunction(
        () =>
          document.fonts.ready.then(() =>
            [...document.fonts].every((face) => face.status === "loaded")
          ),
        { timeout: 10_000 }
      )
      .catch(() => {
        /* a slow font shouldn't block the whole export */
      });

    const shot = await page.screenshot({
      type: "png",
      clip: { x: 0, y: 0, width, height },
    });
    rendersSinceLaunch += 1;
    return Buffer.from(shot);
  } finally {
    await page.close().catch(() => {});
  }
}

export async function exportAllSlides(
  slides: Slide[],
  aspectRatio: AspectRatio,
  onProgress?: (done: number, total: number) => void
): Promise<{ name: string; buffer: Buffer }[]> {
  const files: { name: string; buffer: Buffer }[] = [];
  let done = 0;

  // A few pages at a time: one at a time is slow, all at once starves the
  // machine and the renders start timing out.
  for (let start = 0; start < slides.length; start += CONCURRENT_PAGES) {
    const batch = slides.slice(start, start + CONCURRENT_PAGES);
    const rendered = await Promise.all(
      batch.map(async (slide, offset) => {
        const buffer = await exportSlide(slide, aspectRatio);
        onProgress?.(++done, slides.length);
        return { name: `slide-${start + offset + 1}.png`, buffer };
      })
    );
    files.push(...rendered);
  }

  return files;
}
