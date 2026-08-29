/**
 * Hand-written types mirroring supabase/migrations/0001-0004. Once a live
 * Supabase project is connected, replace/augment this with the output of
 * `generate_typescript_types` — keep this file's shape compatible so the
 * swap is a no-op for callers.
 */
import type { TaskStatus } from "@/lib/task-state-machine";

export type PricingModel =
  | "flat"
  | "hourly"
  | "quantity"
  | "distance"
  | "doer_quote"
  | "custom_quote"
  | "minimum_charge";

export type DoerStatus = "pending" | "approved" | "rejected" | "suspended";
export type BackgroundCheckStatus = "not_started" | "pending" | "clear" | "flagged";
export type PaymentStatus = "pending" | "succeeded" | "failed" | "refunded" | "partially_refunded";
export type PayoutStatus = "pending" | "in_transit" | "paid" | "failed" | "canceled";
export type DisputeStatus = "open" | "resolved_release" | "resolved_refund" | "resolved_other";
export type TaskActorDb = "requester" | "doer" | "admin" | "system";

export interface Profile {
  id: string;
  full_name: string | null;
  phone: string | null;
  avatar_url: string | null;
  is_admin: boolean;
  is_doer: boolean;
  is_suspended: boolean;
  suspended_reason: string | null;
  suspended_at: string | null;
  suspended_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface DoerProfile {
  user_id: string;
  status: DoerStatus;
  identity_verified: boolean;
  background_check_status: BackgroundCheckStatus;
  is_available: boolean;
  rating_avg: number | null;
  rating_count: number;
  bio: string | null;
  applied_at: string;
  approved_at: string | null;
  suspended_reason: string | null;
  created_at: string;
  updated_at: string;
}

export interface Category {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  icon: string | null;
  active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface TaskType {
  id: string;
  category_id: string;
  slug: string;
  name: string;
  description: string | null;
  pricing_model: PricingModel;
  base_price_cents: number;
  min_price_cents: number;
  price_per_unit_cents: number | null;
  unit_label: string | null;
  requires_photo_proof: boolean;
  active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface TaskTypeAddon {
  id: string;
  task_type_id: string;
  name: string;
  price_cents: number;
  active: boolean;
  sort_order: number;
  created_at: string;
}

export interface Task {
  id: string;
  requester_id: string;
  doer_id: string | null;
  task_type_id: string;
  status: TaskStatus;
  title: string;
  description: string | null;
  address: string;
  lat: number | null;
  lng: number | null;
  zip_code: string | null;
  quantity: number | null;
  selected_addon_ids: string[];
  price_cents: number;
  platform_fee_cents: number;
  doer_payout_cents: number;
  tip_cents: number;
  currency: string;
  requires_photo_proof: boolean;
  completion_photo_url: string | null;
  completion_note: string | null;
  scheduled_at: string | null;
  cancellation_reason: string | null;
  created_at: string;
  updated_at: string;
}

export interface TaskStatusHistoryRow {
  id: string;
  task_id: string;
  status: TaskStatus;
  note: string | null;
  changed_by_actor: TaskActorDb;
  changed_by_user: string | null;
  created_at: string;
}

export interface Payment {
  id: string;
  task_id: string;
  requester_id: string;
  stripe_payment_intent_id: string | null;
  amount_cents: number;
  currency: string;
  status: PaymentStatus;
  failure_message: string | null;
  created_at: string;
  updated_at: string;
}

export interface Payout {
  id: string;
  task_id: string;
  doer_id: string;
  stripe_transfer_id: string | null;
  amount_cents: number;
  currency: string;
  status: PayoutStatus;
  failure_message: string | null;
  created_at: string;
  updated_at: string;
}

export interface Dispute {
  id: string;
  task_id: string;
  raised_by: string;
  reason: string;
  status: DisputeStatus;
  resolution_note: string | null;
  resolved_by: string | null;
  created_at: string;
  resolved_at: string | null;
}

export interface Review {
  id: string;
  task_id: string;
  rater_id: string;
  ratee_id: string;
  rating: number;
  comment: string | null;
  created_at: string;
}

export interface NotificationRow {
  id: string;
  user_id: string;
  type: string;
  title: string;
  body: string | null;
  data: Record<string, unknown>;
  read_at: string | null;
  created_at: string;
}

export interface Message {
  id: string;
  task_id: string;
  sender_id: string;
  recipient_id: string;
  body: string;
  read_at: string | null;
  created_at: string;
}

export interface DoerStripeAccount {
  user_id: string;
  stripe_account_id: string;
  charges_enabled: boolean;
  payouts_enabled: boolean;
  details_submitted: boolean;
  created_at: string;
  updated_at: string;
}

// Minimal Database shape so @supabase/ssr's generics are satisfied.
// Table-level typing is done ad hoc at call sites via the interfaces above.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Database = any;
