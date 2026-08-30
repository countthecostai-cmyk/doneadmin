"use client";

import { useEffect } from "react";

// Next.js special file: catches errors thrown by the root layout itself
// (including Nav, which is an async server component doing a Supabase
// call on every navigation) — the segment-level error.tsx cannot, since
// it renders inside the layout. Must render its own <html>/<body>: this
// fully replaces the root layout when it's the one that failed.
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <html lang="en">
      <body className="min-h-screen bg-neutral-50 text-neutral-900 antialiased">
        <div className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center px-6 text-center">
          <h1 className="mb-2 text-xl font-semibold text-neutral-900">Something went wrong</h1>
          <p className="mb-6 text-sm text-neutral-500">
            {error.message || "Please try again."}
          </p>
          <button
            onClick={reset}
            className="rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800"
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
