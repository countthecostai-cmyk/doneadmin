import { SkeletonBar, SkeletonTable } from "@/components/Skeleton";

export default function PaymentsLoading() {
  return (
    <div className="space-y-6" role="status" aria-live="polite" aria-busy="true">
      <span className="sr-only">Loading…</span>
      <h1 className="text-2xl font-semibold text-neutral-900">Payments &amp; payouts</h1>
      <SkeletonBar className="h-9 w-64 rounded-lg" />
      <SkeletonTable rows={6} cols={6} />
      <SkeletonTable rows={4} cols={5} />
    </div>
  );
}
