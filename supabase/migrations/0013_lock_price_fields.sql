-- Closes a real gap: price_cents/platform_fee_cents/doer_payout_cents were
-- never protected by a lock trigger the way tip_cents (0006) and
-- discount_cents/promo_code (0011) already are. tasks_recompute_pricing_trg
-- only fires "before insert or update of (task_type_id, quantity,
-- selected_addon_ids)" — a bare `update tasks set price_cents = ...` from
-- any authenticated client (the task's own Requester included) was never
-- intercepted by anything, since RLS's tasks_update policy only checks row
-- ownership, not which columns are being written. RLS is the real boundary
-- for WHO can write a row; it was never meant to be the boundary for WHICH
-- columns — that job belongs to a lock trigger, exactly like the tip and
-- discount locks already have.
--
-- Confirmed exploitable against a real Postgres instance running the full
-- migration chain, before this fix: as the task's own Requester (via
-- `authenticated` role + RLS, no service key), `update tasks set
-- price_cents = 1, platform_fee_cents = 0, doer_payout_cents = 1 where id =
-- ...` succeeded outright — a live violation of the architecture doc's
-- "never trust a client-supplied price" rule, not just a theoretical one.
-- A Requester could have zeroed out their own task's price moments before
-- confirmCompletion() reads price_cents off the row to build the Stripe
-- Checkout charge amount.
--
-- These three columns are 100% server-computed by compute_task_pricing()
-- via tasks_recompute_pricing_trg on create (or task_type/quantity/addon
-- change — not currently exercised post-creation by any app, but the lock
-- below doesn't interfere with it: a statement that never names these
-- columns in its own SET list never fires this trigger, regardless of what
-- another BEFORE trigger goes on to compute for NEW.price_cents) and must
-- never be directly writable by a requester/doer/admin client. Only a
-- genuine service-role write (the same carve-out already used by
-- tasks_lock_immutable_fields, tasks_lock_tip, and the promo lock) bypasses
-- this — e.g. a future admin price-correction tool that goes through the
-- service-role client, same as every other privileged admin action already
-- does in this codebase.

create or replace function tasks_lock_price_fields()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.role() = 'service_role' then
    return new;
  end if;

  raise exception 'price_cents, platform_fee_cents, and doer_payout_cents are computed server-side and cannot be written directly';
end;
$$;

create trigger tasks_lock_price_fields_trg
  before update of price_cents, platform_fee_cents, doer_payout_cents on tasks
  for each row execute function tasks_lock_price_fields();
