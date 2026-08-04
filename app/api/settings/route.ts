import { NextRequest, NextResponse } from "next/server";
import { getOrCreateUser } from "@/lib/user";
import { isValidCadence, setCadence } from "@/lib/settings";

export async function GET() {
  const user = await getOrCreateUser();
  return NextResponse.json({ cadence: user.digest_cadence });
}

export async function PUT(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const cadence = typeof body?.cadence === "string" ? body.cadence : null;

  if (!cadence || !isValidCadence(cadence)) {
    return NextResponse.json({ error: "invalid cadence" }, { status: 400 });
  }

  const user = await getOrCreateUser();
  const updated = await setCadence(user.id, cadence);
  return NextResponse.json({ cadence: updated.digest_cadence });
}
