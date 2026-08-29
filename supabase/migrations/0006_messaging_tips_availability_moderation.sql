-- Extends the shared backend for the 3-app marketplace (Done / Doer / Done Admin):
-- in-task messaging, tips, Doer availability, and platform-wide account moderation.

-- ============================================================================
-- Doer availability — simple on/off; open-pool visibility already ignores
-- category preferences per the architecture doc, this is a separate signal
-- (are they working right now at all), not a visibility filter either —
-- unavailable doers still SEE the pool, they just aren't nudged to it by
-- their own apps' default view. Keeping availability out of tasks_select
-- RLS avoids repeating the "gated visibility" bug the doc warns about.
-- ============================================================================

alter table doer_profiles add column is_available boolean not null default false;

-- ============================================================================
-- Platform-wide account moderation (Done Admin: activate/suspend/deactivate).
-- Distinct from doer_profiles.status, which is the doer-specific work
-- eligibility gate — this is the account-level kill switch admins use on
-- either a Requester or a Doer.
-- ============================================================================

alter table profiles add column is_suspended boolean not null default false;
alter table profiles add column suspended_reason text;
alter table profiles add column suspended_at timestamptz;
alter table profiles add column suspended_by uuid references profiles(id) on delete set null;

create or replace function profiles_lock_privileged_fields()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.role() = 'service_role' or is_admin(auth.uid()) then
    return new;
  end if;
  if new.is_admin is distinct from old.is_admin then
    raise exception 'is_admin cannot be changed by the client';
  end if;
  if new.is_suspended is distinct from old.is_suspended
     or new.suspended_reason is distinct from old.suspended_reason
     or new.suspended_at is distinct from old.suspended_at
     or new.suspended_by is distinct from old.suspended_by then
    raise exception 'suspension fields can only be changed by an admin';
  end if;
  return new;
end;
$$;
-- (trigger already exists from 0002, replacing the function body is enough)

-- Suspended accounts can't create tasks or claim tasks. Redefine the two
-- policies that gate those writes to add the check; is_suspended() is a
-- small centralized helper so it isn't reimplemented inline in multiple
-- policies (same pattern as is_approved_doer / is_admin).
create or replace function is_suspended(uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select p.is_suspended from profiles p where p.id = uid), false);
$$;

drop policy if exists tasks_insert on tasks;
create policy tasks_insert on tasks for insert
  with check (requester_id = auth.uid() and not is_suspended(auth.uid()));

drop policy if exists tasks_update on tasks;
create policy tasks_update on tasks for update
  using (
    requester_id = auth.uid()
    or doer_id = auth.uid()
    or is_admin(auth.uid())
    or (
      status = 'matching' and doer_id is null
      and is_approved_doer(auth.uid()) and not is_suspended(auth.uid())
    )
  )
  with check (
    requester_id = auth.uid()
    or doer_id = auth.uid()
    or is_admin(auth.uid())
  );

-- tasks_select's open-pool branch should also hide the pool from a suspended
-- doer (they can't act on it anyway) without touching their own/assigned rows.
drop policy if exists tasks_select on tasks;
create policy tasks_select on tasks for select
  using (
    requester_id = auth.uid()
    or doer_id = auth.uid()
    or is_admin(auth.uid())
    or (
      status = 'matching' and doer_id is null
      and is_approved_doer(auth.uid()) and not is_suspended(auth.uid())
    )
  );

-- ============================================================================
-- Tips — 100% to the Doer, never platform fee. Requester sets the amount
-- once, only while the task is `completed` (i.e. after the work is done and
-- proof is in, before they confirm+pay), and it locks from there. Kept as
-- its own column (not folded into price_cents) so pricing math / receipts
-- stay easy to reason about: price_cents is what the platform prices the
-- job at, tip_cents is a separate, wholly-Doer-owned amount.
-- ============================================================================

alter table tasks add column tip_cents integer not null default 0
  check (tip_cents >= 0);

create or replace function tasks_lock_tip()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.role() = 'service_role' then
    return new;
  end if;
  if new.tip_cents is distinct from old.tip_cents then
    if old.status <> 'completed' or new.requester_id <> auth.uid() then
      raise exception 'tip can only be set by the Requester while the task is completed, before confirming payment';
    end if;
  end if;
  return new;
end;
$$;

create trigger tasks_lock_tip_trg
  before update of tip_cents on tasks
  for each row execute function tasks_lock_tip();

-- Payments now cover price + tip; payouts now cover the Doer's cut + 100% of
-- the tip. Widen the amount columns' meaning via comments only — no schema
-- change needed, the webhook computes amount_cents = price+tip (payments)
-- and doer_payout_cents+tip_cents (payouts) at write time.
comment on column payments.amount_cents is 'price_cents + tip_cents actually charged to the Requester';
comment on column payouts.amount_cents is 'doer_payout_cents + tip_cents actually transferred to the Doer';

-- ============================================================================
-- In-task messaging — Requester <-> assigned Doer only. Admin may read (not
-- write) for oversight/dispute investigation, never silently — every admin
-- read is still just a normal authenticated select subject to this policy,
-- there is no separate covert admin channel.
-- ============================================================================

create table messages (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references tasks(id) on delete cascade,
  sender_id uuid not null references profiles(id) on delete cascade,
  recipient_id uuid not null references profiles(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 4000),
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index messages_task_idx on messages (task_id, created_at);
create index messages_recipient_unread_idx on messages (recipient_id) where read_at is null;

alter table messages enable row level security;

create policy messages_select on messages for select
  using (
    sender_id = auth.uid()
    or recipient_id = auth.uid()
    or is_admin(auth.uid())
  );

create policy messages_insert on messages for insert
  with check (
    sender_id = auth.uid()
    and not is_suspended(auth.uid())
    and exists (
      select 1 from tasks t
      where t.id = task_id
        and t.requester_id is not null and t.doer_id is not null
        and (
          (t.requester_id = auth.uid() and t.doer_id = recipient_id)
          or (t.doer_id = auth.uid() and t.requester_id = recipient_id)
        )
    )
  );

create policy messages_update_own_read on messages for update
  using (recipient_id = auth.uid())
  with check (recipient_id = auth.uid());

-- ============================================================================
-- Realtime — broadcast row changes so Done/Doer/Done Admin never require a
-- manual refresh for status, assignment, or message events.
-- ============================================================================

alter publication supabase_realtime add table tasks;
alter publication supabase_realtime add table task_status_history;
alter publication supabase_realtime add table messages;
alter publication supabase_realtime add table notifications;
alter publication supabase_realtime add table payouts;
alter publication supabase_realtime add table payments;
