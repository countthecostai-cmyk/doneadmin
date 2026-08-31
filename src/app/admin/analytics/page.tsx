import { createClient } from "@/lib/supabase/server";
import { formatCents } from "@/lib/pricing";
import { STATUS_LABELS, type TaskStatus } from "@/lib/task-state-machine";

export const dynamic = "force-dynamic";

/**
 * Every number here comes from a real query against payments/tasks/
 * doer_profiles/reviews — never a placeholder. Kept to simple aggregate
 * queries computed server-side (no charting library dependency, per the
 * project's admin-analytics scope) — this is the numbers/tables layer;
 * add charts later if that's ever actually needed.
 */
export default async function AdminAnalyticsPage() {
  const supabase = await createClient();

  const [
    { data: succeededPayments },
    { data: allTaskStatuses },
    { count: payoutCompletedCount },
    { count: activeDoerCount },
    { count: totalDoerCount },
    { data: reviewRatings },
  ] = await Promise.all([
    supabase.from("payments").select("amount_cents, task_id").eq("status", "succeeded"),
    supabase.from("tasks").select("status"),
    supabase.from("tasks").select("id", { count: "exact", head: true }).eq("status", "payout_completed"),
    supabase.from("doer_profiles").select("user_id", { count: "exact", head: true }).eq("status", "approved"),
    supabase.from("doer_profiles").select("user_id", { count: "exact", head: true }),
    supabase.from("reviews").select("rating"),
  ]);

  type PaymentAgg = { amount_cents: number; task_id: string };
  const payments = (succeededPayments as PaymentAgg[]) ?? [];
  const grossRevenueCents = payments.reduce((sum, p) => sum + p.amount_cents, 0);

  // Fetched separately rather than an embedded `payments -> tasks` select —
  // same reasoning as the users page: with the hand-written Database=any
  // typing there's no live schema to confirm the embed's inferred shape
  // against, so a plain second query + in-memory join is unambiguous.
  const paidTaskIds = payments.map((p) => p.task_id);
  let platformFeeCents = 0;
  let currency = "usd";
  if (paidTaskIds.length > 0) {
    const { data: paidTasks } = await supabase
      .from("tasks")
      .select("platform_fee_cents, currency")
      .in("id", paidTaskIds);
    const taskFees = (paidTasks as { platform_fee_cents: number; currency: string }[] | null) ?? [];
    platformFeeCents = taskFees.reduce((sum, t) => sum + t.platform_fee_cents, 0);
    currency = taskFees[0]?.currency ?? "usd";
  }

  const statusCounts = new Map<TaskStatus, number>();
  for (const row of (allTaskStatuses as { status: TaskStatus }[]) ?? []) {
    statusCounts.set(row.status, (statusCounts.get(row.status) ?? 0) + 1);
  }
  const totalTasks = (allTaskStatuses as unknown[])?.length ?? 0;

  const ratings = (reviewRatings as { rating: number }[]) ?? [];
  const avgRating = ratings.length ? ratings.reduce((s, r) => s + r.rating, 0) / ratings.length : null;

  const statusOrder: TaskStatus[] = [
    "requested",
    "matching",
    "quoted",
    "accepted",
    "scheduled",
    "en_route",
    "arrived",
    "in_progress",
    "completed",
    "payout_pending",
    "payout_completed",
    "disputed",
    "cancelled",
    "declined",
    "expired",
    "refunded",
  ];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold text-neutral-900">Revenue & marketplace analytics</h1>
        <p className="mt-1 text-sm text-neutral-500">Computed live from payments, tasks, Doers, and reviews.</p>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Stat label="Platform fee revenue" value={formatCents(platformFeeCents, currency)} />
        <Stat label="Gross charged to Requesters" value={formatCents(grossRevenueCents, currency)} />
        <Stat label="Tasks fully paid out" value={String(payoutCompletedCount ?? 0)} />
        <Stat label="Total tasks (all time)" value={String(totalTasks)} />
        <Stat label="Active Doers" value={`${activeDoerCount ?? 0} / ${totalDoerCount ?? 0} applied`} />
        <Stat label="Average rating" value={avgRating !== null ? `${avgRating.toFixed(2)} ★ (${ratings.length})` : "No reviews yet"} />
      </div>

      <div className="rounded-lg border border-neutral-200 bg-white p-6">
        <h2 className="mb-4 text-sm font-semibold text-neutral-700">Tasks by status</h2>
        <div className="grid grid-cols-2 gap-x-8 gap-y-2 text-sm sm:grid-cols-3">
          {statusOrder.map((s) => {
            const count = statusCounts.get(s) ?? 0;
            const pct = totalTasks ? Math.round((count / totalTasks) * 100) : 0;
            return (
              <div key={s} className="flex items-center justify-between border-b border-neutral-100 py-1.5">
                <span className="text-neutral-600">{STATUS_LABELS[s]}</span>
                <span className="font-medium text-neutral-900">
                  {count} <span className="text-xs font-normal text-neutral-500">({pct}%)</span>
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-neutral-200 bg-white p-4">
      <p className="text-xl font-semibold text-neutral-900">{value}</p>
      <p className="mt-1 text-sm text-neutral-500">{label}</p>
    </div>
  );
}
