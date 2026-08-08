import { NextRequest, NextResponse } from "next/server";
import { getOrCreateUser } from "@/lib/user";
import { listWatchlist } from "@/lib/watchlist";
import { monitorCompany } from "@/lib/monitor";

// Accepts either the PRD's documented `x-cron-secret` header (for manual/API
// testing) or Vercel's own `Authorization: Bearer $CRON_SECRET` header, which
// it attaches automatically to scheduled and dashboard-triggered cron runs.
function isAuthorized(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;

  if (request.headers.get("x-cron-secret") === secret) return true;
  if (request.headers.get("authorization") === `Bearer ${secret}`) return true;
  return false;
}

async function handleMonitor(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const user = await getOrCreateUser();
  const companies = await listWatchlist(user.id);

  let itemsLogged = 0;
  for (const company of companies) {
    try {
      itemsLogged += await monitorCompany(company);
    } catch (error) {
      console.error(`monitor failed for ${company.ticker}`, error);
    }
  }

  return NextResponse.json({ tickers_checked: companies.length, items_logged: itemsLogged });
}

// Vercel Cron sends GET; the PRD's documented contract is POST — support both.
export const GET = handleMonitor;
export const POST = handleMonitor;
