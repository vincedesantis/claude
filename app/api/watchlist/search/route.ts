import { NextRequest, NextResponse } from "next/server";
import { searchSymbols } from "@/lib/finnhub";

// Section 6.1: backs the dashboard's "add by ticker or name" search box.
// Read-only, same exposure level as the rest of the unauthenticated dashboard.
export async function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams.get("q")?.trim() ?? "";
  if (query.length < 2) return NextResponse.json([]);

  const matches = await searchSymbols(query);
  return NextResponse.json(matches);
}
