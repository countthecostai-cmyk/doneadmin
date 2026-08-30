import { SkeletonBar, SkeletonList } from "@/components/Skeleton";

export default function AdminSupportLoading() {
  return (
    <div className="space-y-6" role="status" aria-live="polite" aria-busy="true">
      <span className="sr-only">Loading…</span>
      <h1 className="text-2xl font-semibold text-neutral-900">Support</h1>
      <SkeletonBar className="h-9 w-full max-w-lg rounded-lg" />
      <SkeletonList rows={6} />
    </div>
  );
}
