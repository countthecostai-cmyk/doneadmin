/**
 * Display-only pricing preview. The AUTHORITATIVE calculation lives in the
 * database (compute_task_pricing + the tasks_recompute_pricing trigger in
 * supabase/migrations/0002_functions_rls.sql), which recomputes price_cents
 * on every insert/update from task_type + quantity + addons — a client
 * cannot make the two disagree. This module exists only so the UI can show
 * an estimate before submitting; never treat its output as final.
 */

export type PricingModel =
  | "flat"
  | "hourly"
  | "quantity"
  | "distance"
  | "doer_quote"
  | "custom_quote"
  | "minimum_charge";

export interface TaskTypeForPricing {
  pricing_model: PricingModel;
  base_price_cents: number;
  min_price_cents: number;
  price_per_unit_cents: number | null;
}

export function estimatePriceCents(
  taskType: TaskTypeForPricing,
  quantity: number | null,
  addonTotalCents: number
): number {
  let price: number;
  switch (taskType.pricing_model) {
    case "flat":
      price = taskType.base_price_cents;
      break;
    case "hourly":
    case "quantity":
    case "distance":
      price =
        taskType.base_price_cents +
        (taskType.price_per_unit_cents ?? 0) * Math.max(quantity ?? 1, 0);
      break;
    default:
      price = taskType.base_price_cents;
  }
  price += addonTotalCents;
  return Math.max(price, taskType.min_price_cents);
}

export const PLATFORM_FEE_RATE = 0.2;

export function splitFee(priceCents: number): {
  platformFeeCents: number;
  doerPayoutCents: number;
} {
  const platformFeeCents = Math.floor(priceCents * PLATFORM_FEE_RATE);
  return { platformFeeCents, doerPayoutCents: priceCents - platformFeeCents };
}

export function formatCents(cents: number, currency = "usd"): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency.toUpperCase(),
  }).format(cents / 100);
}

/**
 * Stripe's own minimum charge amount for a USD Checkout session. A task
 * discounted close to (or to) zero must never produce a session Stripe
 * would reject outright — the charge is floored here instead.
 */
export const MIN_CHARGE_CENTS = 50;

/**
 * Total actually charged to the Requester (price + tip - promo discount).
 * Tip is 100% Doer-owned and never subject to the platform fee split — see
 * 0006_messaging_tips_availability_moderation.sql. A promo discount comes
 * entirely out of the platform's fee, never the Doer's payout — see
 * 0011_promotions.sql.
 */
export function totalChargeCents(priceCents: number, tipCents: number, discountCents = 0): number {
  const raw = priceCents + Math.max(tipCents, 0) - Math.max(discountCents, 0);
  return Math.max(raw, MIN_CHARGE_CENTS);
}

/** What the Doer actually receives for a task: their fee-split payout + 100% of the tip. Never reduced by a promo discount. */
export function totalDoerPayoutCents(doerPayoutCents: number, tipCents: number): number {
  return doerPayoutCents + Math.max(tipCents, 0);
}

export function formatChargeBreakdown(
  priceCents: number,
  tipCents: number,
  currency = "usd",
  discountCents = 0
): string {
  if (tipCents <= 0 && discountCents <= 0) return formatCents(priceCents, currency);
  const parts = [formatCents(priceCents, currency)];
  if (discountCents > 0) parts.push(`- ${formatCents(discountCents, currency)} promo`);
  if (tipCents > 0) parts.push(`+ ${formatCents(tipCents, currency)} tip`);
  return `${parts.join(" ")} = ${formatCents(
    totalChargeCents(priceCents, tipCents, discountCents),
    currency
  )}`;
}
