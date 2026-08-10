#!/usr/bin/env node
// Cut the subject out of an image. Run as a SEPARATE process on purpose.
//
// The model is heavy CPU work and blocks whatever event loop it runs on. Doing
// it inside the Next dev server froze the whole app for minutes — every other
// request, including the AI agent's own curl calls, timed out. Isolating it
// here keeps the server responsive and means a crash in the native runtime
// can't take the app down with it.
//
// Usage: node scripts/remove-bg.mjs <input> <output>

import { readFile, writeFile } from "node:fs/promises";
import { removeBackground } from "@imgly/background-removal-node";

const [, , input, output] = process.argv;
if (!input || !output) {
  console.error("usage: remove-bg.mjs <input> <output>");
  process.exit(2);
}

try {
  const buf = await readFile(input);
  const blob = await removeBackground(
    new Blob([new Uint8Array(buf)], { type: "image/png" })
  );
  await writeFile(output, Buffer.from(await blob.arrayBuffer()));
  process.exit(0);
} catch (err) {
  console.error(err?.message ?? String(err));
  process.exit(1);
}
