import { writeFile } from "node:fs/promises";
import path from "node:path";
import { guard, ok, serverError } from "@/lib/http";
import { getVersionStatus } from "@/lib/version";

/** Where the launcher looks to know an update was asked for. */
const MARKER = path.join(process.cwd(), ".update-requested");

export const dynamic = "force-dynamic";

export async function GET() {
  return guard(async () => ok(await getVersionStatus()));
}

/**
 * Ask for the update.
 *
 * The app cannot rebuild itself while it is the thing being rebuilt, so this
 * drops a marker and stops the server. `npm start` supervises: it sees the
 * marker, pulls, installs, rebuilds and starts the new version. The browser
 * polls until the server answers again and reloads itself.
 */
export async function POST() {
  const status = await getVersionStatus();
  if (!status.updatable) {
    return serverError(status.reason ?? "There is nothing to update");
  }

  await writeFile(MARKER, new Date().toISOString(), "utf-8");

  // Answer first, then exit, or the browser sees a dropped connection and
  // reports a failure for an update that is actually under way.
  setTimeout(() => process.exit(0), 300);
  return ok({ restarting: true });
}
