-- Done marketplace — RLS as the real authorization boundary.
-- Centralized eligibility functions referenced from every policy that needs them.

-- ============================================================================
-- Centralized eligibility functions
-- ============================================================================

create or replace function is_approved_doer(uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from doer_profiles
    where user_id = uid and status = 'approved'
  );
$$;

create or replace function is_admin(uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select p.is_admin from profiles p where p.id = uid), false);
$$;

-- ============================================================================
-- Pricing — centralized, integer cents, server-recomputed on every write.
-- Platform fee is 20% of price, floor rounding; doer keeps the remainder.
-- ============================================================================

create or replace function compute_task_pricing(
  p_task_type_id uuid,
  p_quantity numeric,
  p_addon_ids uuid[]
)
returns table (price_cents integer, platform_fee_cents integer, doer_payout_cents integer)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_base integer;
  v_min integer;
  v_per_unit integer;
  v_model pricing_model;
  v_price integer;
  v_addons_total integer;
  v_fee integer;
begin
  select base_price_cents, min_price_cents, price_per_unit_cents, pricing_model
  into v_base, v_min, v_per_unit, v_model
  from task_types where id = p_task_type_id and active = true;

  if not found then
    raise exception 'invalid or inactive task_type_id';
  end if;

  select coalesce(sum(price_cents), 0) into v_addons_total
  from task_type_addons
  where id = any(coalesce(p_addon_ids, '{}')) and task_type_id = p_task_type_id and active = true;

  case v_model
    when 'flat' then
      v_price := v_base;
    when 'hourly', 'quantity', 'distance' then
      v_price := v_base + (coalesce(v_per_unit, 0) * greatest(coalesce(p_quantity, 1), 0))::integer;
    else
      -- doer_quote / custom_quote / minimum_charge: base acts as the starting minimum for MVP
      v_price := v_base;
  end case;

  v_price := v_price + v_addons_total;
  v_price := greatest(v_price, v_min);

  v_fee := floor(v_price * 0.20)::integer;

  return query select v_price, v_fee, (v_price - v_fee);
end;
$$;

-- ============================================================================
-- updated_at helper already created in 0001; triggers below add business rules
-- ============================================================================

-- Always recompute pricing server-side; a client-supplied price_cents is never trusted.
create or replace function tasks_recompute_pricing()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  computed record;
begin
  select * into computed
  from compute_task_pricing(new.task_type_id, new.quantity, new.selected_addon_ids);

  new.price_cents := computed.price_cents;
  new.platform_fee_cents := computed.platform_fee_cents;
  new.doer_payout_cents := computed.doer_payout_cents;

  if tg_op = 'INSERT' then
    -- denormalize requires_photo_proof from task_type at creation time
    select requires_photo_proof into new.requires_photo_proof
    from task_types where id = new.task_type_id;
  end if;

  return new;
end;
$$;

create trigger tasks_recompute_pricing_trg
  before insert or update of task_type_id, quantity, selected_addon_ids on tasks
  for each row execute function tasks_recompute_pricing();

-- Lock immutable fields (requester never changes after creation; service role exempt).
create or replace function tasks_lock_immutable_fields()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.role() = 'service_role' then
    return new;
  end if;

  if new.requester_id is distinct from old.requester_id then
    raise exception 'requester_id is immutable';
  end if;
  if new.task_type_id is distinct from old.task_type_id then
    raise exception 'task_type_id is immutable';
  end if;
  if new.currency is distinct from old.currency then
    raise exception 'currency is immutable';
  end if;

  -- doer_id may only move from null -> auth.uid() (the accept/claim action),
  -- or be cleared back to null by the requester/doer/admin (requeue paths).
  if old.doer_id is null and new.doer_id is not null then
    if new.doer_id <> auth.uid() or not is_approved_doer(auth.uid()) then
      raise exception 'only an approved doer may claim a task for themselves';
    end if;
    if old.status <> 'matching' or new.status <> 'accepted' then
      raise exception 'claiming a task must transition matching -> accepted';
    end if;
  end if;

  return new;
end;
$$;

create trigger tasks_lock_immutable_fields_trg
  before update on tasks
  for each row execute function tasks_lock_immutable_fields();

-- ============================================================================
-- Enable RLS everywhere
-- ============================================================================

