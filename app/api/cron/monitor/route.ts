import { NextRequest, NextResponse } from "next/server";
import { listAllUsers } from "@/lib/user";
import { listWatchlist } from "@/lib/watchlist";
import { monitorCompany } from "@/lib/monitor";
import { sendFailureAlert } from "@/lib/alert";
import { isWeekend } from "@/lib/market";

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

  if (isWeekend()) {
    return NextResponse.json({ tickers_checked: 0, items_logged: 0, skipped: "market closed (weekend)" });
  }

  try {
    const users = await listAllUsers();

    let tickersChecked = 0;
    let itemsLogged = 0;
    const failures: { user_email: string; ticker: string; message: string }[] = [];

    for (const user of users) {
      const companies = await listWatchlist(user.id);
      tickersChecked += companies.length;

      for (const company of companies) {
        try {
          const result = await monitorCompany(company);
          itemsLogged += result.itemsLogged;
          for (const warning of result.warnings) {
            console.error(`monitor warning for ${user.email}/${company.ticker}: ${warning}`);
            failures.push({ user_email: user.email, ticker: company.ticker, message: warning });
          }
        } catch (error) {
          console.error(`monitor failed for ${user.email}/${company.ticker}`, error);
          failures.push({ user_email: user.email, ticker: company.ticker, message: errorMessage(error) });
        }
      }
    }

    // A partial failure shouldn't silently disappear into Vercel's logs —
    // email it to the operator (DIGEST_TO_EMAIL), same as a real digest
    // item, so a bad day is actually seen.
    if (failures.length > 0) {
      await sendFailureAlert(
        "monitoring check failed for some tickers",
        failures.map((f) => `${f.user_email} / ${f.ticker}: ${f.message}`),
      );
    }

    return NextResponse.json({
      users_checked: users.length,
      tickers_checked: tickersChecked,
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
