import { getBrand, updateBrand } from "@/lib/brand";
import { badRequest, guard, ok, readJson } from "@/lib/http";
import type { BrandConfig } from "@/types/brand";

export async function GET() {
  return ok(await getBrand());
}

export async function PUT(request: Request) {
  return guard(async () => {
    const patch = await readJson<Partial<BrandConfig>>(request);
    if (!patch || typeof patch !== "object") return badRequest();
    return ok(await updateBrand(patch));
  });
}
