import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Merge Tailwind classes so the last one wins even when two rules target the
 * same property — `cn("p-2", cond && "p-4")` yields `p-4`, not both.
 */
export function cn(...classes: ClassValue[]): string {
  return twMerge(clsx(classes));
}

/** Identifier for anything we persist. */
export function generateId(): string {
  return crypto.randomUUID();
}

/** One timestamp format everywhere: ISO 8601, UTC. */
export function now(): string {
  return new Date().toISOString();
}