alter table profiles enable row level security;
alter table doer_profiles enable row level security;
alter table doer_stripe_accounts enable row level security;
alter table categories enable row level security;
alter table task_types enable row level security;
alter table task_type_addons enable row level security;
alter table service_areas enable row level security;
alter table tasks enable row level security;
alter table task_status_history enable row level security;
alter table payments enable row level security;
alter table payouts enable row level security;
alter table disputes enable row level security;
alter table reviews enable row level security;
alter table notifications enable row level security;

-- ============================================================================
-- profiles
-- ============================================================================

create policy profiles_select on profiles for select
  using (
    id = auth.uid()
    or is_admin(auth.uid())
    or exists (
      select 1 from tasks t
      where (t.requester_id = auth.uid() and t.doer_id = profiles.id)
         or (t.doer_id = auth.uid() and t.requester_id = profiles.id)
    )
  );

create policy profiles_update_own on profiles for update
  using (id = auth.uid())
  with check (id = auth.uid());

create or replace function profiles_lock_privileged_fields()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.role() = 'service_role' then
    return new;
  end if;
  if new.is_admin is distinct from old.is_admin then
    raise exception 'is_admin cannot be changed by the client';
  end if;
  return new;
end;
$$;

create trigger profiles_lock_privileged_fields_trg
  before update on profiles
  for each row execute function profiles_lock_privileged_fields();

-- ============================================================================
-- doer_profiles
-- ============================================================================

create policy doer_profiles_select on doer_profiles for select
  using (user_id = auth.uid() or is_admin(auth.uid()));

create policy doer_profiles_insert_own on doer_profiles for insert
  with check (user_id = auth.uid());

create policy doer_profiles_update on doer_profiles for update
  using (user_id = auth.uid() or is_admin(auth.uid()))
  with check (user_id = auth.uid() or is_admin(auth.uid()));

create or replace function doer_profiles_lock_privileged_fields()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.role() = 'service_role' or is_admin(auth.uid()) then
    return new;
  end if;
  if new.status is distinct from old.status
     or new.identity_verified is distinct from old.identity_verified
     or new.background_check_status is distinct from old.background_check_status
     or new.rating_avg is distinct from old.rating_avg
     or new.rating_count is distinct from old.rating_count then
    raise exception 'trust/verification fields can only be changed by admin or the system';
  end if;
  return new;
end;
$$;

create trigger doer_profiles_lock_privileged_fields_trg
  before update on doer_profiles
  for each row execute function doer_profiles_lock_privileged_fields();

-- keep profiles.is_doer in sync when someone applies
create or replace function sync_profile_is_doer()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update profiles set is_doer = true where id = new.user_id;
  return new;
end;
$$;

create trigger doer_profiles_sync_is_doer_trg
  after insert on doer_profiles
  for each row execute function sync_profile_is_doer();

-- ============================================================================
-- doer_stripe_accounts
-- ============================================================================

create policy doer_stripe_accounts_select on doer_stripe_accounts for select
  using (user_id = auth.uid() or is_admin(auth.uid()));

create policy doer_stripe_accounts_insert_own on doer_stripe_accounts for insert
  with check (user_id = auth.uid());

create policy doer_stripe_accounts_update_own on doer_stripe_accounts for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create or replace function doer_stripe_accounts_lock_status_fields()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.role() = 'service_role' then
    return new;
  end if;
  if new.charges_enabled is distinct from old.charges_enabled
     or new.payouts_enabled is distinct from old.payouts_enabled
     or new.details_submitted is distinct from old.details_submitted then
    raise exception 'connect account status fields are set by the webhook only';
  end if;
  return new;
end;
$$;

create trigger doer_stripe_accounts_lock_status_fields_trg
  before update on doer_stripe_accounts
  for each row execute function doer_stripe_accounts_lock_status_fields();

-- ============================================================================
-- categories / task_types / task_type_addons — public read (active only for
-- anonymous/non-admin), admin-managed writes
-- ============================================================================

create policy categories_select on categories for select
  using (active = true or is_admin(auth.uid()));
create policy categories_admin_write on categories for all
  using (is_admin(auth.uid())) with check (is_admin(auth.uid()));

create policy task_types_select on task_types for select
  using (active = true or is_admin(auth.uid()));
