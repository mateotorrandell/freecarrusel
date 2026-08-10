import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

/**
 * Google Fonts CSS with every woff2 turned into a data: URI.
 *
 * The PNG export renders in a headless browser that we want to behave the same
 * on every machine and with no network at all. A stylesheet that still points
 * at fonts.gstatic.com exports fine on a good connection and silently falls
 * back to a system font on a bad one — same slide, different typeface. Inlining
 * removes the variable.
 *
 * Two caches, because fetching a family costs a second or two: an in-process
 * map for the current server, and a folder under data/ so a restart doesn't pay
 * for it again.
 */

const CACHE_DIR = path.resolve(process.cwd(), "data", ".font-cache");
const WEIGHTS = "300;400;500;600;700;800";
// Google serves woff2 only to browsers it recognises.
const MODERN_BROWSER =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

const memory = new Map<string, string>();

const cacheFile = (family: string) =>
  path.join(CACHE_DIR, `${family.replace(/\s+/g, "-")}.css`);

export async function getInlinedFontCSS(families: string[]): Promise<string> {
  const wanted = [...new Set(families.filter(Boolean))];
  if (wanted.length === 0) return "";

  const sheets = await Promise.all(wanted.map(resolveFamily));
  return sheets.filter(Boolean).join("\n");
}

async function resolveFamily(family: string): Promise<string> {
  const cached = await readCache(family);
  if (cached) return cached;

  try {
    const css = await downloadAndInline(family);
    if (!css) return "";
    await writeCache(family, css);
    return css;
  } catch {
    // An unknown family is not an error worth failing an export over; the
    // slide falls back to whatever the system offers.
    return "";
  }
}

async function readCache(family: string): Promise<string | null> {
  const inMemory = memory.get(family);
  if (inMemory) return inMemory;

  try {
    const css = await readFile(cacheFile(family), "utf-8");
    memory.set(family, css);
    return css;
  } catch {
    return null;
  }
}

async function writeCache(family: string, css: string): Promise<void> {
  memory.set(family, css);
  try {
    await mkdir(CACHE_DIR, { recursive: true });
    await writeFile(cacheFile(family), css, "utf-8");
  } catch {
    // A read-only disk still works, it just re-downloads next time.
  }
}

async function downloadAndInline(family: string): Promise<string | null> {
  const url =
    `https://fonts.googleapis.com/css2?family=${encodeURIComponent(family)}` +
    `:wght@${WEIGHTS}&display=block`;

  const response = await fetch(url, { headers: { "User-Agent": MODERN_BROWSER } });
  if (!response.ok) return null;

  let css = await response.text();
  const links = [
    ...new Set(
      [...css.matchAll(/url\((https:\/\/fonts\.gstatic\.com\/[^)]+\.woff2)\)/g)].map(
        (m) => m[1]
      )
    ),
  ];

  const embedded = await Promise.all(
    links.map(async (link) => {
      try {
        const file = await fetch(link);
        if (!file.ok) return null;
        const base64 = Buffer.from(await file.arrayBuffer()).toString("base64");
        return [link, `data:font/woff2;base64,${base64}`] as const;
      } catch {
        return null; // leave the URL alone; a networked render still finds it
      }
    })
  );

  for (const pair of embedded) {
    if (pair) css = css.split(pair[0]).join(pair[1]);
  }

  // `swap` shows a fallback face first, which a screenshot can catch mid-swap.
  return css.replace(/font-display:\s*swap/g, "font-display: block");
}
