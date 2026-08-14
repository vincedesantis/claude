import { NextRequest, NextResponse } from "next/server";
import { getOrCreateUser } from "@/lib/user";
import { addToWatchlist, isUniqueViolation, listWatchlist, normalizeTicker } from "@/lib/watchlist";

export async function GET() {
  const user = await getOrCreateUser();
  const companies = await listWatchlist(user.id);
  return NextResponse.json(companies);
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const rawTicker = typeof body?.ticker === "string" ? body.ticker : "";
  const ticker = normalizeTicker(rawTicker);
  const companyName = typeof body?.companyName === "string" ? body.companyName : undefined;

  if (!ticker) {
    return NextResponse.json({ error: "invalid ticker" }, { status: 400 });
  }

  const user = await getOrCreateUser();

  try {
    const company = await addToWatchlist(user.id, ticker, companyName);
    return NextResponse.json(company);
  } catch (error) {
    if (isUniqueViolation(error)) {
      return NextResponse.json({ error: "ticker already on watchlist" }, { status: 400 });
    }
    throw error;
  }
}
