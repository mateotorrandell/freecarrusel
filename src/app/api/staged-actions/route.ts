import { badRequest, created, guard, ok, readJson, text } from "@/lib/http";
import { createStagedAction, listStagedActions } from "@/lib/staged-actions";

/**
 * The assistant can only stage ONE kind of side effect, and only with a .png
 * name. This route is reachable by the agent, so it is written as a whitelist:
 * anything not explicitly allowed is refused, rather than trying to enumerate
 * what would be dangerous.
 */
export async function GET() {
  return ok({ actions: await listStagedActions() });
}

export async function POST(request: Request) {
  return guard(async () => {
    const body = await readJson<Record<string, unknown>>(request);
    if (!body) return badRequest();

    if (body.type !== "export_png") {
      return badRequest('The only allowed action type is "export_png"');
    }

    const fileName = text(body.fileName);
    const content = text(body.content);
    const description = text(body.description);
    const carouselId = text(body.carouselId);

    if (!fileName || !content || !description || !carouselId) {
      return badRequest("fileName, content, description and carouselId are required");
    }
    if (!fileName.toLowerCase().endsWith(".png")) {
      return badRequest("Only .png files can be staged");
    }
    // A name is a name, never a path.
    if (/[\/]|\.\./.test(fileName)) {
      return badRequest("fileName cannot contain a path");
    }

    const action = await createStagedAction({
      type: "export_png",
      fileName,
      content,
      description,
      carouselId,
      autoExecute: body.autoExecute === true,
    });

    return created({ action });
  });
}
