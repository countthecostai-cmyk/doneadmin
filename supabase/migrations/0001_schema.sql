-- Done marketplace — core schema
-- Requester / Doer / Done naming used throughout (see Architecture & Lessons doc)

create extension if not exists "pgcrypto";

-- ============================================================================
-- ENUMS
-- ============================================================================

create type task_status as enum (
  'requested',
  'matching',
  'quoted',
  'accepted',
  'scheduled',
  'en_route',
  'arrived',
  'in_progress',
  'completed',
  'payout_pending',
  'payout_completed',
  'cancelled',
  'declined',
  'expired',
  'disputed',
  'refunded'
);

create type task_actor as enum ('requester', 'doer', 'admin', 'system');

create type pricing_model as enum (
  'flat',
  'hourly',
  'quantity',
  'distance',
  'doer_quote',
  'custom_quote',
  'minimum_charge'
);

create type doer_status as enum ('pending', 'approved', 'rejected', 'suspended');

create type background_check_status as enum ('not_started', 'pending', 'clear', 'flagged');

create type payment_status as enum ('pending', 'succeeded', 'failed', 'refunded', 'partially_refunded');

create type payout_status as enum ('pending', 'in_transit', 'paid', 'failed', 'canceled');

create type dispute_status as enum ('open', 'resolved_release', 'resolved_refund', 'resolved_other');

-- ============================================================================
-- PROFILES (1:1 with auth.users)
-- ============================================================================

create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  phone text,
  avatar_url text,
  is_admin boolean not null default false,
  is_doer boolean not null default false, -- has a doer_profiles row / applied
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ============================================================================
-- DOER PROFILES — trust & verification fields exist as real schema even
-- before every verification provider is wired up. Never claim verified
-- unless actually verified (see doc: "trust baseline").
-- ============================================================================

