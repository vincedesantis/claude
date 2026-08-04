import { getSupabase } from "./supabase";

const CADENCES = ["daily", "weekly", "biweekly", "monthly"] as const;
export type Cadence = (typeof CADENCES)[number];

export function isValidCadence(value: string): value is Cadence {
  return (CADENCES as readonly string[]).includes(value);
}

export async function setCadence(userId: string, cadence: Cadence) {
  const { data, error } = await getSupabase()
    .from("users")
    .update({ digest_cadence: cadence })
    .eq("id", userId)
    .select("digest_cadence")
    .single();

  if (error) throw error;
  return data;
}
