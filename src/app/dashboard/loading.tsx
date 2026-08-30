import { SkeletonBar, SkeletonPage } from "@/components/Skeleton";

// This route sits outside admin/layout.tsx, so it isn't wrapped by that
// layout's own container — it wraps itself the same way its page.tsx does.
export default function AdminDashboardLoading() {
  return (
    <SkeletonPage>
      <div className="mx-auto max-w-6xl space-y-8 px-6 py-8">
        <div>
          <SkeletonBar className="h-8 w-48" />
          <SkeletonBar className="mt-2 h-4 w-64" />
        </div>

        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3" aria-hidden="true">
          {Array.from({ length: 7 }).map((_, i) => (
            <div key={i} className="rounded-lg border border-neutral-200 bg-white p-4">
              <SkeletonBar className="h-7 w-10" />
              <SkeletonBar className="mt-2 h-3 w-24" />
            </div>
          ))}
        </div>

        <div className="grid gap-4 sm:grid-cols-2" aria-hidden="true">
          {Array.from({ length: 7 }).map((_, i) => (
            <div key={i} className="rounded-lg border border-neutral-200 bg-white p-4">
              <SkeletonBar className="h-4 w-32" />
              <SkeletonBar className="mt-2 h-3 w-full" />
            </div>
          ))}
        </div>
      </div>
    </SkeletonPage>
  );
}
