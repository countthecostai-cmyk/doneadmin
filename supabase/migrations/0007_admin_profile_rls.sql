-- Fixes a real RLS gap found while building the Done Admin app: profiles_update_own
-- (0002) only ever let a user update their OWN row (`id = auth.uid()`), so an admin
-- suspending/reactivating a *different* user's account had no RLS path and could
-- only be done by dropping to the service-role client — which bypasses RLS as the
-- authorization boundary entirely (non-negotiable #3) rather than being granted a
-- real admin policy, same pattern already used correctly for tasks_update (0006)
-- and doer_profiles_update (0002). This migration closes that gap so Done Admin's
-- suspend/reactivate action can run on the normal RLS-scoped client like every
-- other admin write already does.
--
-- profiles_lock_privileged_fields() (0002, updated 0006) already enforces which
-- FIELDS a non-admin/non-service-role writer may touch (is_admin, is_suspended,
-- suspended_reason/at/by are already locked to admin+service_role there); this
-- policy only widens which ROWS an admin may target, it does not loosen the
-- field-level lock.

drop policy if exists profiles_update_own on profiles;
create policy profiles_update_own on profiles for update
  using (id = auth.uid() or is_admin(auth.uid()))
  with check (id = auth.uid() or is_admin(auth.uid()));
