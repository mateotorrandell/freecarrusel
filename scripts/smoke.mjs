#!/usr/bin/env node
// End-to-end smoke suite. Drives the running dev server the way a person does:
// real HTTP against every route, then a real browser with real mouse and
// keyboard on the editor.
//
// Synthetic DOM events were the reason a whole class of layout bugs went
// unnoticed here — a toolbar that appeared on selection pushed the canvas down
// and every later click landed in the wrong place, which dispatchEvent could
// never reproduce. So the browser half uses page.mouse and page.keyboard only.
//
// Usage:  npm run smoke        (needs `npm run dev` running on :3000)

import puppeteer from "puppeteer";

const BASE = process.env.SMOKE_BASE_URL ?? "http://localhost:3000";
const pass = [];
const fail = [];

const check = (name, ok, detail = "") => {
  (ok ? pass : fail).push(detail ? `${name} — ${detail}` : name);
  process.stdout.write(ok ? "." : "x");
};

const api = async (path, init) => {
  const res = await fetch(`${BASE}${path}`, init);
  let body = null;
  try {
    body = await res.json();
  } catch {
    /* empty body is fine */
  }
  return { status: res.status, body };
};

/** Any 2xx is a success; the creation routes answer 201, the rest 200. */
const ok = (status) => status >= 200 && status < 300;

const json = (method, payload) => ({
  method,
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(payload),
});

const SLIDE = `<div style="width:1080px;height:1350px;position:relative;overflow:hidden;">
  <div data-label="fondo" style="position:absolute;inset:0;background:#0c0c0d;"></div>
  <div data-label="trama" style="position:absolute;inset:0;pointer-events:none;background-image:linear-gradient(rgba(255,255,255,0.08) 1px,transparent 1px);background-size:80px 80px;"></div>
  <div data-label="velo" style="position:absolute;inset:0;pointer-events:none;background-image:linear-gradient(180deg,rgba(0,0,0,0) 40%,rgba(0,0,0,0.8) 100%);background-repeat:no-repeat;background-size:cover;"></div>
  <div data-label="volanta" style="position:absolute;left:88px;top:88px;font-family:Inter,sans-serif;font-size:24px;color:#f97316;">SMOKE TEST</div>
  <div data-label="titular" style="position:absolute;left:88px;top:520px;width:904px;font-family:Inter,sans-serif;font-size:92px;font-weight:800;color:#ffffff;">Primera <span style="color:#f97316">linea</span><br>y segunda.</div>
</div>`;

// ---------------------------------------------------------------- API layer

