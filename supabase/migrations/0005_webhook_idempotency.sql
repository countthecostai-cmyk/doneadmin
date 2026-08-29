-- Stripe can and will redeliver webhook events. This table makes the
-- webhook handler idempotent: a duplicate delivery hits the unique
-- constraint on `id` and is treated as already-processed.

create table processed_webhook_events (
  id text primary key, -- Stripe event.id
  type text not null,
  processed_at timestamptz not null default now()
);

alter table processed_webhook_events enable row level security;
-- No policies: only the service-role client (which bypasses RLS) ever
-- touches this table. Deny-by-default for every other role.
