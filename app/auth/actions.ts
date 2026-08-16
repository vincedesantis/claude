"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { createAuthClient } from "@/lib/supabase-auth";
import { getOrCreateProfile } from "@/lib/user";
import { validateSignupInput } from "@/lib/auth-validation";

function fieldToString(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

export async function signupAction(formData: FormData) {
  const email = fieldToString(formData, "email").trim();
  const password = fieldToString(formData, "password");
  const confirmPassword = fieldToString(formData, "confirmPassword");

  const validationError = validateSignupInput(email, password, confirmPassword);
  if (validationError) {
    redirect(`/signup?error=${encodeURIComponent(validationError)}`);
  }

  // Explicit, rather than relying on the Supabase project's Site URL default
  // — makes the confirmation link land on /auth/confirm regardless of how
  // that dashboard setting is configured. Still requires this origin to be
  // in the project's Redirect URLs allow list (Supabase rejects anything
  // that isn't), which is a dashboard setting this code can't set itself.
  const origin = (await headers()).get("origin");

  const supabase = await createAuthClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { emailRedirectTo: origin ? `${origin}/auth/confirm` : undefined },
  });

  if (error) {
    redirect(`/signup?error=${encodeURIComponent(error.message)}`);
  }

  // If the project doesn't require email confirmation, signUp() already
  // returns an active session — no separate login step needed.
  if (data.session && data.user?.email) {
    await getOrCreateProfile(data.user.id, data.user.email);
    redirect("/");
  }

  redirect(`/signup/check-email?email=${encodeURIComponent(email)}`);
}

export async function loginAction(formData: FormData) {
  const email = fieldToString(formData, "email").trim();
  const password = fieldToString(formData, "password");

  const supabase = await createAuthClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    redirect(`/login?error=${encodeURIComponent(error.message)}`);
  }

  redirect("/");
}

export async function logoutAction() {
  const supabase = await createAuthClient();
  await supabase.auth.signOut();
  redirect("/login");
}
