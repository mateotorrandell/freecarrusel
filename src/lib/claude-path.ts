import { existsSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

/**
 * Locate the Claude Code CLI, which the chat route spawns as a subprocess.
 *
 * Order matters: an explicit CLAUDE_CLI_PATH always wins, then the places each
 * platform's installer actually puts the binary, and only then a PATH lookup —
 * shelling out is the slow path and it runs on every health check.
 */

const DOCS = "https://docs.anthropic.com/en/docs/claude-code";

function installLocations(): string[] {
  const home = homedir();

  if (process.platform === "win32") {
    const roaming = process.env.APPDATA ?? path.join(home, "AppData", "Roaming");
    const local = process.env.LOCALAPPDATA ?? path.join(home, "AppData", "Local");
    return [
      path.join(roaming, "npm", "claude.cmd"),
      path.join(roaming, "npm", "claude.exe"),
      path.join(local, "Programs", "claude", "claude.exe"),
    ];
  }

  // macOS and Linux. Homebrew on Apple Silicon lives under /opt, on Intel
  // under /usr/local, and npm's global prefix varies per setup.
  return [
    path.join(home, ".local", "bin", "claude"),
    "/opt/homebrew/bin/claude",
    "/usr/local/bin/claude",
    path.join(home, ".npm-global", "bin", "claude"),
  ];
}

function lookupOnPath(): string | null {
  const windows = process.platform === "win32";
  try {
    const result = spawnSync(
      windows ? "where" : "command",
      windows ? ["claude"] : ["-v", "claude"],
      { encoding: "utf-8", shell: !windows, timeout: 2000 }
    );
    if (result.status !== 0 || !result.stdout) return null;
    // `where` can return several matches, one per line.
    const first = result.stdout.split(/\r?\n/).map((l) => l.trim()).find(Boolean);
    return first && existsSync(first) ? first : null;
  } catch {
    return null;
  }
}

export function findClaudePath(): string | null {
  const configured = process.env.CLAUDE_CLI_PATH;
  if (configured && existsSync(configured)) return configured;

  const installed = installLocations().find((candidate) => existsSync(candidate));
  return installed ?? lookupOnPath();
}

export function isClaudeAvailable(): boolean {
  return findClaudePath() !== null;
}

/** Same as findClaudePath, for callers that cannot continue without it. */
export function getClaudePath(): string {
  const found = findClaudePath();
  if (found) return found;
  throw new Error(
    `Claude CLI not found. Install it (${DOCS}) or set CLAUDE_CLI_PATH in .env.local`
  );
}
