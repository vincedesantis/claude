import { NextRequest, NextResponse } from "next/server";
import { listAllUsers } from "@/lib/user";
import { sendDigest } from "@/lib/digest";
import { sendFailureAlert } from "@/lib/alert";

// Same dual-header auth as /api/cron/monitor — see that route for why.
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

async function handleDigest(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    const users = await listAllUsers();
    const results: { user_email: string; sent: boolean; reason?: string; item_count?: number }[] = [];
    const failures: string[] = [];

    for (const user of users) {
      try {
        const result = await sendDigest(user);
        results.push({
          user_email: user.email,
          sent: result.sent,
          ...(result.reason ? { reason: result.reason } : {}),
          ...(result.itemCount !== undefined ? { item_count: result.itemCount } : {}),
        });
      } catch (error) {
        console.error(`digest send failed for ${user.email}`, error);
        failures.push(`${user.email}: ${errorMessage(error)}`);
        results.push({ user_email: user.email, sent: false, reason: "send failed" });
      }
    }

    if (failures.length > 0) {
      await sendFailureAlert("digest send failed for some users", failures);
    }

    return NextResponse.json({ users_checked: users.length, results });
  } catch (error) {
    console.error("digest cron failed", error);
    await sendFailureAlert("digest send failed", [errorMessage(error)]);
    return NextResponse.json({ error: "digest run failed" }, { status: 500 });
  }
}

export const GET = handleDigest;
export const POST = handleDigest;
