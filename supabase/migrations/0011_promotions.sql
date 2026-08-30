-- Done marketplace — promotions (discount codes).
--
-- Closes a real gap against the architecture doc's admin-tooling checklist
-- ("Requesters, Doers, task types/categories, pricing/fees, transactions,
-- payouts, refunds, disputes, reviews, service areas, promotions, support")
-- — promotions had no schema at all before this migration.
--
-- Business rule, deliberately explicit rather than silently assumed: a
-- promo discount is subtracted from what the Requester pays, never from
-- what the Doer is owed. The Doer's price_cents/doer_payout_cents split
-- (compute_task_pricing, 0002) is completely untouched by a promo code —
-- Done's platform fee absorbs the discount. This mirrors the tip rule
-- (100% Doer-owned, 0006) in spirit: promos and tips both sit outside the
-- fee-split math, on opposite sides of it.

-- ============================================================================
-- promotions — admin-managed discount codes
-- ============================================================================

create table promotions (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  description text,
  discount_type text not null check (discount_type in ('percent', 'fixed')),
  -- percent: 1-100 (% off). fixed: cents off, must be positive.
  discount_value integer not null check (discount_value > 0),
  -- caps a percent discount's absolute dollar exposure; ignored for 'fixed'.
  max_discount_cents integer check (max_discount_cents is null or max_discount_cents > 0),
  min_subtotal_cents integer not null default 0 check (min_subtotal_cents >= 0),
  max_redemptions integer check (max_redemptions is null or max_redemptions > 0),
  per_user_limit integer not null default 1 check (per_user_limit > 0),
  active boolean not null default true,
  starts_at timestamptz,
  expires_at timestamptz,
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint promotions_percent_range check (
    discount_type <> 'percent' or discount_value <= 100
  ),
  constraint promotions_date_range check (
    starts_at is null or expires_at is null or starts_at < expires_at
  )
);

create index promotions_code_idx on promotions (code);
create index promotions_active_idx on promotions (active) where active = true;

alter table promotions enable row level security;

-- Anyone signed in can look up an active, currently-running code by its
-- exact code (RLS filters rows, not query shape — same open-active-rows
-- shape as service_areas_select in 0002). Admins see everything, including
-- inactive/expired/future codes, for management.
create policy promotions_select on promotions for select
  using (
    is_admin(auth.uid())
    or (
      active = true
      and (starts_at is null or starts_at <= now())
      and (expires_at is null or expires_at > now())
    )
  );

create policy promotions_admin_write on promotions for all
  using (is_admin(auth.uid())) with check (is_admin(auth.uid()));

-- ============================================================================
-- promotion_redemptions — append-only ledger of who used which code on which
-- task. redemption_count is deliberately NOT a mutable counter column on
-- promotions (that would need the same atomic .eq('count', expected) guard
-- as task-status writes, just to avoid a double-redeem race) — counting
-- rows in this table under a row lock (enforce_promotion_limits below) is
-- the equivalent guarantee, Postgres-native.
-- ============================================================================

create table promotion_redemptions (
  id uuid primary key default gen_random_uuid(),
  promotion_id uuid not null references promotions(id) on delete cascade,
  task_id uuid not null references tasks(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete restrict,
  discount_cents integer not null check (discount_cents > 0),
  created_at timestamptz not null default now(),
  unique (task_id) -- one promo per task
);

create index promotion_redemptions_promo_idx on promotion_redemptions (promotion_id);
create index promotion_redemptions_user_idx on promotion_redemptions (promotion_id, user_id);

alter table promotion_redemptions enable row level security;

create policy promotion_redemptions_select on promotion_redemptions for select
  using (user_id = auth.uid() or is_admin(auth.uid()));

-- A Requester may redeem a code only on their own task, attributed to
-- themselves — never on someone else's task_id, never as another user.
create policy promotion_redemptions_insert on promotion_redemptions for insert
  with check (
    user_id = auth.uid()
    and exists (select 1 from tasks t where t.id = task_id and t.requester_id = auth.uid())
  );

-- A Requester may un-apply a code they haven't paid for yet, freeing their
-- redemption slot back up (this is a draft-state action, not a rewrite of
-- settled history — compare to admin_audit_log, which is append-only
-- forever because it records what an admin *did*, not a still-editable
-- order line). Locked the moment the task leaves the pre-payment set,
-- same boundary as tasks_lock_discount below.
create policy promotion_redemptions_delete on promotion_redemptions for delete
  using (
    user_id = auth.uid()
    and exists (
      select 1 from tasks t
      where t.id = task_id
        and t.requester_id = auth.uid()
        and t.status not in ('payout_pending', 'payout_completed', 'disputed', 'refunded',
                              'cancelled', 'declined', 'expired')
    )
  );

-- Atomicity for the redemption caps: lock the promotion row so two
-- concurrent redemptions of a nearly-exhausted code can't both slip past
-- the max_redemptions check (the row lock serializes them — the second
-- waiter re-evaluates the count after the first commits). Also re-checks
-- everything the app layer already checked, as defense in depth against a
-- direct API call that skips the friendly-error path in applyPromoCode.
create or replace function enforce_promotion_limits()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  promo record;
  task_price integer;
  redemption_count integer;
  user_redemption_count integer;
begin
  select * into promo from promotions where id = new.promotion_id for update;
  if promo is null then
    raise exception 'promotion not found';
  end if;
  if not promo.active then
    raise exception 'this code is no longer active';
  end if;
  if promo.starts_at is not null and promo.starts_at > now() then
    raise exception 'this code is not active yet';
  end if;
  if promo.expires_at is not null and promo.expires_at <= now() then
    raise exception 'this code has expired';
  end if;

  select price_cents into task_price from tasks where id = new.task_id;
  if task_price is null then
    raise exception 'task not found';
  end if;
  if task_price < promo.min_subtotal_cents then
    raise exception 'task subtotal does not meet this code''s minimum';
  end if;
  if new.discount_cents > task_price then
    raise exception 'discount cannot exceed the task subtotal';
  end if;

  if promo.max_redemptions is not null then
    select count(*) into redemption_count
    from promotion_redemptions where promotion_id = new.promotion_id;
    if redemption_count >= promo.max_redemptions then
      raise exception 'this code has reached its redemption limit';
    end if;
  end if;

  select count(*) into user_redemption_count
  from promotion_redemptions where promotion_id = new.promotion_id and user_id = new.user_id;
  if user_redemption_count >= promo.per_user_limit then
    raise exception 'you have already used this code the maximum number of times';
  end if;

  return new;
end;
$$;

create trigger enforce_promotion_limits_trg
  before insert on promotion_redemptions
  for each row execute function enforce_promotion_limits();

-- ============================================================================
-- tasks — the applied code + its dollar discount, additive to the existing
-- price/tip columns, same "separate field, locked once payment starts"
-- shape as tip_cents (0006).
-- ============================================================================

alter table tasks add column promo_code text;
alter table tasks add column discount_cents integer not null default 0 check (discount_cents >= 0);

create or replace function tasks_lock_discount()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.role() = 'service_role' then
    return new;
  end if;

  if new.promo_code is distinct from old.promo_code or new.discount_cents is distinct from old.discount_cents then
    if new.requester_id <> auth.uid() then
      raise exception 'promo code can only be set by the Requester';
    end if;
    if old.status in ('payout_pending', 'payout_completed', 'disputed', 'refunded',
                       'cancelled', 'declined', 'expired') then
      raise exception 'promo code can no longer be changed once payment has started';
    end if;
  end if;

  return new;
end;
$$;

create trigger tasks_lock_discount_trg
  before update of promo_code, discount_cents on tasks
  for each row execute function tasks_lock_discount();

comment on column tasks.discount_cents is
  'Subtracted from price_cents+tip_cents at Confirm & Pay (see totalChargeCents in pricing.ts). Never affects doer_payout_cents — the platform fee absorbs promo discounts, the Doer is always paid their full split.';

-- Live-updating admin settings view, same pattern as service_areas.
alter publication supabase_realtime add table promotions;
