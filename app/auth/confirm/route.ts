import { type EmailOtpType } from "@supabase/supabase-js";
import { type NextRequest, NextResponse } from "next/server";
import { createAuthClient } from "@/lib/supabase-auth";

// Target of the confirmation link in Supabase's signup email. Requires the
// Supabase project's email template redirect (or signUp's emailRedirectTo)
// to point here — a Supabase dashboard setting, not something this code
// controls.
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const next = searchParams.get("next") ?? "/";

  if (tokenHash && type) {
    const supabase = await createAuthClient();
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    if (!error) {
      return NextResponse.redirect(new URL(next, request.url));
    }
  }

  return NextResponse.redirect(
    new URL(`/login?error=${encodeURIComponent("Confirmation link invalid or expired.")}`, request.url),
  );
}
