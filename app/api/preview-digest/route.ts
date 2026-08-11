import { NextResponse } from "next/server";
import { getOrCreateUser } from "@/lib/user";
import { previewDigest } from "@/lib/digest";

// Read-only preview of what the next digest send would contain — same
// exposure level as the rest of the unauthenticated dashboard (Section 4:
// no login in v1), doesn't send anything or mark anything as sent.
export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getOrCreateUser();
  const { html } = await previewDigest(user.id);
  return new NextResponse(html, { headers: { "Content-Type": "text/html; charset=utf-8" } });
}
