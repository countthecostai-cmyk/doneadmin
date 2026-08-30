import { SkeletonBar, SkeletonList } from "@/components/Skeleton";

export default function SettingsLoading() {
  return (
    <div className="space-y-8" role="status" aria-live="polite" aria-busy="true">
      <span className="sr-only">Loading…</span>
      <div>
        <h1 className="text-2xl font-semibold text-neutral-900">Platform settings</h1>
        <p className="mt-1 text-sm text-neutral-500">
          Categories and task types are data, not code — adding a new one here is all it takes.
        </p>
      </div>
      {["Categories", "Task types", "Service areas", "Promotions"].map((label) => (
        <section key={label} className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-medium text-neutral-900">{label}</h2>
            <SkeletonBar className="h-8 w-28 rounded-lg" />
          </div>
          <SkeletonList rows={3} />
        </section>
      ))}
    </div>
  );
}
