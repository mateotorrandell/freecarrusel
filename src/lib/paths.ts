import path from "node:path";

/**
 * Where the app keeps things on disk.
 *
 * Running from source, everything lives inside the project folder, which is
 * what makes a checkout self-contained and easy to inspect. Installed as a
 * desktop app that folder is read-only (and inside the .app bundle on macOS),
 * so the shell passes a per-user location through the environment instead.
 *
 * Every module that touches the filesystem goes through here. Scattering
 * `process.cwd()` around is how a packaged build ends up silently writing into
 * a directory the installer will replace on the next update.
 */

const fromEnv = (name: string): string | null => {
  const value = process.env[name];
  return value && value.trim() ? path.resolve(value) : null;
};

/** Carousels, brand, settings, edit history, font cache. */
export const DATA_DIR: string =
  fromEnv("FREECARRUSEL_DATA_DIR") ?? path.resolve(process.cwd(), "data");

/** Everything the user or the assistant uploaded. */
export const UPLOAD_DIR: string =
  fromEnv("FREECARRUSEL_UPLOAD_DIR") ?? path.resolve(DATA_DIR, "..", "public", "uploads");

/** Scratch space for the AI agent: its prompt files and downloads. */
export const AGENT_DIR = path.join(DATA_DIR, "agent-workspace");

/** Where finished exports are written. */
export const EXPORT_DIR = path.join(DATA_DIR, "exports");

export const dataFile = (name: string) => path.join(DATA_DIR, name);
export const uploadFile = (name: string) => path.join(UPLOAD_DIR, name);

/**
 * Turn a `/uploads/x.png` web path into a real file path, refusing anything
 * that tries to climb out of the uploads folder.
 */
export function resolveUpload(webPath: string): string | null {
  if (!webPath.startsWith("/uploads/")) return null;
  const relative = decodeURIComponent(webPath.slice("/uploads".length));
  const full = path.resolve(UPLOAD_DIR, `.${relative}`);
  return full.startsWith(UPLOAD_DIR) ? full : null;
}
