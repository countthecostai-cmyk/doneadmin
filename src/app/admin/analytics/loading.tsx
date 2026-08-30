import { SkeletonBar } from "@/components/Skeleton";

export default function AnalyticsLoading() {
  return (
    <div className="space-y-6" role="status" aria-live="polite" aria-busy="true">
      <span className="sr-only">Loading…</span>
      <h1 className="text-2xl font-semibold text-neutral-900">Revenue &amp; marketplace analytics</h1>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4" aria-hidden="true">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-lg border border-neutral-200 bg-white p-4">
            <SkeletonBar className="h-3 w-16" />
            <SkeletonBar className="mt-2 h-6 w-20" />
          </div>
        ))}
      </div>
      <div className="rounded-lg border border-neutral-200 bg-white p-4" aria-hidden="true">
        <SkeletonBar className="h-48 w-full" />
      </div>
    </div>
  );
}
