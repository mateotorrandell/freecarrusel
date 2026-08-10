import { ok } from "@/lib/http";
import { FONT_CATALOG } from "@/lib/font-catalog";

/** The font picker's options. Static data, so it never touches the network. */
export async function GET() {
  return ok({ fonts: FONT_CATALOG });
}
