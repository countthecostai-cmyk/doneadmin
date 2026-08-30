import { describe, it, expect } from "vitest";
import {
  estimatePriceCents,
  splitFee,
  formatCents,
  totalChargeCents,
  totalDoerPayoutCents,
  formatChargeBreakdown,
  PLATFORM_FEE_RATE,
  type TaskTypeForPricing,
} from "./pricing";

function taskType(overrides: Partial<TaskTypeForPricing> = {}): TaskTypeForPricing {
  return {
    pricing_model: "flat",
    base_price_cents: 5000,
    min_price_cents: 1500,
    price_per_unit_cents: null,
    ...overrides,
  };
}

describe("estimatePriceCents", () => {
  it("flat: ignores quantity, returns base price", () => {
    const t = taskType({ pricing_model: "flat", base_price_cents: 4000 });
    expect(estimatePriceCents(t, 7, 0)).toBe(4000);
    expect(estimatePriceCents(t, null, 0)).toBe(4000);
  });

  it("hourly: base + per-unit * quantity", () => {
    const t = taskType({
      pricing_model: "hourly",
      base_price_cents: 0,
      price_per_unit_cents: 3000,
      min_price_cents: 0,
    });
    expect(estimatePriceCents(t, 2, 0)).toBe(6000);
  });

  it("quantity: base + per-unit * quantity", () => {
    const t = taskType({
      pricing_model: "quantity",
      base_price_cents: 500,
      price_per_unit_cents: 200,
      min_price_cents: 0,
    });
    expect(estimatePriceCents(t, 5, 0)).toBe(1500);
  });

  it("distance: base + per-unit * quantity", () => {
    const t = taskType({
      pricing_model: "distance",
      base_price_cents: 1000,
      price_per_unit_cents: 150,
      min_price_cents: 0,
    });
    expect(estimatePriceCents(t, 10, 0)).toBe(2500);
  });

  it("hourly/quantity/distance: null quantity defaults to 1 unit, not 0", () => {
    const t = taskType({
      pricing_model: "hourly",
      base_price_cents: 1000,
      price_per_unit_cents: 500,
      min_price_cents: 0,
    });
    expect(estimatePriceCents(t, null, 0)).toBe(1500);
  });

  it("hourly/quantity/distance: negative quantity is clamped to 0, never subtracts", () => {
    const t = taskType({
      pricing_model: "hourly",
      base_price_cents: 1000,
      price_per_unit_cents: 500,
      min_price_cents: 0,
    });
    expect(estimatePriceCents(t, -5, 0)).toBe(1000);
  });

  it("doer_quote and custom_quote fall back to base price (no per-unit math)", () => {
    expect(
      estimatePriceCents(
        taskType({ pricing_model: "doer_quote", base_price_cents: 2000, price_per_unit_cents: 999 }),
        3,
        0
      )
    ).toBe(2000);
    expect(
      estimatePriceCents(
        taskType({ pricing_model: "custom_quote", base_price_cents: 2000, price_per_unit_cents: 999 }),
        3,
        0
      )
    ).toBe(2000);
  });

  it("adds addon total on top of the computed price", () => {
    const t = taskType({ pricing_model: "flat", base_price_cents: 4000, min_price_cents: 0 });
    expect(estimatePriceCents(t, null, 1250)).toBe(5250);
  });

  it("never returns below min_price_cents, even with zero addons", () => {
    const t = taskType({ pricing_model: "flat", base_price_cents: 500, min_price_cents: 2000 });
    expect(estimatePriceCents(t, null, 0)).toBe(2000);
  });

  it("min_price_cents floor applies after addons are added, not before", () => {
    const t = taskType({ pricing_model: "flat", base_price_cents: 500, min_price_cents: 2000 });
    // 500 + 1000 addon = 1500, still under the 2000 floor
    expect(estimatePriceCents(t, null, 1000)).toBe(2000);
    // 500 + 2000 addon = 2500, clears the floor on its own
    expect(estimatePriceCents(t, null, 2000)).toBe(2500);
  });
});

describe("splitFee", () => {
  it("splits at the platform fee rate, flooring the fee", () => {
    expect(PLATFORM_FEE_RATE).toBe(0.2);
    const { platformFeeCents, doerPayoutCents } = splitFee(10000);
    expect(platformFeeCents).toBe(2000);
    expect(doerPayoutCents).toBe(8000);
  });

  it("floors the fee on amounts that don't divide evenly, and the two halves always sum to the input", () => {
    const priceCents = 3333;
    const { platformFeeCents, doerPayoutCents } = splitFee(priceCents);
    expect(platformFeeCents).toBe(Math.floor(3333 * 0.2)); // 666
    expect(platformFeeCents + doerPayoutCents).toBe(priceCents);
  });

  it("zero price splits to zero/zero", () => {
    expect(splitFee(0)).toEqual({ platformFeeCents: 0, doerPayoutCents: 0 });
  });
});

describe("formatCents", () => {
  it("formats whole dollars", () => {
    expect(formatCents(5000)).toBe("$50.00");
  });

  it("formats cents correctly (no off-by-100 errors)", () => {
    expect(formatCents(1099)).toBe("$10.99");
    expect(formatCents(1)).toBe("$0.01");
    expect(formatCents(0)).toBe("$0.00");
  });
});

describe("tip handling — tips are 100% Doer-owned, never fee-split", () => {
  it("totalChargeCents adds tip to price", () => {
    expect(totalChargeCents(5000, 1000)).toBe(6000);
  });

  it("totalChargeCents clamps a negative tip to zero rather than reducing the charge", () => {
    expect(totalChargeCents(5000, -1000)).toBe(5000);
  });

  it("totalDoerPayoutCents adds the full tip on top of the fee-split payout", () => {
    const { doerPayoutCents } = splitFee(5000); // 4000
    expect(totalDoerPayoutCents(doerPayoutCents, 1000)).toBe(5000);
  });

  it("totalDoerPayoutCents clamps a negative tip to zero", () => {
    expect(totalDoerPayoutCents(4000, -500)).toBe(4000);
  });

  it("a $1000 job with a $200 tip: platform only ever takes a cut of the $1000, Doer gets $800 + full $200 tip", () => {
    const priceCents = 100000;
    const tipCents = 20000;
    const { platformFeeCents, doerPayoutCents } = splitFee(priceCents);
    expect(platformFeeCents).toBe(20000);
    expect(totalDoerPayoutCents(doerPayoutCents, tipCents)).toBe(100000);
    expect(totalChargeCents(priceCents, tipCents)).toBe(120000);
  });
});

describe("formatChargeBreakdown", () => {
  it("omits the tip clause entirely when there is no tip", () => {
    expect(formatChargeBreakdown(5000, 0)).toBe("$50.00");
    expect(formatChargeBreakdown(5000, -100)).toBe("$50.00");
  });

  it("shows price + tip = total when a tip is present", () => {
    expect(formatChargeBreakdown(5000, 1000)).toBe("$50.00 + $10.00 tip = $60.00");
  });
});