create policy task_types_admin_write on task_types for all
  using (is_admin(auth.uid())) with check (is_admin(auth.uid()));

create policy task_type_addons_select on task_type_addons for select
  using (active = true or is_admin(auth.uid()));
create policy task_type_addons_admin_write on task_type_addons for all
  using (is_admin(auth.uid())) with check (is_admin(auth.uid()));

create policy service_areas_select on service_areas for select
  using (active = true or is_admin(auth.uid()));
create policy service_areas_admin_write on service_areas for all
  using (is_admin(auth.uid())) with check (is_admin(auth.uid()));

-- ============================================================================
-- tasks
-- ============================================================================

create policy tasks_select on tasks for select
  using (
    requester_id = auth.uid()
    or doer_id = auth.uid()
    or is_admin(auth.uid())
    -- open-pool visibility: every approved doer sees every open task.
    -- preference toggles affect sort order only, never visibility (see doc).
    or (status = 'matching' and doer_id is null and is_approved_doer(auth.uid()))
  );

create policy tasks_insert on tasks for insert
  with check (requester_id = auth.uid());

create policy tasks_update on tasks for update
  using (
    requester_id = auth.uid()
    or doer_id = auth.uid()
    or is_admin(auth.uid())
    or (status = 'matching' and doer_id is null and is_approved_doer(auth.uid()))
  )
  with check (
    requester_id = auth.uid()
    or doer_id = auth.uid()
    or is_admin(auth.uid())
  );

create policy tasks_admin_delete on tasks for delete
  using (is_admin(auth.uid()));

-- ============================================================================
-- task_status_history
-- ============================================================================

create policy task_status_history_select on task_status_history for select
  using (
    is_admin(auth.uid())
    or exists (
      select 1 from tasks t where t.id = task_id
      and (t.requester_id = auth.uid() or t.doer_id = auth.uid())
    )
  );

create policy task_status_history_insert on task_status_history for insert
  with check (
    (changed_by_user = auth.uid() or is_admin(auth.uid()))
    and exists (
      select 1 from tasks t where t.id = task_id
      and (t.requester_id = auth.uid() or t.doer_id = auth.uid() or is_admin(auth.uid()))
    )
  );

-- ============================================================================
-- payments / payouts — read-only for clients; all writes via service role
-- (Stripe webhook + trusted server actions), mirroring what RLS would allow.
-- ============================================================================

create policy payments_select on payments for select
  using (requester_id = auth.uid() or is_admin(auth.uid()));

create policy payouts_select on payouts for select
  using (doer_id = auth.uid() or is_admin(auth.uid()));

-- ============================================================================
-- disputes
-- ============================================================================

create policy disputes_select on disputes for select
  using (
    is_admin(auth.uid())
    or raised_by = auth.uid()
    or exists (
      select 1 from tasks t where t.id = task_id
      and (t.requester_id = auth.uid() or t.doer_id = auth.uid())
    )
  );

create policy disputes_insert on disputes for insert
  with check (
    raised_by = auth.uid()
    and exists (
      select 1 from tasks t where t.id = task_id
      and (t.requester_id = auth.uid() or t.doer_id = auth.uid())
    )
  );

create policy disputes_admin_update on disputes for update
  using (is_admin(auth.uid()))
  with check (is_admin(auth.uid()));

-- ============================================================================
-- reviews — tied only to completed tasks
-- ============================================================================

create policy reviews_select on reviews for select
  using (
    is_admin(auth.uid())
    or rater_id = auth.uid()
    or ratee_id = auth.uid()
    or exists (
      select 1 from tasks t where t.id = task_id
      and (t.requester_id = auth.uid() or t.doer_id = auth.uid())
    )
  );

create policy reviews_insert on reviews for insert
  with check (
    rater_id = auth.uid()
    and exists (
      select 1 from tasks t
      where t.id = task_id
        and t.status in ('completed', 'payout_pending', 'payout_completed')
        and (
          (t.requester_id = auth.uid() and t.doer_id = ratee_id)
          or (t.doer_id = auth.uid() and t.requester_id = ratee_id)
        )
    )
  );

-- ============================================================================
-- notifications — read own, mark own read; all inserts via service role
-- ============================================================================

create policy notifications_select on notifications for select
  using (user_id = auth.uid());

create policy notifications_update_own on notifications for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
