import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";

/**
 * Service-role client — BYPASSES RLS. Server-only (route handlers / webhook
 * handlers / admin server actions), never imported into anything that ships
 * to the browser. Per the architecture doc: any write through this client
 * must mirror what RLS would enforce for the equivalent write — when you
 * change one side, change the other in the same commit.
 *
 * Used for: the Stripe webhook (no user session exists), notify() fan-out
 * inserts, and system-actor transitions (expiring stale matches, requeueing
 * declined tasks) that no single end user's session should be trusted to
 * perform even under their own RLS grant.
 */
export function createServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  if (!key) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY is not set — service-role actions are unavailable."
    );
  }
  return createSupabaseClient<Database>(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
