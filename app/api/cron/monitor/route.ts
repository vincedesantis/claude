import { NextRequest, NextResponse } from "next/server";
import { getOrCreateUser } from "@/lib/user";
import { listWatchlist } from "@/lib/watchlist";
import { monitorCompany } from "@/lib/monitor";
import { sendFailureAlert } from "@/lib/alert";

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

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function handleMonitor(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    const user = await getOrCreateUser();
    const companies = await listWatchlist(user.id);

    let itemsLogged = 0;
    const failures: { ticker: string; message: string }[] = [];

    for (const company of companies) {
      try {
        itemsLogged += await monitorCompany(company);
      } catch (error) {
        console.error(`monitor failed for ${company.ticker}`, error);
        failures.push({ ticker: company.ticker, message: errorMessage(error) });
      }
    }

    // A partial failure shouldn't silently disappear into Vercel's logs —
    // email it, same as a real digest item, so a bad day is actually seen.
    if (failures.length > 0) {
      await sendFailureAlert(
        "monitoring check failed for some tickers",
        failures.map((f) => `${f.ticker}: ${f.message}`),
      );
    }

    return NextResponse.json({
      tickers_checked: companies.length,
      items_logged: itemsLogged,
      ...(failures.length > 0 ? { failures } : {}),
    });
  } catch (error) {
    console.error("monitor cron failed entirely", error);
    await sendFailureAlert("monitoring run failed", [errorMessage(error)]);
    return NextResponse.json({ error: "monitor run failed" }, { status: 500 });
  }
}

// Vercel Cron sends GET; the PRD's documented contract is POST — support both.
export const GET = handleMonitor;
export const POST = handleMonitor;
