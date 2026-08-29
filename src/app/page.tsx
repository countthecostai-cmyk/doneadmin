import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * Done Admin has no public marketing surface — every real page lives behind
 * sign-in. Route straight to the admin home (which itself redirects to
 * sign-in when signed out, or shows a 403 when signed in but not an admin).
 */
export default async function Home() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  redirect(user ? "/dashboard" : "/sign-in?next=/dashboard");
}
