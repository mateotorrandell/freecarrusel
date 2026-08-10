import puppeteer from "puppeteer";
import sharp from "sharp";
import { writeFile, mkdir } from "fs/promises";
import path from "path";
import { generateId } from "./utils";

const UPLOAD_DIR = path.resolve(process.cwd(), "public/uploads");

export interface ExtractedBrand {
  url: string;
  name: string;
  colors: string[];
  fonts: { heading: string; body: string };
  logoUrl: string | null;
  logoSource: "asset" | "rendered" | null;
  images: { url: string; width: number; height: number }[];
  notes: string[];
}

/** rgb()/rgba() → #rrggbb, dropping anything effectively transparent. */
function toHex(v: string): string | null {
  const m = v?.match(/rgba?\(([^)]+)\)/);
  if (!m) return null;
  const p = m[1].split(",").map((x) => parseFloat(x.trim()));
  if (p.length > 3 && p[3] < 0.4) return null;
  return (
    "#" +
    p
      .slice(0, 3)
      .map((n) => Math.round(n).toString(16).padStart(2, "0"))
      .join("")
  );
}

async function saveImage(buf: Buffer, max = 1600): Promise<string> {
  await mkdir(UPLOAD_DIR, { recursive: true });
  const id = generateId();
  const png = await sharp(buf, { density: 384 })
    .resize(max, max, { fit: "inside", withoutEnlargement: true })
    .png()
    .toBuffer();
  await writeFile(path.join(UPLOAD_DIR, `${id}.png`), png);
  return `/uploads/${id}.png`;
}

/**
 * Read a site's identity the way a person would: render it, then look at what
 * is actually painted.
 *
 * Grepping the HTML source doesn't generalise — most sites are JS apps whose
 * markup contains none of this, their logo often lives on another subdomain,
 * and `favicon.png` is a cropped monogram rather than the brand mark. Rendering
 * sidesteps all of that: the header logo is simply the image drawn in the top
 * strip, and the palette is the colours the browser computed.
 */
