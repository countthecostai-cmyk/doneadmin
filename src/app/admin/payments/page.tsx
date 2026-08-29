import { createClient } from "@/lib/supabase/server";
import { PaymentsClient, type PaymentRow, type PayoutRow } from "@/app/admin/payments/PaymentsClient";
import type { Payment, Payout, Profile, Task } from "@/lib/database.types";

export const dynamic = "force-dynamic";

type PaymentJoined = Payment & { tasks: Pick<Task, "title"> | null; requester: Pick<Profile, "full_name"> | null };
type PayoutJoined = Payout & { tasks: Pick<Task, "title"> | null; doer: Pick<Profile, "full_name"> | null };

export default async function AdminPaymentsPage() {
  const supabase = await createClient();

  const [{ data: paymentsData, error: paymentsError }, { data: payoutsData, error: payoutsError }] =
    await Promise.all([
      supabase
        .from("payments")
        .select("*, tasks(title), requester:profiles!payments_requester_id_fkey(full_name)")
        .order("created_at", { ascending: false })
        .limit(300),
      supabase
        .from("payouts")
        .select("*, tasks(title), doer:profiles!payouts_doer_id_fkey(full_name)")
        .order("created_at", { ascending: false })
        .limit(300),
    ]);

  const payments: PaymentRow[] = ((paymentsData as PaymentJoined[]) ?? []).map((p) => ({
    id: p.id,
    task_id: p.task_id,
    task_title: p.tasks?.title ?? null,
    requester_name: p.requester?.full_name ?? null,
    amount_cents: p.amount_cents,
    currency: p.currency,
    status: p.status,
    failure_message: p.failure_message,
    stripe_payment_intent_id: p.stripe_payment_intent_id,
    created_at: p.created_at,
  }));

  const payouts: PayoutRow[] = ((payoutsData as PayoutJoined[]) ?? []).map((p) => ({
    id: p.id,
    task_id: p.task_id,
    task_title: p.tasks?.title ?? null,
    doer_name: p.doer?.full_name ?? null,
    amount_cents: p.amount_cents,
    currency: p.currency,
    status: p.status,
    failure_message: p.failure_message,
    stripe_transfer_id: p.stripe_transfer_id,
    created_at: p.created_at,
  }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-neutral-900">Payments & payouts</h1>
        <p className="mt-1 text-sm text-neutral-500">
          Requester → Done charges and Done → Doer transfers. Failed transactions surface first.
        </p>
        {(paymentsError || payoutsError) && (
          <p className="mt-2 text-sm text-red-600">
            {paymentsError?.message} {payoutsError?.message}
          </p>
        )}
      </div>

      <PaymentsClient initialPayments={payments} initialPayouts={payouts} />
    </div>
  );
}
