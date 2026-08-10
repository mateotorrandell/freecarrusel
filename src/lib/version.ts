import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { promisify } from "node:util";

/**
 * Is there a newer freecarrusel than the one running?
 *
 * The check compares the commit this copy was built from against the tip of the
 * project's default branch on GitHub. Commits rather than release tags, because
 * this is a fast-moving tool and waiting for a tagged release would mean users
 * sit on a known bug for weeks.
 *
 * Nothing is sent anywhere: it is a public, unauthenticated GET, and it only
 * happens when the app asks.
 */

const REPO = "mateotorrandell/freecarrusel";
const BRANCH = "main";
const ROOT = process.cwd();

const exec = promisify(execFile);

export interface VersionStatus {
  /** Short commit this copy is on, or null when it isn't a git checkout. */
  current: string | null;
  /** Short commit at the tip of the project's branch. */
  latest: string | null;
  /** How many commits behind, when we can tell. */
  behind: number | null;
  /** True when the app can update itself in place. */
  updatable: boolean;
  /** Why it can't, in one line, when it can't. */
  reason?: string;
  releasesUrl: string;
}

const git = async (args: string[]): Promise<string | null> => {
  try {
    const { stdout } = await exec("git", args, { cwd: ROOT, timeout: 5000 });
    return stdout.trim();
  } catch {
    return null;
  }
};

export async function getVersionStatus(): Promise<VersionStatus> {
  const releasesUrl = `https://github.com/${REPO}`;

  if (!existsSync(path.join(ROOT, ".git"))) {
    return {
      current: null,
      latest: null,
      behind: null,
      updatable: false,
      reason: "notGit",
      releasesUrl,
    };
  }

  const current = await git(["rev-parse", "--short", "HEAD"]);

  let latest: string | null = null;
  try {
    const res = await fetch(
      `https://api.github.com/repos/${REPO}/commits/${BRANCH}`,
      {
        headers: { Accept: "application/vnd.github+json" },
        signal: AbortSignal.timeout(6000),
      }
    );
    if (res.ok) {
      const data = (await res.json()) as { sha?: string };
      latest = data.sha?.slice(0, 7) ?? null;
    }
  } catch {
    // Offline, rate-limited, whatever. Not knowing is not an error worth
    // showing; the app just doesn't offer an update this time.
  }

  // Uncommitted work means this is someone's working copy, and pulling over it
  // is the one thing an updater must never do.
  const dirty = (await git(["status", "--porcelain"]))?.length ?? 0;

  const behind =
    current && latest && current !== latest
      ? Number(await git(["rev-list", "--count", `HEAD..origin/${BRANCH}`])) || null
      : 0;

  return {
    current,
    latest,
    behind,
    updatable: Boolean(current && latest && current !== latest && dirty === 0),
    reason: dirty > 0 ? "localChanges" : undefined,
    releasesUrl,
  };
}
