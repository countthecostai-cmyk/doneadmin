# Done Admin

The **internal admin dashboard** for the Done marketplace — one of three
separate Next.js apps (Done = customer, Doer = worker, Done Admin =
internal dashboard) that share ONE Supabase backend. User/Doer management
(including suspend), live job monitoring, full task history, disputes &
refunds, payments/payouts/revenue analytics, and platform settings
(categories & task types).

## Stack

- Next.js (App Router, Turbopack, TypeScript) + Tailwind
- Supabase (Postgres, Auth, RLS, Storage, Realtime) — shared with the Done and Doer apps
- Stripe (refunds on disputes — Checkout and the webhook live in the Done app)
- Deploy: GitHub `main` → Vercel (git-linked auto-deploy)

## Local setup

```bash
npm install
cp .env.local.example .env.local   # fill in Supabase + Stripe keys
npm run dev
```

## Access control

`src/lib/require-admin.ts` + `src/app/admin/layout.tsx` gate every `/admin/*`
route server-side on `profiles.is_admin`. That's a UX nicety, not the real
boundary — Row-Level Security (`is_admin(auth.uid())` in the policies) is
what actually stops a non-admin from reading or writing admin-only data,
per the architecture doc's "RLS is the real boundary" rule. Admin writes use
the normal RLS-scoped client, not a service-role bypass — migration 0007
grants admin a real RLS path onto other users' `profiles` rows so that stays
true even for cross-user actions like suspending an account.

## Database

Schema, RLS policies, and storage bucket policies live in `supabase/migrations/`,
applied in order (`0001` → `0008`) against the SAME Supabase project used by
the Done and Doer apps. See `supabase/migrations/*.sql` for the task
lifecycle state machine, RLS-as-boundary patterns, the payout trust gate,
messaging, tips, Doer availability, account suspension, and rating
aggregation.

The authoritative state machine lives in `src/lib/task-state-machine.ts`
and is identical across all three apps by design. Every status-changing
write goes through `src/lib/task-transitions.ts` (atomic conditional
update + status-history log). Admin bypasses the actor check on a
transition (e.g. force-moving a stuck task) but never the structural
`TRANSITIONS` graph — see `src/app/admin/tasks/[id]/actions.ts`.

## Disputes & refunds

Resolving a dispute as "refund" (`src/app/admin/disputes/actions.ts`) looks
up the task's succeeded `payments` row and calls Stripe's refund API before
moving the task to `refunded` — if the Stripe call fails, the task is left
alone rather than silently marked refunded with no money having moved.

## Realtime

`src/lib/realtime.ts` wraps Supabase Realtime so the live task monitor,
payments, and payouts views update without a manual refresh — the same
shared helper used by the Done and Doer apps.

## Scripts

- `npm run dev` — local dev server
- `npm run lint` — ESLint
- `npm run typecheck` — TypeScript, no emit
- `npm run build` — production build
