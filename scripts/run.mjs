#!/usr/bin/env node
// Start freecarrusel the way a user should experience it: double-click, a
// browser opens, and it keeps running.
//
// This is deliberately NOT `next dev`. The dev server recompiles on every
// request, holds far more memory, and falls over in ways a production build
// does not — which is what makes a local app feel fragile. Here the app is
// built once and served, and if the server ever dies it comes straight back.
//
// It also carries out updates. The app cannot rebuild itself while it is the
// thing being rebuilt, so /api/update writes a marker and stops the server;
// this supervisor sees the marker, pulls, installs, rebuilds, and starts again.

import { spawn, spawnSync } from "node:child_process";
import { existsSync, rmSync } from "node:fs";
import net from "node:net";
import path from "node:path";
import readline from "node:readline";

const ROOT = process.cwd();
const UPDATE_MARKER = path.join(ROOT, ".update-requested");
const WINDOWS = process.platform === "win32";

const say = (message) => console.log(message);

function run(command, args, options = {}) {
  return spawnSync(command, args, {
    stdio: "inherit",
    shell: WINDOWS,
    cwd: ROOT,
    ...options,
  });
}

function freePort(preferred) {
  return new Promise((resolve) => {
    const probe = net.createServer();
    probe.once("error", () => resolve(0)); // taken; let Next pick another
    probe.once("listening", () => probe.close(() => resolve(preferred)));
    probe.listen(preferred, "127.0.0.1");
  });
}

function openBrowser(url) {
  const [command, args] = WINDOWS
    ? ["cmd", ["/c", "start", "", url]]
    : process.platform === "darwin"
      ? ["open", [url]]
      : ["xdg-open", [url]];
  spawn(command, args, { detached: true, stdio: "ignore" }).unref();
}

async function waitUntilUp(url, timeoutMs = 90_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url, { method: "HEAD" });
      if (res.status < 500) return true;
    } catch {
      /* still starting */
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  return false;
}

// ------------------------------------------------------------------ updates

function isGitCheckout() {
  return existsSync(path.join(ROOT, ".git"));
}

function applyUpdate() {
  say("\n› updating freecarrusel\n");

  if (!isGitCheckout()) {
    say("  This copy was not installed with git, so it cannot update itself.");
    say("  Download the latest version from the project page and replace it.\n");
    return false;
  }

  const dirty = spawnSync("git", ["status", "--porcelain"], {
    cwd: ROOT,
    encoding: "utf-8",
  }).stdout?.trim();
  if (dirty) {
    // Someone has been editing the code. Overwriting that without asking would
    // be the worst thing this script could do.
    say(`  You have local changes (${dirty}), so nothing was touched.`);
    say("  Commit or stash them and try again.\n");
    return false;
  }

  if (run("git", ["pull", "--ff-only"]).status !== 0) {
    say("\n  git pull failed — leaving the current version in place.\n");
    return false;
  }
  if (run("npm", ["install"]).status !== 0) {
    say("\n  npm install failed — leaving the current version in place.\n");
    return false;
  }
  if (run("npm", ["run", "build"]).status !== 0) {
    say("\n  The build failed — leaving the current version in place.\n");
    return false;
  }

  say("\n› updated\n");
  return true;
}

// -------------------------------------------------------------------- serve

let child = null;
let stopping = false;

function serve(port) {
  child = spawn("npx", ["next", "start", "--port", String(port), "--hostname", "127.0.0.1"], {
    cwd: ROOT,
    shell: WINDOWS,
    stdio: "inherit",
    env: { ...process.env, NODE_ENV: "production" },
  });
  return child;
}

async function main() {
  if (!existsSync(path.join(ROOT, ".next", "BUILD_ID"))) {
    say("\n› first run: building the app (this takes a minute)\n");
    if (run("npm", ["run", "build"]).status !== 0) {
      say("\nThe build failed. Run `npm run doctor` to check your setup.\n");
      process.exit(1);
    }
  }

  const port = (await freePort(Number(process.env.PORT) || 3000)) || 3210;
  const url = `http://127.0.0.1:${port}`;
  let opened = false;

  // Ctrl+C and window-close should take the server with them.
  for (const signal of ["SIGINT", "SIGTERM"]) {
    process.on(signal, () => {
      stopping = true;
      child?.kill();
      process.exit(0);
    });
  }
  if (WINDOWS) {
    readline
      .createInterface({ input: process.stdin, output: process.stdout })
      .on("SIGINT", () => process.emit("SIGINT"));
  }

  while (!stopping) {
    serve(port);

    if (!opened) {
      if (await waitUntilUp(url)) {
        say(`\n  freecarrusel is running at ${url}\n  Close this window to stop it.\n`);
        openBrowser(url);
        opened = true;
      }
    }

    const code = await new Promise((resolve) => child.on("exit", resolve));
    if (stopping) break;

    if (existsSync(UPDATE_MARKER)) {
      rmSync(UPDATE_MARKER, { force: true });
      applyUpdate();
      continue; // start the new version
    }

    say(`\n  The server stopped (code ${code}). Restarting…\n`);
    await new Promise((r) => setTimeout(r, 1000));
  }
}

main();
