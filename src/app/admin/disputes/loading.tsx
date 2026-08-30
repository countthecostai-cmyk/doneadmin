import { SkeletonList } from "@/components/Skeleton";

export default function DisputesLoading() {
  return (
    <div className="space-y-6" role="status" aria-live="polite" aria-busy="true">
      <span className="sr-only">Loading…</span>
      <h1 className="text-2xl font-semibold text-neutral-900">Open disputes</h1>
      <SkeletonList rows={4} />
    </div>
  );
}
