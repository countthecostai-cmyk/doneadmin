import { SkeletonPage } from "@/components/Skeleton";

// Root-level fallback: /admin/layout.tsx runs an async `requireAdmin()`
// Supabase check before it returns any JSX (including the max-w-6xl
// wrapper), so per-route loading.tsx files below it can only cover a
// page's own fetch — they can't cover that gate. This boundary, one level
// up, covers the gate too on first navigation into any route.
export default function RootLoading() {
  return (
    <SkeletonPage>
      <div className="flex min-h-[60vh] items-center justify-center">
        <div
          className="h-8 w-8 animate-spin rounded-full border-2 border-neutral-200 border-t-neutral-900"
          aria-hidden="true"
        />
      </div>
    </SkeletonPage>
  );
}
