import { NextResponse } from "next/server";
import { getCurrentUserForRouteHandler } from "@/lib/user";
import { removeFromWatchlist } from "@/lib/watchlist";

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUserForRouteHandler();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await params;
  await removeFromWatchlist(user.id, id);
  return new NextResponse(null, { status: 204 });
}