export async function extractBrand(url: string): Promise<ExtractedBrand> {
  const notes: string[] = [];
  const browser = await puppeteer.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 900 });
    await page.goto(url, { waitUntil: "networkidle2", timeout: 60_000 });
    // Give client-rendered headers a beat to paint.
    await new Promise((r) => setTimeout(r, 2500));

    const data = await page.evaluate(() => {
      const abs = (u: string | null) =>
        u ? new URL(u, location.href).href : null;

      // --- name -------------------------------------------------------------
      const meta = (p: string) =>
        document
          .querySelector(`meta[property="${p}"], meta[name="${p}"]`)
          ?.getAttribute("content") || "";
      const name =
        meta("og:site_name") ||
        meta("application-name") ||
        document.title.split(/[|—–·]/)[0].split(" - ")[0].trim() ||
        document.querySelector("h1")?.textContent?.trim().slice(0, 40) ||
        location.hostname;

      // --- logo: score what the browser paints in the header ---------------
      // Geometry alone isn't enough: some marks are tiny icons, and the
      // strongest signal is that a logo is the image inside the link home.
      const logos: {
        kind: "img" | "svg";
        src: string | null;
        alt: string;
        x: number; y: number; w: number; h: number;
        selectorIndex: number;
        score: number;
      }[] = [];
      const host = location.hostname.replace(/^www\./, "").split(".")[0];
      const all = [...document.querySelectorAll("img, svg")];
      all.forEach((el, i) => {
        const r = el.getBoundingClientRect();
        if (r.top > 260 || r.width < 24 || r.height < 10) return;
        if (r.width > 600 || r.height > 200) return; // hero art, not a logo

        let score = 0;
        // Inside the link back home — the classic logo slot.
        const link = el.closest("a");
        const href = link?.getAttribute("href") || "";
        if (link && (href === "/" || href === "" || href === location.origin + "/")) score += 60;
        if (el.closest("header, nav, [role='banner']")) score += 40;

        const text = (
          (el.getAttribute("alt") || "") + " " +
          (el.getAttribute("aria-label") || "") + " " +
          (el.getAttribute("src") || "") + " " +
          (link?.getAttribute("aria-label") || "")
        ).toLowerCase();
        if (/logo|isotipo|brand|wordmark/.test(text)) score += 50;
        if (host && text.includes(host)) score += 40;

        // Closer to the top-left corner is more logo-like.
        score += Math.max(0, 40 - r.left / 12);
        score += Math.max(0, 30 - r.top / 4);
        // A wordmark is wider than tall; square favicons score lower.
        if (r.width / Math.max(r.height, 1) > 1.6) score += 15;

        logos.push({
          kind: el.tagName.toLowerCase() === "svg" ? "svg" : "img",
          src: abs(el.getAttribute("src")),
          alt: el.getAttribute("alt") || "",
          x: Math.round(r.left), y: Math.round(r.top),
          w: Math.round(r.width), h: Math.round(r.height),
          selectorIndex: i,
          score: Math.round(score),
        });
      });
      logos.sort((a, b) => b.score - a.score);

      // --- palette: count the colours the browser actually painted ----------
      const tally = new Map<string, number>();
      const bump = (c: string, weight: number) => {
        if (!c) return;
        tally.set(c, (tally.get(c) || 0) + weight);
      };
      for (const el of [...document.querySelectorAll("*")].slice(0, 4000)) {
        const r = el.getBoundingClientRect();
        if (r.width < 8 || r.height < 8) continue;
        const cs = getComputedStyle(el);
        const area = Math.min(r.width * r.height, 400_000);
        bump(cs.backgroundColor, area / 1000);
        // Buttons and links carry the accent far more reliably than big fills.
        const tag = el.tagName.toLowerCase();
        if (tag === "button" || tag === "a")
          bump(cs.backgroundColor, 400);
        if (parseFloat(cs.fontSize) > 20) bump(cs.color, 30);
      }
      const colors = [...tally.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 14)
        .map(([c]) => c);

      // --- fonts ------------------------------------------------------------
      const fam = (sel: string) => {
        const el = document.querySelector(sel);
        return el
          ? getComputedStyle(el).fontFamily.split(",")[0].replace(/["']/g, "").trim()
          : "";
      };
      const fonts = {
        heading: fam("h1") || fam("h2") || fam("body"),
        body: fam("p") || fam("body"),
      };

      // --- content images ---------------------------------------------------
      const images = [...document.querySelectorAll("img")]
        .map((el) => {
          const im = el as HTMLImageElement;
          return { url: abs(im.getAttribute("src")), w: im.naturalWidth, h: im.naturalHeight };
        })
        .filter((i): i is { url: string; w: number; h: number } =>
          !!i.url && i.w >= 500 && i.h >= 300
        )
        .slice(0, 12);

      return { name, logos, colors, fonts, images };
    });

    // --- fetch the logo ------------------------------------------------------
    let logoUrl: string | null = null;
    let logoSource: ExtractedBrand["logoSource"] = null;
    const best = data.logos[0];

    if (best) {
      if (best.kind === "img" && best.src) {
        try {
          const res = await fetch(best.src);
          if (res.ok) {
            logoUrl = await saveImage(Buffer.from(await res.arrayBuffer()));
            logoSource = "asset";
          }
        } catch {
          notes.push("no se pudo descargar el archivo del logo");
        }
      }
      // Inline <svg> logos (very common in React apps) have no file to fetch,
      // so we screenshot the node itself with a transparent background.
      if (!logoUrl) {
        try {
          const handle = (await page.$$("img, svg"))[best.selectorIndex];
          if (handle) {
            const shot = (await handle.screenshot({ omitBackground: true })) as Buffer;
            logoUrl = await saveImage(Buffer.from(shot), 800);
            logoSource = "rendered";
          }
        } catch {
          notes.push("no se pudo capturar el nodo del logo");
        }
      }
    } else {
      notes.push("no se encontró ningún logo en la franja del encabezado");
    }

    // --- download the content images -----------------------------------------
    const images: ExtractedBrand["images"] = [];
    for (const img of data.images.slice(0, 8)) {
      try {
        const res = await fetch(img.url);
        if (!res.ok) continue;
        images.push({
          url: await saveImage(Buffer.from(await res.arrayBuffer())),
          width: img.w,
          height: img.h,
        });
      } catch {
        // skip the ones that refuse to serve us
      }
    }

    const hex = data.colors
      .map(toHex)
      .filter((c): c is string => !!c)
      .filter((c, i, a) => a.indexOf(c) === i)
      .slice(0, 8);

    return {
      url,
      name: data.name,
      colors: hex,
      fonts: data.fonts,
      logoUrl,
      logoSource,
      images,
      notes,
    };
  } finally {
    await browser.close();
  }
}
