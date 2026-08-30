import { SkeletonTable } from "@/components/Skeleton";

export default function DoersLoading() {
  return (
    <div className="space-y-6" role="status" aria-live="polite" aria-busy="true">
      <span className="sr-only">Loading…</span>
      <h1 className="text-2xl font-semibold text-neutral-900">Doer applications</h1>
      <SkeletonTable rows={6} cols={5} />
    </div>
  );
}
