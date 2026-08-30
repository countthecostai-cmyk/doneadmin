import { SkeletonBar, SkeletonTable } from "@/components/Skeleton";

export default function UsersLoading() {
  return (
    <div className="space-y-6" role="status" aria-live="polite" aria-busy="true">
      <span className="sr-only">Loading…</span>
      <h1 className="text-2xl font-semibold text-neutral-900">Users</h1>
      <SkeletonBar className="h-9 w-64 rounded-lg" />
      <SkeletonTable rows={8} cols={6} />
    </div>
  );
}
