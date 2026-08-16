import { NextRequest, NextResponse } from "next/server";
import { searchSymbols } from "@/lib/finnhub";
import { getCurrentUserForRouteHandler } from "@/lib/user";

// Section 6.1: backs the dashboard's "add by ticker or name" search box.
// Requires a session — same as the rest of the now-authenticated dashboard,
// and avoids letting a logged-out caller burn the shared Finnhub quota.
export async function GET(request: NextRequest) {
  const user = await getCurrentUserForRouteHandler();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const query = request.nextUrl.searchParams.get("q")?.trim() ?? "";
  if (query.length < 2) return NextResponse.json([]);

  const matches = await searchSymbols(query);
  return NextResponse.json(matches);
}
