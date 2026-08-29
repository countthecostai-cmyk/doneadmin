import Stripe from "stripe";

let stripeClient: Stripe | null = null;

/** Server-only. Throws clearly if STRIPE_SECRET_KEY isn't configured yet
 *  rather than silently no-op'ing a payment. */
export function getStripe(): Stripe {
  if (!stripeClient) {
    const key = process.env.STRIPE_SECRET_KEY;
    if (!key) {
      throw new Error(
        "STRIPE_SECRET_KEY is not set — payments are unavailable until it is configured."
      );
    }
    stripeClient = new Stripe(key, { apiVersion: "2026-08-26.dahlia" });
  }
  return stripeClient;
}