async function apiSuite() {
  const created = await api("/api/carousels", json("POST", { name: "smoke", aspectRatio: "4:5" }));
  check("crear carrusel", ok(created.status) && !!created.body?.id);
  const id = created.body?.id;
  if (!id) return null;

  const slide = await api(`/api/carousels/${id}/slides`, json("POST", { html: SLIDE }));
  check("agregar slide", ok(slide.status) && !!slide.body?.id);
  const slideId = slide.body?.id;

  const edited = await api(
    `/api/carousels/${id}/slides/${slideId}`,
    json("PUT", { html: SLIDE.replace("Primera", "Editada") })
  );
  check("editar slide", edited.status === 200);

  // Optimistic concurrency: a save made against an old version must be refused
  // rather than quietly undoing whatever landed in between.
  const stale = await api(
    `/api/carousels/${id}/slides/${slideId}`,
    json("PUT", { html: SLIDE, expectedHtml: SLIDE })
  );
  check("rechaza guardado desactualizado", stale.status === 409);

  const fresh = await api(`/api/carousels/${id}`);
  const currentHtml = fresh.body?.slides?.[0]?.html;
  const fine = await api(
    `/api/carousels/${id}/slides/${slideId}`,
    json("PUT", { html: currentHtml.replace("Editada", "AlDia"), expectedHtml: currentHtml })
  );
  check("acepta guardado al dia", fine.status === 200);

  const undone = await api(`/api/carousels/${id}/slides/${slideId}/undo`, { method: "POST" });
  check("deshacer version de slide", undone.status === 200);

  const hist = await api(
    `/api/carousels/${id}/slides/${slideId}/history`,
    json("PUT", { items: ["<i>a</i>", "<i>b</i>"], index: 1 })
  );
  const histBack = await api(`/api/carousels/${id}/slides/${slideId}/history`);
  check(
    "historial de edicion persiste",
    hist.status === 200 && histBack.body?.index === 1 && histBack.body?.items?.length === 2
  );

  const second = await api(`/api/carousels/${id}/slides`, json("POST", { html: SLIDE }));
  const reorder = await api(
    `/api/carousels/${id}/slides`,
    json("PUT", { slideIds: [second.body.id, slideId] })
  );
  check("reordenar slides", reorder.status === 200 && reorder.body?.slides?.[0]?.id === second.body.id);

  const caption = await api(
    `/api/carousels/${id}/caption`,
    json("PUT", { caption: "hola", hashtags: ["#uno", "#dos"] })
  );
  check("caption y hashtags", caption.status === 200);

  const dup = await api(`/api/carousels/${id}/duplicate`, { method: "POST" });
  check("duplicar carrusel", ok(dup.status) && dup.body?.slides?.length === 2);

  const tpl = await api("/api/templates", json("POST", { carouselId: id }));
  check("guardar plantilla", ok(tpl.status) && !!tpl.body?.id);
  if (tpl.body?.id) {
    const used = await api(`/api/templates/${tpl.body.id}/use`, { method: "POST" });
    check("usar plantilla", ok(used.status) && !!used.body?.id);
    if (used.body?.id) await api(`/api/carousels/${used.body.id}`, { method: "DELETE" });
    await api(`/api/templates/${tpl.body.id}`, { method: "DELETE" });
  }

  const ratio = await api(`/api/carousels/${id}`, json("PUT", { aspectRatio: "9:16" }));
  check("cambiar formato", ratio.status === 200 && ratio.body?.aspectRatio === "9:16");
  await api(`/api/carousels/${id}`, json("PUT", { aspectRatio: "4:5" }));

  const brand = await api("/api/brand");
  check("leer marca", brand.status === 200 && typeof brand.body?.name === "string");

  const settings = await api("/api/settings");
  check("leer ajustes", settings.status === 200 && !!settings.body?.language);

  const fonts = await api("/api/fonts");
  check("catalogo de fuentes", fonts.status === 200 && (fonts.body?.fonts?.length ?? 0) > 0);

  const cli = await api("/api/chat/check");
  check("CLI detectado", cli.status === 200 && cli.body?.available === true);

  // Rejecting bad uploads matters more than accepting good ones.
  const bad = new FormData();
  bad.append("file", new Blob(["<script>alert(1)</script>"], { type: "text/html" }), "x.html");
  const badUp = await fetch(`${BASE}/api/upload`, { method: "POST", body: bad });
  check("rechaza archivo no permitido", badUp.status >= 400);

  await api(`/api/carousels/${dup.body.id}`, { method: "DELETE" });
  return id;
}

async function exportSuite(id) {
  const res = await fetch(`${BASE}/api/carousels/${id}/export`, { method: "POST" });
  const buf = Buffer.from(await res.arrayBuffer());
  // A ZIP always starts with "PK".
  check(
    "exportar PNG (zip)",
    res.status === 200 && buf.length > 1000 && buf[0] === 0x50 && buf[1] === 0x4b,
    `HTTP ${res.status}, ${buf.length} bytes`
  );
}

// ------------------------------------------------------------ browser layer

