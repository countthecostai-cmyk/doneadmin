-- Done marketplace — support tickets.
--
-- Closes a real gap against the architecture doc's admin-tooling checklist
-- ("Requesters, Doers, task types/categories, pricing/fees, transactions,
-- payouts, refunds, disputes, reviews, service areas, promotions,
-- support") — general support had zero schema. `disputes` (0001) stays
-- exactly what it already is: a task-specific completion disagreement
-- routed through the payout trust gate (release/refund/cancel). Support
-- tickets are the separate, broader channel for everything that isn't
-- that — "I can't sign in", "wrong amount on my card", "a Doer said
-- something inappropriate", "the app crashed" — raised by a Requester or
-- Doer, optionally pointing at a task for context, worked by an admin.
-- Kept as its own system rather than folded into disputes because the
-- lifecycle and audience are genuinely different: a private admin<->user
-- conversation with no financial outcome, vs. a two-sided dispute that
-- ends in a specific payout decision.

create type support_ticket_status as enum ('open', 'in_progress', 'resolved', 'closed');
create type support_ticket_category as enum ('account', 'billing', 'task_issue', 'safety', 'bug', 'other');

-- ============================================================================
-- support_tickets — status is an explicit state machine (never a boolean),
-- same non-negotiable as tasks. See src/lib/support-ticket-state-machine.ts
-- (TICKET_TRANSITIONS / TICKET_TRANSITION_ACTORS) for the full graph; the
-- guard trigger below only re-enforces the one part of it that matters at
-- the DB layer — which fields a non-admin may ever touch on their own row.
-- ============================================================================

create table support_tickets (
  id uuid primary key default gen_random_uuid(),
  created_by uuid not null references profiles(id) on delete cascade,
  created_by_role task_actor not null,
  category support_ticket_category not null default 'other',
  subject text not null check (char_length(subject) between 1 and 200),
  status support_ticket_status not null default 'open',
  related_task_id uuid references tasks(id) on delete set null,
  assigned_admin uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  resolved_at timestamptz,
  constraint support_tickets_role_check check (created_by_role in ('requester', 'doer'))
);

create index support_tickets_status_idx on support_tickets (status);
create index support_tickets_created_by_idx on support_tickets (created_by, updated_at desc);
-- admin queue: everything still needing attention, most-recently-active first
create index support_tickets_open_idx on support_tickets (updated_at desc) where status in ('open', 'in_progress');

create trigger support_tickets_set_updated_at before update on support_tickets
  for each row execute function set_updated_at();

-- ============================================================================
-- support_ticket_messages — the thread. is_internal_note marks an
-- admin-only note (e.g. "verified refund eligibility, waiting on Stripe")
-- that a Requester/Doer must never see — enforced by RLS below, not just
-- hidden in the UI.
-- ============================================================================

create table support_ticket_messages (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references support_tickets(id) on delete cascade,
  sender_id uuid references profiles(id) on delete set null,
  sender_role task_actor not null,
  body text not null check (char_length(body) between 1 and 4000),
  is_internal_note boolean not null default false,
  created_at timestamptz not null default now(),
  constraint support_ticket_messages_role_check check (sender_role in ('requester', 'doer', 'admin')),
  constraint support_ticket_messages_note_admin_only check (is_internal_note = false or sender_role = 'admin')
);

create index support_ticket_messages_ticket_idx on support_ticket_messages (ticket_id, created_at);

-- A new message is real activity — bump the ticket's updated_at so the
-- admin queue's "most recently active" ordering (support_tickets_open_idx
-- above) reflects conversation activity, not just status changes.
create or replace function support_ticket_messages_touch_ticket()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update support_tickets set updated_at = now() where id = new.ticket_id;
  return new;
end;
$$;

create trigger support_ticket_messages_touch_ticket_trg
  after insert on support_ticket_messages
  for each row execute function support_ticket_messages_touch_ticket();

-- ============================================================================
-- support_ticket_status_history — every transition writes a row here,
-- exactly mirroring task_status_history (0001).
-- ============================================================================

