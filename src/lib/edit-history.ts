import { rm } from "fs/promises";
import path from "path";
import { readDataSafe, writeData } from "./data";
import { dataFile } from "./paths";

/**
 * Persistent undo/redo for the visual editor.
 *
 * Deliberately NOT stored in carousels.json: that file is rewritten in full on
 * every mutation, and stuffing HTML snapshots into it would turn each keystroke
 * flush into a multi-megabyte write. One file per carousel keeps the hot path
 * small, and history writes never touch carousel data.
 *
 * This is separate from `Slide.previousVersions` (5 deep, undo-only), which
 * stays as the coarse safety net reachable from the filmstrip.
 */

export interface SlideHistory {
  items: string[];
  index: number;
}

interface HistoryFile {
  slides: Record<string, SlideHistory>;
}

/** Snapshots kept per slide. ~3KB each, so ~150KB per slide worst case. */
export const MAX_HISTORY = 50;

const fileFor = (carouselId: string) => `history-${carouselId}.json`;

async function load(carouselId: string): Promise<HistoryFile> {
  return readDataSafe<HistoryFile>(fileFor(carouselId), { slides: {} });
}

export async function getHistory(
  carouselId: string,
  slideId: string
): Promise<SlideHistory> {
  const data = await load(carouselId);
  return data.slides[slideId] ?? { items: [], index: -1 };
}

/** Seed the stack when an edit session starts, if it has nothing yet. */
export async function initHistory(
  carouselId: string,
  slideId: string,
  html: string
): Promise<SlideHistory> {
  const data = await load(carouselId);
  const existing = data.slides[slideId];
  if (existing && existing.items.length > 0) return existing;

  const seeded: SlideHistory = { items: [html], index: 0 };
  data.slides[slideId] = seeded;
  await writeData(fileFor(carouselId), data);
  return seeded;
}

/**
 * Persist the editor's stack wholesale.
 *
 * The client owns the stack — it sees every discrete interaction (drag end,
 * style change, delete) while the server only ever sees the debounced save.
 * An earlier design had the server append one entry per flush, which silently
 * collapsed a burst of ten edits into a single undo step.
 */
export async function syncHistory(
  carouselId: string,
  slideId: string,
  history: SlideHistory
): Promise<SlideHistory> {
  const data = await load(carouselId);

  let { items, index } = history;
  if (items.length > MAX_HISTORY) {
    const drop = items.length - MAX_HISTORY;
    items = items.slice(drop);
    index -= drop;
  }
  const next: SlideHistory = {
    items,
    index: Math.max(0, Math.min(index, items.length - 1)),
  };

  data.slides[slideId] = next;
  await writeData(fileFor(carouselId), data);
  return next;
}

/** Remove a carousel's history file so deleting a carousel doesn't leave junk. */
export async function deleteHistory(carouselId: string): Promise<void> {
  const target = dataFile(fileFor(carouselId));
  try {
    await rm(target, { force: true });
  } catch {
    // nothing to clean up
  }
}
