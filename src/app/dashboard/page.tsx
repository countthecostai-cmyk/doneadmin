import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/require-admin";
import { ACTIVE_TASK_STATUSES } from "@/lib/task-state-machine";

export const dynamic = "force-dynamic";

/**
 * Admin home/overview — replaces the old Requester/Doer dashboard entirely.
 * Quick counts + links into the real tooling; the full breakdown lives on
 * /admin/analytics.
 */
export default async function DashboardPage() {
  const gate = await requireAdmin();
  if (!gate.ok && gate.reason === "signed-out") redirect("/sign-in?next=/dashboard");
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

  const supabase = await createClient();

  const [
    activeTasksCount,
    openDisputesCount,
    pendingDoersCount,
    failedPaymentsCount,
    failedPayoutsCount,
    totalUsersCount,
    openSupportTicketsCount,
  ] = await Promise.all([
    supabase
      .from("tasks")
      .select("id", { count: "exact", head: true })
      .in("status", ACTIVE_TASK_STATUSES),
    supabase.from("disputes").select("id", { count: "exact", head: true }).eq("status", "open"),
    supabase
      .from("doer_profiles")
      .select("user_id", { count: "exact", head: true })
      .eq("status", "pending"),
    supabase.from("payments").select("id", { count: "exact", head: true }).eq("status", "failed"),
    supabase.from("payouts").select("id", { count: "exact", head: true }).eq("status", "failed"),
    supabase.from("profiles").select("id", { count: "exact", head: true }),
    supabase
      .from("support_tickets")
      .select("id", { count: "exact", head: true })
      .in("status", ["open", "in_progress"]),
  ]);

  const tiles = [
    {
      label: "Active tasks",
      value: activeTasksCount.count ?? 0,
      href: "/admin/tasks",
      tone: "border-neutral-200 bg-white",
    },
    {
      label: "Open disputes",
      value: openDisputesCount.count ?? 0,
      href: "/admin/disputes",
      tone: (openDisputesCount.count ?? 0) > 0 ? "border-amber-200 bg-amber-50" : "border-neutral-200 bg-white",
    },
    {
      label: "Pending Doer applications",
      value: pendingDoersCount.count ?? 0,
      href: "/admin/doers",
      tone:
        (pendingDoersCount.count ?? 0) > 0 ? "border-amber-200 bg-amber-50" : "border-neutral-200 bg-white",
    },
    {
      label: "Failed payments",
      value: failedPaymentsCount.count ?? 0,
      href: "/admin/payments",
      tone: (failedPaymentsCount.count ?? 0) > 0 ? "border-red-200 bg-red-50" : "border-neutral-200 bg-white",
    },
    {
      label: "Failed payouts",
      value: failedPayoutsCount.count ?? 0,
      href: "/admin/payments",
      tone: (failedPayoutsCount.count ?? 0) > 0 ? "border-red-200 bg-red-50" : "border-neutral-200 bg-white",
    },
    {
      label: "Total users",
      value: totalUsersCount.count ?? 0,
      href: "/admin/users",
      tone: "border-neutral-200 bg-white",
    },
    {
      label: "Open support tickets",
      value: openSupportTicketsCount.count ?? 0,
      href: "/admin/support",
      tone:
        (openSupportTicketsCount.count ?? 0) > 0 ? "border-amber-200 bg-amber-50" : "border-neutral-200 bg-white",
    },
  ];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold text-neutral-900">
          Hi {gate.profile.full_name?.split(" ")[0] ?? "there"} 👋
        </h1>
        <p className="mt-1 text-sm text-neutral-500">Here&apos;s what needs attention right now.</p>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        {tiles.map((tile) => (
          <Link
            key={tile.label}
            href={tile.href}
            className={`rounded-lg border p-4 transition hover:shadow-sm ${tile.tone}`}
          >
            <p className="text-2xl font-semibold text-neutral-900">{tile.value}</p>
            <p className="mt-1 text-sm text-neutral-500">{tile.label}</p>
          </Link>
        ))}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <QuickLink href="/admin/tasks" title="Live jobs monitor" body="Watch every task in real time, filter by status, drill into the timeline." />
        <QuickLink href="/admin/users" title="User management" body="Look up Requesters and Doers, suspend or reactivate accounts." />
        <QuickLink href="/admin/disputes" title="Disputes" body="Resolve open disputes — release, refund, or cancel." />
        <QuickLink href="/admin/support" title="Support" body="Account, billing, safety, and bug reports from Requesters and Doers." />
        <QuickLink href="/admin/payments" title="Payments & payouts" body="Monitor transactions, and catch failed charges/transfers." />
        <QuickLink href="/admin/analytics" title="Analytics" body="Platform revenue, task volume, and marketplace health." />
        <QuickLink href="/admin/settings" title="Platform settings" body="Categories, task types, and pricing — no code change needed." />
      </div>
    </div>
  );
}

function QuickLink({ href, title, body }: { href: string; title: string; body: string }) {
  return (
    <Link
      href={href}
      className="rounded-lg border border-neutral-200 bg-white p-4 transition hover:border-neutral-300 hover:shadow-sm"
    >
      <p className="font-medium text-neutral-900">{title}</p>
      <p className="mt-1 text-sm text-neutral-500">{body}</p>
    </Link>
  );
}
