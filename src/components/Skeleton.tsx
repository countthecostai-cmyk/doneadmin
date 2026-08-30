// Shared route-loading skeleton primitives. Used by each route segment's
// loading.tsx (Next.js App Router) so navigating to a data-fetching page
// shows an immediate, layout-matched placeholder instead of a blank pause.
// Purely presentational — no data, no client state.

function cx(...classes: Array<string | false | undefined>) {
  return classes.filter(Boolean).join(" ");
}

/** A single pulsing bar. */
export function SkeletonBar({ className }: { className?: string }) {
  return <div className={cx("animate-pulse rounded bg-neutral-200", className)} />;
}

/** A pulsing circle, e.g. for an avatar or icon placeholder. */
export function SkeletonCircle({ className }: { className?: string }) {
  return <div className={cx("animate-pulse rounded-full bg-neutral-200", className)} />;
}

/**
 * One row inside a `divide-y rounded-lg border border-neutral-200 bg-white`
 * list — matches the task/job/ticket list rows used across every dashboard,
 * pool, and history page.
 */
export function SkeletonListRow() {
  return (
    <div className="flex items-center justify-between px-4 py-3">
      <div className="space-y-2">
        <SkeletonBar className="h-4 w-40" />
        <SkeletonBar className="h-3 w-28" />
      </div>
      <div className="space-y-2 text-right">
        <SkeletonBar className="ml-auto h-4 w-16" />
        <SkeletonBar className="ml-auto h-3 w-20" />
      </div>
    </div>
  );
}

/** A full list card — the standard container these rows live in. */
export function SkeletonList({ rows = 3 }: { rows?: number }) {
  return (
    <div
      className="divide-y divide-neutral-200 overflow-hidden rounded-lg border border-neutral-200 bg-white"
      aria-hidden="true"
    >
      {Array.from({ length: rows }).map((_, i) => (
        <SkeletonListRow key={i} />
      ))}
    </div>
  );
}

/** A section heading placeholder to pair above a SkeletonList. */
export function SkeletonSectionHeading({ className }: { className?: string }) {
  return <SkeletonBar className={cx("h-5 w-32", className)} />;
}

/**
 * A page-level loading wrapper: renders visually hidden status text for
 * assistive tech (so a screen reader announces "Loading…" instead of
 * silence) and marks the region busy, then renders the visual skeleton.
 */
export function SkeletonPage({ children }: { children: React.ReactNode }) {
  return (
    <div role="status" aria-live="polite" aria-busy="true">
      <span className="sr-only">Loading…</span>
      {children}
    </div>
  );
}

/** A detail-page header placeholder — title + status pill + a couple of meta lines. */
export function SkeletonDetailHeader() {
  return (
    <div className="space-y-3" aria-hidden="true">
      <div className="flex items-center justify-between">
        <SkeletonBar className="h-6 w-48" />
        <SkeletonBar className="h-6 w-20 rounded-full" />
      </div>
      <SkeletonBar className="h-4 w-64" />
    </div>
  );
}

/** A block of stacked lines, e.g. for a message thread or note body. */
export function SkeletonLines({ count = 3 }: { count?: number }) {
  return (
    <div className="space-y-2" aria-hidden="true">
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonBar key={i} className={cx("h-3", i === count - 1 ? "w-2/3" : "w-full")} />
      ))}
    </div>
  );
}

/** A form-field placeholder — label line + input-shaped block. */
export function SkeletonField({ labelWidth = "w-24" }: { labelWidth?: string }) {
  return (
    <div className="space-y-1.5" aria-hidden="true">
      <SkeletonBar className={cx("h-3", labelWidth)} />
      <SkeletonBar className="h-10 w-full rounded-lg" />
    </div>
  );
}

/** A plain white card block placeholder, e.g. for a status/summary panel. */
export function SkeletonCard({ className }: { className?: string }) {
  return (
    <div
      className={cx("rounded-lg border border-neutral-200 bg-white p-6", className)}
      aria-hidden="true"
    >
      <SkeletonLines count={2} />
    </div>
  );
}

/** A data-table placeholder matching the receipts/admin table shell. */
export function SkeletonTable({ rows = 5, cols = 5 }: { rows?: number; cols?: number }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-neutral-200 bg-white" aria-hidden="true">
      <table className="w-full min-w-[640px] text-sm">
        <thead className="border-b border-neutral-200 bg-neutral-50">
          <tr>
            {Array.from({ length: cols }).map((_, i) => (
              <th key={i} className="px-4 py-2">
                <SkeletonBar className="h-3 w-16" />
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-neutral-100">
          {Array.from({ length: rows }).map((_, r) => (
            <tr key={r}>
              {Array.from({ length: cols }).map((_, c) => (
                <td key={c} className="px-4 py-3">
                  <SkeletonBar className="h-3 w-20" />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
