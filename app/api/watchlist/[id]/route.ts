import { NextResponse } from "next/server";
import { getOrCreateUser } from "@/lib/user";
import { removeFromWatchlist } from "@/lib/watchlist";

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const user = await getOrCreateUser();
  await removeFromWatchlist(user.id, id);
  return new NextResponse(null, { status: 204 });
}
