import { NextResponse } from "next/server";
import { getCurrentUserForRouteHandler } from "@/lib/user";
import { previewDigest } from "@/lib/digest";

// Read-only preview of what the next digest send would contain for the
// signed-in user — doesn't send anything or mark anything as sent.
export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getCurrentUserForRouteHandler();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { html } = await previewDigest(user.id);
  return new NextResponse(html, { headers: { "Content-Type": "text/html; charset=utf-8" } });
}