create table support_ticket_status_history (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references support_tickets(id) on delete cascade,
  status support_ticket_status not null,
  note text,
  changed_by_actor task_actor not null,
  changed_by_user uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create index support_ticket_status_history_ticket_idx on support_ticket_status_history (ticket_id, created_at);

-- ============================================================================
-- RLS
-- ============================================================================

alter table support_tickets enable row level security;
alter table support_ticket_messages enable row level security;
alter table support_ticket_status_history enable row level security;

create policy support_tickets_select on support_tickets for select
  using (created_by = auth.uid() or is_admin(auth.uid()));

create policy support_tickets_insert on support_tickets for insert
  with check (
    created_by = auth.uid()
    and (
      related_task_id is null
      or exists (
        select 1 from tasks t where t.id = related_task_id
        and (t.requester_id = auth.uid() or t.doer_id = auth.uid())
      )
    )
  );

-- Admin can update anything (category/status/assignment/etc). The ticket's
-- own creator may also update their ticket, but the guard trigger below
-- restricts *what* they're allowed to change once RLS lets them in — same
-- two-layer shape as tasks_update + tasks_lock_immutable_fields (0002).
create policy support_tickets_update on support_tickets for update
  using (created_by = auth.uid() or is_admin(auth.uid()))
  with check (created_by = auth.uid() or is_admin(auth.uid()));

create or replace function support_tickets_guard_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.role() = 'service_role' or is_admin(auth.uid()) then
    return new;
  end if;

  -- Reaching here means the RLS check already confirmed created_by = auth.uid().
  -- A non-admin creator may only ever move `status`, and only from
  -- 'resolved' back to 'open' (reopen — "that didn't actually fix it") or
  -- to 'closed' (confirm — "yes, that's resolved, close it out"). Every
  -- other field, and every other status move, is admin-only.
  if new.category is distinct from old.category
     or new.subject is distinct from old.subject
     or new.related_task_id is distinct from old.related_task_id
     or new.assigned_admin is distinct from old.assigned_admin
     or new.created_by is distinct from old.created_by
     or new.created_by_role is distinct from old.created_by_role then
    raise exception 'only an admin can change that field';
  end if;

  if new.status is distinct from old.status then
    if old.status <> 'resolved' or new.status not in ('open', 'closed') then
      raise exception 'you can only reopen or close a ticket of yours once it is resolved';
    end if;
  end if;

  return new;
end;
$$;

create trigger support_tickets_guard_update_trg
  before update on support_tickets
  for each row execute function support_tickets_guard_update();

create policy support_ticket_messages_select on support_ticket_messages for select
  using (
    is_admin(auth.uid())
    or (
      is_internal_note = false
      and exists (select 1 from support_tickets st where st.id = ticket_id and st.created_by = auth.uid())
    )
  );

create policy support_ticket_messages_insert on support_ticket_messages for insert
  with check (
    sender_id = auth.uid()
    and (
      (is_admin(auth.uid()) and sender_role = 'admin')
      or (
        not is_admin(auth.uid())
        and is_internal_note = false
        and sender_role in ('requester', 'doer')
        and exists (
          select 1 from support_tickets st
          where st.id = ticket_id
            and st.created_by = auth.uid()
            and st.status <> 'closed'
        )
      )
    )
  );

create policy support_ticket_status_history_select on support_ticket_status_history for select
  using (
    is_admin(auth.uid())
    or exists (select 1 from support_tickets st where st.id = ticket_id and st.created_by = auth.uid())
  );

create policy support_ticket_status_history_insert on support_ticket_status_history for insert
  with check (
    (changed_by_user = auth.uid() or is_admin(auth.uid()))
    and exists (
      select 1 from support_tickets st where st.id = ticket_id
      and (st.created_by = auth.uid() or is_admin(auth.uid()))
    )
  );

-- Live-updating admin queue + thread views, same pattern as tasks/messages/disputes.
alter publication supabase_realtime add table support_tickets;
alter publication supabase_realtime add table support_ticket_messages;
