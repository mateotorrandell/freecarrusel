#!/usr/bin/env node
// Environment check. Answers one question: can this machine run freecarrusel?
//
// Dependency-free and safe to run before `npm install`, because the most
// common reason someone lands here is that the install itself went wrong.
//
// Exit code 0 when everything required is in place, 1 otherwise.

import { accessSync, constants, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { homedir, platform } from "node:os";
import path from "node:path";

const WINDOWS = platform() === "win32";
const MARK = { pass: "✓", fail: "✗", note: "○", warn: "!" };

const results = [];
let blocking = 0;

const report = (state, label, detail, required = false) => {
  results.push({ state, label, detail });
  if (required && state === "fail") blocking += 1;
};

const run = (file, args) => {
  try {
    return execFileSync(file, args, {
      stdio: ["ignore", "pipe", "ignore"],
      shell: !WINDOWS,
    })
      .toString()
      .trim();
  } catch {
    return null;
  }
};

// ---- Node ------------------------------------------------------------------
const nodeMajor = Number(process.versions.node.split(".")[0]);
report(
  nodeMajor >= 20 ? "pass" : "fail",
  "Node",
  nodeMajor >= 20
    ? `v${process.versions.node}`
    : `v${process.versions.node} — 20 or newer required (nodejs.org)`,
  true
);

// ---- Claude Code CLI -------------------------------------------------------
const cliCandidates = [
  process.env.CLAUDE_CLI_PATH,
  ...(WINDOWS
    ? [
        path.join(process.env.APPDATA ?? "", "npm", "claude.cmd"),
        path.join(process.env.LOCALAPPDATA ?? "", "Programs", "claude", "claude.exe"),
      ]
    : [
        path.join(homedir(), ".local", "bin", "claude"),
        "/opt/homebrew/bin/claude",
        "/usr/local/bin/claude",
        path.join(homedir(), ".npm-global", "bin", "claude"),
      ]),
].filter(Boolean);

const onPath = WINDOWS ? run("where", ["claude"]) : run("command", ["-v", "claude"]);
const cli =
  (onPath && onPath.split(/\r?\n/)[0].trim()) ||
  cliCandidates.find((candidate) => existsSync(candidate)) ||
  null;

if (cli) {
  const version = run(cli, ["--version"]);
  report("pass", "Claude CLI", version ? `${version} — ${cli}` : cli);
} else {
  report(
    "fail",
    "Claude CLI",
    "not found — `npm i -g @anthropic-ai/claude-code`, then `npm run setup`",
    true
  );
}

// ---- Project ---------------------------------------------------------------
report(
  existsSync(path.resolve("node_modules")) ? "pass" : "fail",
  "Dependencies",
  existsSync(path.resolve("node_modules")) ? "installed" : "run `npm install`",
  true
);

for (const dir of ["data", path.join("public", "uploads")]) {
  const full = path.resolve(dir);
  if (!existsSync(full)) {
    report("note", dir, "will be created on first use");
    continue;
  }
  try {
    accessSync(full, constants.W_OK);
    report("pass", dir, "writable");
  } catch {
    report("fail", dir, "exists but is not writable", true);
  }
}

// Chromium ships with Puppeteer; without it the PNG export cannot run.
report(
  existsSync(path.resolve("node_modules", "puppeteer")) ? "pass" : "warn",
  "PNG export",
  existsSync(path.resolve("node_modules", "puppeteer"))
    ? "Puppeteer present"
    : "Puppeteer missing — export will fail"
);

// ---- Output ----------------------------------------------------------------
const width = Math.max(...results.map((r) => r.label.length));
console.log("");
for (const { state, label, detail } of results) {
  console.log(`  ${MARK[state]}  ${label.padEnd(width)}  ${detail}`);
}
console.log("");

if (blocking > 0) {
  console.log(`  ${blocking} problem${blocking > 1 ? "s" : ""} to fix before starting.\n`);
  process.exit(1);
}
console.log("  Ready. Start it with `npm run dev`.\n");
