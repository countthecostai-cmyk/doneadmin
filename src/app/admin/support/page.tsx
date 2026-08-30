import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { STATUS_LABELS, CATEGORY_LABELS } from "@/lib/support-ticket-state-machine";
import type { Profile, SupportTicket } from "@/lib/database.types";

export const dynamic = "force-dynamic";

const STATUS_TONE: Record<SupportTicket["status"], string> = {
  open: "bg-blue-100 text-blue-700",
  in_progress: "bg-amber-100 text-amber-700",
  resolved: "bg-green-100 text-green-700",
  closed: "bg-neutral-100 text-neutral-500",
};

const TABS: { key: string; label: string }[] = [
  { key: "needs_attention", label: "Needs attention" },
  { key: "open", label: "Open" },
  { key: "in_progress", label: "In progress" },
  { key: "resolved", label: "Resolved" },
  { key: "closed", label: "Closed" },
  { key: "all", label: "All" },
];

export default async function AdminSupportPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const { tab: rawTab } = await searchParams;
  const tab = rawTab ?? "needs_attention";
  const supabase = await createClient();

  let query = supabase.from("support_tickets").select("*").order("updated_at", { ascending: false });
  if (tab === "needs_attention") {
    query = query.in("status", ["open", "in_progress"]);
  } else if (tab !== "all") {
    query = query.eq("status", tab);
  }
  const { data } = await query;
  const tickets = (data as SupportTicket[]) ?? [];

  const creatorIds = [...new Set(tickets.map((t) => t.created_by))];
  const { data: creatorsData } =
    creatorIds.length > 0
      ? await supabase.from("profiles").select("id, full_name").in("id", creatorIds)
      : { data: [] as Pick<Profile, "id" | "full_name">[] };
  const creatorNames = new Map(
    ((creatorsData as Pick<Profile, "id" | "full_name">[]) ?? []).map((p) => [p.id, p.full_name])
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-neutral-900">Support</h1>
        <p className="mt-1 text-sm text-neutral-500">
          Account, billing, safety, and app-bug reports from Requesters and Doers — separate from task-specific{" "}
          <Link href="/admin/disputes" className="underline">
            disputes
          </Link>
          .
        </p>
      </div>

      <div className="flex flex-wrap gap-2 border-b border-neutral-200 pb-3">
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={`/admin/support?tab=${t.key}`}
            className={`rounded-full px-3 py-1.5 text-sm font-medium ${
              tab === t.key ? "bg-neutral-900 text-white" : "text-neutral-600 hover:bg-neutral-100"
            }`}
          >
            {t.label}
          </Link>
        ))}
      </div>

      <ul className="divide-y divide-neutral-100 overflow-hidden rounded-lg border border-neutral-200 bg-white">
        {tickets.length === 0 && <p className="p-4 text-sm text-neutral-500">No tickets here.</p>}
        {tickets.map((t) => (
          <li key={t.id}>
            <Link
              href={`/admin/support/${t.id}`}
              className="flex items-center justify-between gap-4 p-4 hover:bg-neutral-50"
            >
              <div className="min-w-0">
                <p className="truncate font-medium text-neutral-900">{t.subject}</p>
                <p className="text-sm text-neutral-500">
                  {creatorNames.get(t.created_by) ?? "Unknown"} ({t.created_by_role}) · {CATEGORY_LABELS[t.category]}{" "}
                  · {new Date(t.updated_at).toLocaleString()}
                </p>
              </div>
              <span className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium ${STATUS_TONE[t.status]}`}>
                {STATUS_LABELS[t.status]}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
