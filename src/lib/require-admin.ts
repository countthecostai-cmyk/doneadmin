import { createClient } from "@/lib/supabase/server";
import type { Profile } from "@/lib/database.types";

/**
 * Server-side admin gate. RLS is the real authorization boundary (an admin
 * page can only ever read/write what is_admin(auth.uid()) grants), but this
 * gives callers a clean signed-in-and-authorized/not result to render a
 * proper 403 or redirect from, per the architecture doc's "never rely on
 * RLS alone for UX" rule.
 */
export type AdminGateResult =
  | { ok: true; userId: string; profile: Profile }
  | { ok: false; reason: "signed-out" }
  | { ok: false; reason: "not-admin"; profile: Profile | null };

export async function requireAdmin(): Promise<AdminGateResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { ok: false, reason: "signed-out" };

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .maybeSingle();

  const p = profile as Profile | null;
  if (!p?.is_admin) return { ok: false, reason: "not-admin", profile: p };

  return { ok: true, userId: user.id, profile: p };
}
