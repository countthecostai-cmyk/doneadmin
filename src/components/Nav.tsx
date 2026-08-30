import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { signOut } from "@/app/auth/actions";
import type { Profile } from "@/lib/database.types";

const ADMIN_LINKS: { href: string; label: string }[] = [
  { href: "/dashboard", label: "Overview" },
  { href: "/admin/users", label: "Users" },
  { href: "/admin/tasks", label: "Live Jobs" },
  { href: "/admin/doers", label: "Doer Apps" },
  { href: "/admin/disputes", label: "Disputes" },
  { href: "/admin/payments", label: "Payments" },
  { href: "/admin/analytics", label: "Analytics" },
  { href: "/admin/settings", label: "Settings" },
  { href: "/admin/audit-log", label: "Audit Log" },
];

export async function Nav() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let profile: Profile | null = null;
  if (user) {
    const { data } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", user.id)
      .maybeSingle();
    profile = data as Profile | null;
  }

  return (
    <header className="border-b border-neutral-200 bg-white">
      <nav className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-6 py-4">
        <Link href="/" className="text-lg font-bold tracking-tight text-neutral-900">
          Done <span className="font-normal text-neutral-400">Admin</span>
        </Link>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
          {user && profile?.is_admin && (
            <>
              {ADMIN_LINKS.map((link) => (
                <Link key={link.href} href={link.href} className="text-neutral-600 hover:text-neutral-900">
                  {link.label}
                </Link>
              ))}
            </>
          )}
          {user ? (
            <form action={signOut}>
              <button className="rounded-lg border border-neutral-300 px-3 py-1.5 text-neutral-700 hover:bg-neutral-50">
                Sign out
              </button>
            </form>
          ) : (
            <>
              <Link href="/sign-in" className="text-neutral-600 hover:text-neutral-900">
                Sign in
              </Link>
            </>
          )}
        </div>
      </nav>
    </header>
  );
}
