import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/require-admin";

export const dynamic = "force-dynamic";

/**
 * Shared server-side guard for everything under /admin. Signed-out users are
 * redirected to sign in; signed-in non-admins get a 403 rendered right here
 * (children are simply never rendered) rather than a redirect loop.
 *
 * This is a UX nicety, not the enforcement — every query/mutation on these
 * pages still runs through the real per-request Supabase client, so RLS
 * (is_admin(auth.uid())) is what actually stops a non-admin from reading or
 * writing anything, even if this check were somehow bypassed.
 */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const gate = await requireAdmin();

  if (!gate.ok && gate.reason === "signed-out") {
    redirect("/sign-in?next=/dashboard");
  }

  if (!gate.ok) {
    return (
      <div className="mx-auto flex min-h-[60vh] max-w-md flex-col items-center justify-center px-6 text-center">
        <h1 className="mb-2 text-xl font-semibold text-neutral-900">403 — Not authorized</h1>
        <p className="text-sm text-neutral-500">
          This is the Done Admin console. Your account doesn&apos;t have admin access.
        </p>
      </div>
    );
  }

  return <div className="mx-auto max-w-6xl px-6 py-8">{children}</div>;
}
