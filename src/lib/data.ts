import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { Mutex } from "async-mutex";

/**
 * JSON files under data/ are the whole database.
 *
 * Two rules keep that honest under a dev server that serves many requests at
 * once, plus an AI agent writing through the same API:
 *
 *  1. One mutex per file, so two writers never interleave.
 *  2. Write to a temp file and rename over the target. Rename is atomic on
 *     every platform we support, so a crash mid-write leaves the previous file
 *     intact instead of a half-written one.
 */

const DATA_DIR = path.resolve(process.cwd(), "data");

const locks = new Map<string, Mutex>();

function lockFor(file: string): Mutex {
  const existing = locks.get(file);
  if (existing) return existing;
  const created = new Mutex();
  locks.set(file, created);
  return created;
}

const pathTo = (file: string) => path.join(DATA_DIR, file);

export async function ensureDataDir(): Promise<void> {
  await mkdir(DATA_DIR, { recursive: true });
}

/** Read and parse, distinguishing "not there yet" from "damaged". */
export async function readData<T>(file: string): Promise<T> {
  try {
    return JSON.parse(await readFile(pathTo(file), "utf-8")) as T;
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT") throw new Error(`Missing data file: ${file}`);
    if (error instanceof SyntaxError) {
      throw new Error(`Damaged data file: ${file} — ${error.message}`);
    }
    throw error;
  }
}

/**
 * Read, or hand back `fallback` when the file is missing or unreadable. Callers
 * that can start from an empty collection use this so a fresh checkout works
 * with no seeding step.
 */
export async function readDataSafe<T>(file: string, fallback: T): Promise<T> {
  try {
    return await readData<T>(file);
  } catch {
    return fallback;
  }
}

export async function writeData<T>(file: string, value: T): Promise<void> {
  await lockFor(file).runExclusive(async () => {
    await ensureDataDir();
    const target = pathTo(file);
    const staging = `${target}.tmp`;
    await writeFile(staging, `${JSON.stringify(value, null, 2)}\n`, "utf-8");
    await rename(staging, target);
  });
}
