-- Admin audit log — every privileged admin write (suspend/reactivate a
-- profile, approve/reject a Doer application, resolve a dispute, force a
-- task transition, or edit the categories/task-types/pricing catalog) gets
-- an immutable row here: who, what, on what, and any detail worth keeping.
--
-- This is accountability infrastructure for Done Admin, not a replacement
-- for task_status_history (which is task-lifecycle-specific and already
-- covers admin-initiated status changes in its own shape) — admin_audit_log
-- is the one place that also covers non-task admin actions: suspending a
-- user, editing the pricing catalog, resolving a dispute's *disputes* row.
--
-- Immutable by design: insert and select policies exist, no update/delete
-- policy is defined for any role (RLS defaults to deny), so once written a
-- row can't be edited or removed by an admin covering their tracks. Only a
-- service-role/migration could alter history, same trust boundary as every
-- other append-only table in this schema.

create table admin_audit_log (
  id uuid primary key default gen_random_uuid(),
  admin_id uuid not null references profiles(id) on delete restrict,
  action text not null,
  target_type text not null,
  target_id uuid,
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index admin_audit_log_admin_idx on admin_audit_log (admin_id, created_at desc);
create index admin_audit_log_target_idx on admin_audit_log (target_type, target_id);
create index admin_audit_log_created_idx on admin_audit_log (created_at desc);

alter table admin_audit_log enable row level security;

-- Only admins can ever read the log.
create policy admin_audit_log_select on admin_audit_log for select
  using (is_admin(auth.uid()));

-- An admin can only ever write a row attributing the action to themselves —
-- no admin can log an action as if another admin did it.
create policy admin_audit_log_insert on admin_audit_log for insert
  with check (is_admin(auth.uid()) and admin_id = auth.uid());

-- Deliberately no update or delete policy — RLS denies both by default for
-- every role except service_role, keeping the log append-only.

-- Live-updating audit feed in Done Admin, same pattern as tasks/messages/etc.
alter publication supabase_realtime add table admin_audit_log;
