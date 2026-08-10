import { NextResponse } from "next/server";

/**
 * Small helpers so every route answers the same way.
 *
 * The routes were each spelling out their own `NextResponse.json({error}, …)`,
 * which drifted: some 404s said "Not found", others "Carousel not found", and a
 * malformed body could come back as a 400 or a 500 depending on where it blew
 * up. The client has to branch on status codes, so they need to be predictable.
 */

export const ok = <T>(payload: T) => NextResponse.json(payload);

export const created = <T>(payload: T) => NextResponse.json(payload, { status: 201 });

export const noContent = () => NextResponse.json({ success: true });

export const badRequest = (message = "Invalid request") =>
  NextResponse.json({ error: message }, { status: 400 });

export const notFound = (what = "Not found") =>
  NextResponse.json({ error: what }, { status: 404 });

export const conflict = <T extends object>(message: string, extra?: T) =>
  NextResponse.json({ error: message, ...(extra ?? {}) }, { status: 409 });

export const serverError = (message = "Something went wrong") =>
  NextResponse.json({ error: message }, { status: 500 });

/** Parse a JSON body, or null when it isn't valid JSON. */
export async function readJson<T>(request: Request): Promise<T | null> {
  try {
    return (await request.json()) as T;
  } catch {
    return null;
  }
}

/**
 * Run a handler and turn an unexpected throw into a 500 instead of an HTML
 * error page. Deliberate failures return their own response and pass through.
 */
export async function guard(
  run: () => Promise<NextResponse>
): Promise<NextResponse> {
  try {
    return await run();
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    return serverError(detail);
  }
}

/** Trimmed string, or null when absent or blank. */
export function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}
