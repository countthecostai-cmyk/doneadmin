"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { subscribeToPayments, subscribeToPayouts } from "@/lib/realtime";
import { formatCents } from "@/lib/pricing";
import type { PaymentStatus, PayoutStatus } from "@/lib/database.types";

export interface PaymentRow {
  id: string;
  task_id: string;
  task_title: string | null;
  requester_name: string | null;
  amount_cents: number;
  currency: string;
  status: PaymentStatus;
  failure_message: string | null;
  stripe_payment_intent_id: string | null;
  created_at: string;
}

export interface PayoutRow {
  id: string;
  task_id: string;
  task_title: string | null;
  doer_name: string | null;
  amount_cents: number;
  currency: string;
  status: PayoutStatus;
  failure_message: string | null;
  stripe_transfer_id: string | null;
  created_at: string;
}

function upsertById<T extends { id: string }>(prev: T[], incoming: Partial<T> & { id: string }): T[] {
  const idx = prev.findIndex((r) => r.id === incoming.id);
  if (idx === -1) return [{ ...incoming } as T, ...prev];
  const next = [...prev];
  next[idx] = { ...next[idx], ...incoming };
  return next;
}

export function PaymentsClient({
  initialPayments,
  initialPayouts,
}: {
  initialPayments: PaymentRow[];
  initialPayouts: PayoutRow[];
}) {
  const [payments, setPayments] = useState(initialPayments);
  const [prevInitialPayments, setPrevInitialPayments] = useState(initialPayments);
  const [payouts, setPayouts] = useState(initialPayouts);
  const [prevInitialPayouts, setPrevInitialPayouts] = useState(initialPayouts);

  // Adjusted during render rather than in an effect — see TaskMonitorClient
  // for why (avoids a synchronous setState-in-effect cascading render).
  if (initialPayments !== prevInitialPayments) {
    setPrevInitialPayments(initialPayments);
    setPayments(initialPayments);
  }
  if (initialPayouts !== prevInitialPayouts) {
    setPrevInitialPayouts(initialPayouts);
    setPayouts(initialPayouts);
  }

  useEffect(() => {
    const supabase = createClient();
    const unsubPayments = subscribeToPayments<PaymentRow>(supabase, (payload) => {
      if (payload.eventType === "DELETE") {
        const oldId = payload.old?.id;
        if (oldId) setPayments((prev) => prev.filter((p) => p.id !== oldId));
        return;
      }
      if (payload.new?.id) setPayments((prev) => upsertById(prev, payload.new as PaymentRow));
    });
    const unsubPayouts = subscribeToPayouts<PayoutRow>(supabase, (payload) => {
      if (payload.eventType === "DELETE") {
        const oldId = payload.old?.id;
        if (oldId) setPayouts((prev) => prev.filter((p) => p.id !== oldId));
        return;
      }
      if (payload.new?.id) setPayouts((prev) => upsertById(prev, payload.new as PayoutRow));
    });
    return () => {
      unsubPayments();
      unsubPayouts();
    };
  }, []);

  const failedPayments = useMemo(() => payments.filter((p) => p.status === "failed"), [payments]);
  const failedPayouts = useMemo(() => payouts.filter((p) => p.status === "failed"), [payouts]);

  return (
    <div className="space-y-8">
      {(failedPayments.length > 0 || failedPayouts.length > 0) && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          <p className="font-medium">
            {failedPayments.length} failed payment{failedPayments.length === 1 ? "" : "s"} ·{" "}
            {failedPayouts.length} failed payout{failedPayouts.length === 1 ? "" : "s"}
          </p>
          <p className="mt-1 text-red-700">These need manual follow-up — Stripe details are below each row.</p>
        </div>
      )}

      <section>
        <h2 className="mb-3 text-lg font-medium text-neutral-900">Payments (Requester → Done)</h2>
        <Table>
          <thead>
            <tr>
              <Th>Task</Th>
              <Th>Requester</Th>
              <Th>Amount</Th>
              <Th>Status</Th>
              <Th>Stripe PI</Th>
              <Th>When</Th>
            </tr>
          </thead>
          <tbody>
            {payments.length === 0 && <EmptyRow colSpan={6} label="No payments yet." />}
            {payments.map((p) => (
              <tr key={p.id} className={p.status === "failed" ? "bg-red-50" : "hover:bg-neutral-50"}>
                <Td>
                  <Link href={`/admin/tasks/${p.task_id}`} className="text-neutral-900 hover:underline">
                    {p.task_title ?? p.task_id}
                  </Link>
                </Td>
                <Td>{p.requester_name ?? "—"}</Td>
                <Td>{formatCents(p.amount_cents, p.currency)}</Td>
                <Td>
                  <StatusPill status={p.status} />
                  {p.failure_message && <p className="mt-1 text-xs text-red-600">{p.failure_message}</p>}
                </Td>
                <Td className="font-mono text-xs">{p.stripe_payment_intent_id ?? "—"}</Td>
                <Td>{new Date(p.created_at).toLocaleString()}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </section>

      <section>
        <h2 className="mb-3 text-lg font-medium text-neutral-900">Payouts (Done → Doer)</h2>
        <Table>
          <thead>
            <tr>
              <Th>Task</Th>
              <Th>Doer</Th>
              <Th>Amount</Th>
              <Th>Status</Th>
              <Th>Stripe Transfer</Th>
              <Th>When</Th>
            </tr>
          </thead>
          <tbody>
            {payouts.length === 0 && <EmptyRow colSpan={6} label="No payouts yet." />}
            {payouts.map((p) => (
              <tr key={p.id} className={p.status === "failed" ? "bg-red-50" : "hover:bg-neutral-50"}>
                <Td>
                  <Link href={`/admin/tasks/${p.task_id}`} className="text-neutral-900 hover:underline">
                    {p.task_title ?? p.task_id}
                  </Link>
                </Td>
                <Td>{p.doer_name ?? "—"}</Td>
                <Td>{formatCents(p.amount_cents, p.currency)}</Td>
                <Td>
                  <StatusPill status={p.status} />
                  {p.failure_message && <p className="mt-1 text-xs text-red-600">{p.failure_message}</p>}
                </Td>
                <Td className="font-mono text-xs">{p.stripe_transfer_id ?? "—"}</Td>
                <Td>{new Date(p.created_at).toLocaleString()}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </section>
    </div>
  );
}

function Table({ children }: { children: React.ReactNode }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-neutral-200 bg-white">
      <table className="min-w-full divide-y divide-neutral-200 text-sm">{children}</table>
    </div>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-neutral-500 bg-neutral-50">
      {children}
    </th>
  );
}

function Td({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <td className={`px-4 py-3 align-top text-neutral-700 ${className}`}>{children}</td>;
}

function EmptyRow({ colSpan, label }: { colSpan: number; label: string }) {
  return (
    <tr>
      <td colSpan={colSpan} className="px-4 py-6 text-center text-neutral-500">
        {label}
      </td>
    </tr>
  );
}

function StatusPill({ status }: { status: PaymentStatus | PayoutStatus }) {
  const tone =
    status === "failed"
      ? "bg-red-100 text-red-700"
      : status === "succeeded" || status === "paid"
        ? "bg-green-100 text-green-700"
        : status === "refunded" || status === "partially_refunded" || status === "canceled"
          ? "bg-neutral-100 text-neutral-600"
          : "bg-amber-100 text-amber-700";
  return <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${tone}`}>{status}</span>;
}