create table doer_profiles (
  user_id uuid primary key references profiles(id) on delete cascade,
  status doer_status not null default 'pending',
  identity_verified boolean not null default false,
  background_check_status background_check_status not null default 'not_started',
  rating_avg numeric(3,2), -- computed from reviews tied only to completed tasks
  rating_count integer not null default 0,
  bio text,
  applied_at timestamptz not null default now(),
  approved_at timestamptz,
  suspended_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ============================================================================
-- DOER STRIPE CONNECT ACCOUNTS
-- ============================================================================

create table doer_stripe_accounts (
  user_id uuid primary key references profiles(id) on delete cascade,
  stripe_account_id text not null unique,
  charges_enabled boolean not null default false,
  payouts_enabled boolean not null default false,
  details_submitted boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ============================================================================
-- CATEGORIES & TASK TYPES — data-driven, never a frontend switch statement.
-- Adding a new task type must never require a code change.
-- ============================================================================

create table categories (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  description text,
  icon text,
  active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table task_types (
  id uuid primary key default gen_random_uuid(),
  category_id uuid not null references categories(id) on delete restrict,
  slug text not null unique,
  name text not null,
  description text,
  pricing_model pricing_model not null default 'flat',
  base_price_cents integer not null default 0,
  min_price_cents integer not null default 0,
  price_per_unit_cents integer, -- for hourly / quantity / distance models
  unit_label text, -- e.g. "hour", "item", "mile"
  requires_photo_proof boolean not null default true,
  active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table task_type_addons (
  id uuid primary key default gen_random_uuid(),
  task_type_id uuid not null references task_types(id) on delete cascade,
  name text not null,
  price_cents integer not null default 0,
  active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

-- ============================================================================
-- SERVICE AREAS — real schema even before geofencing is enforced everywhere
-- ============================================================================

create table service_areas (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  zip_codes text[] not null default '{}',
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- ============================================================================
-- TASKS — the core object. Status is an explicit state machine, never a bool.
-- ============================================================================

create table tasks (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references profiles(id) on delete restrict,
  doer_id uuid references profiles(id) on delete restrict,
  task_type_id uuid not null references task_types(id) on delete restrict,
  status task_status not null default 'requested',

  title text not null,
  description text,
  address text not null,
  lat double precision,
  lng double precision,
  zip_code text,

  quantity numeric(10,2), -- for quantity/hourly/distance pricing
  selected_addon_ids uuid[] not null default '{}',

  -- price is computed & locked server-side at creation from task_type fields —
  -- the client-supplied quantity/addons are recomputed server-side, never trusted.
  price_cents integer not null,
  platform_fee_cents integer not null,
  doer_payout_cents integer not null,
  currency text not null default 'usd',

  requires_photo_proof boolean not null default true, -- denormalized from task_type at creation
  completion_photo_url text,
  completion_note text,

  scheduled_at timestamptz,
  cancellation_reason text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint price_non_negative check (price_cents >= 0),
  constraint payout_math check (doer_payout_cents + platform_fee_cents = price_cents)
);

create index tasks_status_idx on tasks (status);
create index tasks_requester_idx on tasks (requester_id);
create index tasks_doer_idx on tasks (doer_id);
create index tasks_task_type_idx on tasks (task_type_id);
-- open-pool lookups: unclaimed tasks in matching status
create index tasks_matching_pool_idx on tasks (status) where status = 'matching' and doer_id is null;

-- ============================================================================
-- TASK STATUS HISTORY — every transition writes a row here
-- ============================================================================

create table task_status_history (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references tasks(id) on delete cascade,
  status task_status not null,
  note text,
  changed_by_actor task_actor not null,
  changed_by_user uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create index task_status_history_task_idx on task_status_history (task_id, created_at);

-- ============================================================================
-- PAYMENTS — Requester → Done (Stripe PaymentIntent)
-- ============================================================================

create table payments (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null unique references tasks(id) on delete restrict,
  requester_id uuid not null references profiles(id) on delete restrict,
  stripe_payment_intent_id text unique,
  amount_cents integer not null,
  currency text not null default 'usd',
  status payment_status not null default 'pending',
  failure_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ============================================================================
-- PAYOUTS — Done → Doer (Stripe Transfer to connected account)
-- Never triggered by "completed" alone — see payout trust gate in doc.
-- ============================================================================

create table payouts (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null unique references tasks(id) on delete restrict,
  doer_id uuid not null references profiles(id) on delete restrict,
  stripe_transfer_id text unique,
  amount_cents integer not null,
  currency text not null default 'usd',
  status payout_status not null default 'pending',
  failure_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ============================================================================
-- DISPUTES — one system, shared across completion problems and other issues
-- ============================================================================

create table disputes (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references tasks(id) on delete cascade,
  raised_by uuid not null references profiles(id) on delete restrict,
  reason text not null,
  status dispute_status not null default 'open',
  resolution_note text,
  resolved_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

create index disputes_task_idx on disputes (task_id);
create index disputes_status_idx on disputes (status) where status = 'open';

-- ============================================================================
-- REVIEWS — tied only to completed tasks
-- ============================================================================

create table reviews (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references tasks(id) on delete cascade,
  rater_id uuid not null references profiles(id) on delete restrict,
  ratee_id uuid not null references profiles(id) on delete restrict,
  rating integer not null check (rating between 1 and 5),
  comment text,
  created_at timestamptz not null default now(),
  unique (task_id, rater_id)
);

-- ============================================================================
-- NOTIFICATIONS — one fan-out table; channel-specific plumbing added later
-- ============================================================================

create table notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  type text not null,
  title text not null,
  body text,
  data jsonb not null default '{}',
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index notifications_user_idx on notifications (user_id, created_at desc) where read_at is null;

-- ============================================================================
-- updated_at triggers
-- ============================================================================

create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_set_updated_at before update on profiles
  for each row execute function set_updated_at();
create trigger doer_profiles_set_updated_at before update on doer_profiles
  for each row execute function set_updated_at();
create trigger doer_stripe_accounts_set_updated_at before update on doer_stripe_accounts
  for each row execute function set_updated_at();
create trigger categories_set_updated_at before update on categories
  for each row execute function set_updated_at();
create trigger task_types_set_updated_at before update on task_types
  for each row execute function set_updated_at();
create trigger tasks_set_updated_at before update on tasks
  for each row execute function set_updated_at();
create trigger payments_set_updated_at before update on payments
  for each row execute function set_updated_at();
create trigger payouts_set_updated_at before update on payouts
  for each row execute function set_updated_at();

-- ============================================================================
-- new-user hook: create a profile row automatically
-- ============================================================================

create or replace function handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, new.raw_user_meta_data ->> 'full_name');
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();
