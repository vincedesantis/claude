import { NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";

// Phase 0 acceptance check: confirms the deployed app can reach Supabase.
export async function GET() {
  const { error, count } = await getSupabase()
    .from("users")
    .select("id", { count: "exact", head: true });

  if (error) {
    return NextResponse.json({ db: "unreachable", error: error.message }, { status: 500 });
  }

  return NextResponse.json({ db: "ok", users_count: count ?? 0 });
}
