import { guard, noContent, notFound, ok } from "@/lib/http";
import { deletePreset, getPreset } from "@/lib/style-presets";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const preset = await getPreset(id);
  return preset ? ok(preset) : notFound("Style preset not found");
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  return guard(async () =>
    (await deletePreset(id)) ? noContent() : notFound("Style preset not found")
  );
}