async function browserSuite(id) {
  const browser = await puppeteer.launch({ headless: "new", args: ["--no-sandbox"] });
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.setViewport({ width: 1600, height: 900 });

  await page.goto(`${BASE}/`, { waitUntil: "networkidle2" });
  await wait(1500);
  check(
    "el inicio carga",
    await page.evaluate(
      () =>
        !!document.querySelector("textarea") &&
        [...document.querySelectorAll("button")].some((b) =>
          /Nuevo carrusel|New carousel/.test(b.getAttribute("aria-label") || b.textContent)
        )
    )
  );

  await page.goto(`${BASE}/carousel/${id}`, { waitUntil: "networkidle2" });
  await wait(2500);

  const frames = await page.$$("iframe");
  let canvasEl = null;
  let box = null;
  for (const h of frames) {
    const bb = await h.boundingBox();
    if (bb && (!box || bb.width > box.width)) {
      box = bb;
      canvasEl = h;
    }
  }
  const frame = await canvasEl.contentFrame();
  const inner = await frame.evaluate(() => window.innerWidth);
  const scale = box.width / inner;
  const toPage = (x, y) => ({ x: box.x + x * scale, y: box.y + y * scale });
  const rectOf = (label) =>
    frame.evaluate((l) => {
      const el = document.querySelector(`[data-label="${l}"]`);
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { x: r.x, y: r.y, w: r.width, h: r.height };
    }, label);
  const clickTab = async (text) => {
    const h = await page.evaluateHandle(
      (t) => [...document.querySelectorAll("button")].find((b) => b.textContent.trim().startsWith(t)),
      text
    );
    const el = h.asElement();
    if (!el) return false;
    const bb = await el.boundingBox();
    await page.mouse.click(bb.x + bb.width / 2, bb.y + bb.height / 2);
    await wait(500);
    return true;
  };
  const clickLayer = async (name) => {
    const h = await page.evaluateHandle(
      (n) => [...document.querySelectorAll("button")].find((b) => b.textContent.trim() === n),
      name
    );
    const el = h.asElement();
    if (!el) return false;
    const bb = await el.boundingBox();
    await page.mouse.click(bb.x + 30, bb.y + bb.height / 2);
    await wait(500);
    return true;
  };
  const panelText = () =>
    page.evaluate(() => document.querySelectorAll("aside")[0].parentElement.innerText.replace(/\n+/g, "|"));

  // --- selection and direct manipulation
  const before = await rectOf("volanta");
  let from = toPage(before.x + before.w / 2, before.y + before.h / 2);
  let to = toPage(before.x + before.w / 2 + 150, before.y + before.h / 2 + 220);
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 16 });
  await page.mouse.up();
  await wait(600);
  const moved = await rectOf("volanta");
  check("arrastrar mueve el elemento", Math.abs(moved.x - before.x) > 100 && Math.abs(moved.y - before.y) > 150);

  const h0 = await rectOf("titular");
  await page.mouse.click(toPage(h0.x + 20, h0.y + 20).x, toPage(h0.x + 20, h0.y + 20).y);
  await wait(400);
  const grip = toPage(h0.x + h0.w, h0.y + h0.h / 2);
  await page.mouse.move(grip.x, grip.y);
  await page.mouse.down();
  await page.mouse.move(grip.x - 160, grip.y, { steps: 16 });
  await page.mouse.up();
  await wait(600);
  const h1 = await rectOf("titular");
  check("redimensionar ancla el borde opuesto", Math.abs(h1.x - h0.x) <= 2 && h1.w < h0.w - 100);

  // --- text: double click, partial selection, formatting on the selection only
  await page.mouse.click(toPage(h1.x + 40, h1.y + 30).x, toPage(h1.x + 40, h1.y + 30).y, { clickCount: 2 });
  await wait(1400); // outside the triple-click window
  const line = { x: h1.x, y: h1.y + h1.h * 0.2, w: h1.w };
  await page.mouse.move(toPage(line.x + 10, line.y).x, toPage(line.x + 10, line.y).y);
  await page.mouse.down();
  await page.mouse.move(toPage(line.x + line.w * 0.3, line.y).x, toPage(line.x + line.w * 0.3, line.y).y, { steps: 14 });
  await page.mouse.up();
  await wait(500);
  const runText = await frame.evaluate(() => String(getSelection()));
  check("se puede marcar parte del texto", runText.length > 2 && runText.length < 40, JSON.stringify(runText));

  const blockStyleBefore = await frame.evaluate(
    () => document.querySelector('[data-label="titular"]').getAttribute("style")
  );
  await page.evaluate(() => {
    const row = document.querySelector("button[aria-pressed]").closest("div");
    const input = row.querySelector('input[type="color"]');
    input.value = "#00a3ff";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await wait(800);
  const afterHtml = await frame.evaluate(
    () => document.querySelector('[data-label="titular"]').outerHTML
  );
  const blockStyleAfter = await frame.evaluate(
    () => document.querySelector('[data-label="titular"]').getAttribute("style")
  );
  check("el color pinta solo la seleccion", afterHtml.includes("rgb(0, 163, 255)"));
  check("el bloque no cambia de color", blockStyleBefore === blockStyleAfter);

  const toggles = await page.$$("button[aria-pressed]");
  const bb = await toggles[1].boundingBox();
  await page.mouse.click(bb.x + bb.width / 2, bb.y + bb.height / 2);
  await wait(700);
  check(
    "cursiva se aplica a la seleccion",
    /font-style: italic/.test(
      await frame.evaluate(() => document.querySelector('[data-label="titular"]').outerHTML)
    )
  );

  // --- panels adapt to the kind of element
  await clickTab("Capas");
  const order = await page.evaluate(() =>
    [...document.querySelectorAll("aside")[0].parentElement.querySelectorAll("button")]
      .map((b) => b.textContent.trim())
      .filter((t) => ["fondo", "trama", "velo", "volanta"].includes(t))
  );
  check(
    "las capas van de adelante hacia atras",
    order.indexOf("fondo") === order.length - 1 && order.indexOf("volanta") < order.indexOf("velo"),
    order.join(">")
  );

  await clickLayer("trama");
  await clickTab("Editar");
  let panel = await panelText();
  check("un patron no ofrece tipografia", !/Tipograf/.test(panel));
  check("un patron ofrece color del patron", /Color del patr/.test(panel));

  await clickTab("Capas");
  await clickLayer("velo");
  await clickTab("Editar");
  panel = await panelText();
  check("un degradado ofrece su propio color", /Color del degradado/.test(panel));
  const gradBefore = await frame.evaluate(
    () => getComputedStyle(document.querySelector('[data-label="velo"]')).backgroundImage
  );
  await page.evaluate(() => {
    const input = document.querySelector('input[type="color"]');
    input.value = "#1d3fb2";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await wait(700);
  const gradAfter = await frame.evaluate(
    () => getComputedStyle(document.querySelector('[data-label="velo"]')).backgroundImage
  );
  check(
    "recolorear mantiene el degradado",
    gradAfter.includes("gradient") &&
      gradAfter.includes("29, 63, 178") &&
      alphas(gradBefore).join() === alphas(gradAfter).join(),
    alphas(gradAfter).join()
  );

  await clickTab("Capas");
  await clickLayer("Fondo");
  await clickTab("Editar");
  panel = await panelText();
  check("el marco de la slide no ofrece opacidad", !/Opacidad/.test(panel));
  check("el marco de la slide no ofrece color de texto", !/Color de texto/.test(panel));

  // --- hide, restack and delete from the layer list
  await clickTab("Capas");
  await clickLayer("trama");
  const eye = await page.evaluateHandle(() => {
    const row = [...document.querySelectorAll("button")].find((b) => b.textContent.trim() === "trama");
    return [...row.parentElement.querySelectorAll("button")].find((b) =>
      /Ocultar|Hide/.test(b.getAttribute("aria-label") || "")
    );
  });
  const eb = await eye.asElement().boundingBox();
  await page.mouse.click(eb.x + eb.width / 2, eb.y + eb.height / 2);
  await wait(700);
  const hidden = await frame.evaluate(() => {
    const el = document.querySelector('[data-label="trama"]');
    return { exists: !!el, display: el?.style.display };
  });
  check("el ojo oculta sin borrar", hidden.exists && hidden.display === "none");
  check(
    "la capa oculta sigue en la lista",
    await page.evaluate(() => [...document.querySelectorAll("button")].some((b) => b.textContent.trim() === "trama"))
  );
  await page.mouse.click(eb.x + eb.width / 2, eb.y + eb.height / 2);
  await wait(600);

  const domBefore = await frame.evaluate(() =>
    [...document.body.firstElementChild.children].map((e) => e.getAttribute("data-label")).join(">")
  );
  const src = await rowOf(page, "trama");
  const dst = await rowOf(page, "volanta");
  await page.mouse.move(src.x + 80, src.y + src.height / 2);
  await page.mouse.down();
  await page.mouse.move(dst.x + 80, dst.y + 3, { steps: 20 });
  await wait(200);
  await page.mouse.up();
  await wait(800);
  const domAfter = await frame.evaluate(() =>
    [...document.body.firstElementChild.children].map((e) => e.getAttribute("data-label")).join(">")
  );
  check("arrastrar capas cambia el orden", domBefore !== domAfter, `${domBefore} => ${domAfter}`);

  const trash = await page.evaluateHandle(() => {
    const row = [...document.querySelectorAll("button")].find((b) => b.textContent.trim() === "trama");
    return [...row.parentElement.querySelectorAll("button")].pop();
  });
  const tb = await trash.asElement().boundingBox();
  await page.mouse.click(tb.x + tb.width / 2, tb.y + tb.height / 2);
  await wait(800);
  check(
    "se puede borrar una capa",
    !(await frame.evaluate(() => !!document.querySelector('[data-label="trama"]')))
  );

  check("sin errores de JavaScript", errors.length === 0, errors.slice(0, 2).join(" | "));
  await browser.close();
}

async function rowOf(page, name) {
  const handle = await page.evaluateHandle(
    (n) => [...document.querySelectorAll("button")].find((b) => b.textContent.trim() === n)?.parentElement,
    name
  );
  return handle.asElement().boundingBox();
}

const alphas = (image) =>
  (image.match(/rgba?\([^)]+\)/g) || []).map((s) => {
    const parts = s.replace(/rgba?\(|\)/g, "").split(",");
    return parts.length > 3 ? parts[3].trim() : "1";
  });

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// ----------------------------------------------------------------- runner

console.log(`\nfreecarrusel smoke suite → ${BASE}\n`);

let carouselId = null;
try {
  const ping = await fetch(BASE).catch(() => null);
  if (!ping?.ok) {
    console.error(`\nEl servidor no responde en ${BASE}. Levantalo con \`npm run dev\`.\n`);
    process.exit(2);
  }
  carouselId = await apiSuite();
  if (carouselId) {
    await exportSuite(carouselId);
    await browserSuite(carouselId);
  }
} catch (err) {
  fail.push(`la suite se corto: ${err.message}`);
} finally {
  if (carouselId) await api(`/api/carousels/${carouselId}`, { method: "DELETE" });
}

console.log(`\n\n${pass.length} ok, ${fail.length} fallan\n`);
for (const p of pass) console.log(`  ok    ${p}`);
for (const f of fail) console.log(`  FALLA ${f}`);
console.log("");
process.exit(fail.length === 0 ? 0 : 1);
