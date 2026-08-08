import { NextRequest, NextResponse } from "next/server";
import { getOrCreateUser } from "@/lib/user";
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
    const user = await getOrCreateUser();
    const result = await sendDigest(user);

    if (!result.sent) {
      return NextResponse.json({ sent: false, reason: result.reason });
    }
    return NextResponse.json({ sent: true, item_count: result.itemCount });
  } catch (error) {
    console.error("digest cron failed", error);
    await sendFailureAlert("digest send failed", [errorMessage(error)]);
    return NextResponse.json({ error: "digest run failed" }, { status: 500 });
  }
}

export const GET = handleDigest;
export const POST = handleDigest;
