import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { Database } from "@/lib/database.types";

/**
 * Server client for Server Components / Server Actions / Route Handlers.
 * RLS-scoped to whichever user's session cookie is present — this is what
 * every task-status-changing server action should use, so the database's
 * own RLS policies are the real gate, not a role check in the action body.
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Called from a Server Component with no writable cookie jar
            // (middleware refreshes the session instead) — safe to ignore.
          }
        },
      },
    }
  );
}
