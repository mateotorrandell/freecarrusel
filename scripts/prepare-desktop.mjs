#!/usr/bin/env node
// Build the app and lay out the folder the desktop shell will run.
//
// `next build` with output: "standalone" emits a server plus only the modules
// it traced. Two things it deliberately leaves out, because a normal deployment
// serves them from a CDN, have to be copied in by hand or the app starts with
// no styles and no images:
//
//   .next/static  →  standalone/.next/static
//   public        →  standalone/public
//
// Anything not needed at runtime is stripped afterwards, so the installer
// doesn't carry the source tree and the screenshots around.

import { cp, rm, stat, readdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const ROOT = process.cwd();
const STANDALONE = path.join(ROOT, ".next", "standalone");

const run = (command, args) => {
  const result = spawnSync(command, args, {
    stdio: "inherit",
    shell: process.platform === "win32",
    cwd: ROOT,
  });
  if (result.status !== 0) process.exit(result.status ?? 1);
};

async function sizeOf(dir) {
  let total = 0;
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    total += entry.isDirectory() ? await sizeOf(full) : (await stat(full)).size;
  }
  return total;
}

console.log("\n› building the app\n");
run("npx", ["next", "build"]);

if (!existsSync(STANDALONE)) {
  console.error("\nNo standalone output. Is `output: \"standalone\"` still in next.config.ts?\n");
  process.exit(1);
}

console.log("\n› assembling the runtime folder");
await cp(path.join(ROOT, ".next", "static"), path.join(STANDALONE, ".next", "static"), {
  recursive: true,
});
if (existsSync(path.join(ROOT, "public"))) {
  await cp(path.join(ROOT, "public"), path.join(STANDALONE, "public"), {
    recursive: true,
  });
}

// Things the standalone tracer copies that the running app never reads.
for (const junk of [
  "src",
  "docs",
  "scripts",
  "data",
  "build",
  "desktop",
  // Previous desktop builds. The tracer walks the project folder, so without
  // this the runtime ends up carrying the last installer inside itself.
  "dist-desktop",
  "README.md",
  "CLAUDE.md",
  "AGENTS.md",
  "LICENSE",
  "tsconfig.json",
  "tsconfig.tsbuildinfo",
  "eslint.config.mjs",
  "postcss.config.mjs",
  "electron-builder.yml",
  path.join("public", "uploads"),
  // Traced in but never executed: the compiler, and Puppeteer's own browser
  // machinery — the desktop build renders with the Chromium Electron ships.
  path.join("node_modules", "typescript"),
  path.join("node_modules", "puppeteer"),
  path.join("node_modules", "puppeteer-core"),
  path.join("node_modules", "@puppeteer"),
]) {
  await rm(path.join(STANDALONE, junk), { recursive: true, force: true });
}

// The shell loads the runtime from beside itself, and that folder is what goes
// into the asar. It cannot travel as an "extra resource": electron-builder
// skips anything called node_modules there, and the app would install with a
// server but none of its dependencies — "Cannot find module 'next'".
const RUNTIME = path.join(ROOT, "desktop", "runtime");
await rm(RUNTIME, { recursive: true, force: true });
// dereference: the standalone output links the external packages instead of
// copying them, and Windows refuses to create symlinks without elevation.
// Following them also means the installed app carries real files, not links
// into a node_modules folder that will not exist on the user's machine.
await cp(STANDALONE, RUNTIME, { recursive: true, dereference: true });

const mb = Math.round((await sizeOf(RUNTIME)) / 1024 / 1024);
console.log(`› runtime ready at desktop/runtime — ${mb} MB\n`);
