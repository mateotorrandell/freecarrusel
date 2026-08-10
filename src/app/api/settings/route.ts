import { NextResponse } from "next/server";
import { getSettings, updateSettings, isLanguage } from "@/lib/settings";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json(await getSettings());
}

export async function PUT(request: Request) {
  let body: { language?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!isLanguage(body.language)) {
    return NextResponse.json(
      { error: "language must be 'es' or 'en'" },
      { status: 400 }
    );
  }

  return NextResponse.json(await updateSettings({ language: body.language }));
}
