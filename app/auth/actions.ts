"use server";

import { redirect } from "next/navigation";
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

  const supabase = await createAuthClient();
  const { data, error } = await supabase.auth.signUp({ email, password });

  if (error) {
    redirect(`/signup?error=${encodeURIComponent(error.message)}`);
  }

  // If the project doesn't require email confirmation, signUp() already
  // returns an active session — no separate login step needed.
  if (data.session && data.user?.email) {
    await getOrCreateProfile(data.user.id, data.user.email);
    redirect("/");
  }

  redirect(
    `/login?message=${encodeURIComponent("Account created — check your email to confirm it, then log in below.")}`,
  );
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
