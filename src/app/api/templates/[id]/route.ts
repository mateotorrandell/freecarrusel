import { deleteTemplate, getTemplate } from "@/lib/templates";
import { guard, noContent, notFound, ok } from "@/lib/http";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const template = await getTemplate(id);
  return template ? ok(template) : notFound("Template not found");
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  return guard(async () =>
    (await deleteTemplate(id)) ? noContent() : notFound("Template not found")
  );
}
