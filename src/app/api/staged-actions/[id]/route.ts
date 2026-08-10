import { badRequest, guard, notFound, ok, readJson } from "@/lib/http";
import { getStagedAction, updateStagedActionStatus } from "@/lib/staged-actions";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const action = await getStagedAction(id);
  return action ? ok(action) : notFound("Action not found");
}

/**
 * Rejecting is the only transition open to the client. Approving and executing
 * belong to the server, so a stray request can't drive work by itself.
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  return guard(async () => {
    const body = await readJson<{ status?: string }>(request);
    if (body?.status !== "rejected") {
      return badRequest('The only accepted status is "rejected"');
    }
    const updated = await updateStagedActionStatus(id, "rejected");
    return updated ? ok(updated) : notFound("Action not found");
  });
}
