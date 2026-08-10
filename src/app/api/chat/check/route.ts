import { findClaudePath } from "@/lib/claude-path";
import { ok } from "@/lib/http";

/**
 * Whether the assistant can run at all. The UI polls this to decide between
 * showing the chat and showing install instructions.
 */
export async function GET() {
  const path = findClaudePath();
  return ok({ available: path !== null, path });
}
