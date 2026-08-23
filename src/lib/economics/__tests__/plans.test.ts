import { describe, expect, it } from "vitest";
import { buildPlans, buildPlan, toCustomerPlan } from "@/lib/economics/plans";
import { LOCKED_QUOTE } from "@/lib/economics/quote";
import { STRATEGY_CATALOG } from "@/lib/providers/strategies";
import { availableStrategiesForPlan } from "@/lib/orchestrator/plan-policy";
import type { PlanId } from "@/lib/orchestrator/types";

/** Terms this product must never use for firstAttemptPassRate — see plans.ts's field doc. */
const FORBIDDEN_CONFIDENCE_LABELS = ["plan confidence", "success guarantee", "completion probability"];

const PLANS = buildPlans();

describe("three-plan quote", () => {
  it("returns exactly three plans with distinct ids and objectives", () => {
    expect(PLANS).toHaveLength(3);
    const ids = PLANS.map((p) => p.id);
    expect(new Set(ids).size).toBe(3);
    expect(new Set(PLANS.map((p) => p.objective)).size).toBe(3);
    for (const p of PLANS) {
      expect(p.executionPolicy.length).toBeGreaterThan(0);
      expect(p.retryPolicy.length).toBeGreaterThan(0);
      expect(p.escalationPolicy.length).toBeGreaterThan(0);
      expect(p.verificationPolicy.length).toBeGreaterThan(0);
      expect(p.refundPolicy.length).toBeGreaterThan(0);
      expect(p.strategyOrder.length).toBeGreaterThan(0);
    }
  });

  it("recommends exactly one plan and it is deterministic", () => {
    const recommended = PLANS.filter((p) => p.recommended);
    expect(recommended).toHaveLength(1);
    expect(recommended[0].id).toBe("best-value");
    const again = buildPlans().filter((p) => p.recommended);
    expect(again[0].id).toBe("best-value");
  });

  it("prices plans deterministically around the locked quote — lowest below, highest above", () => {
    const byId = new Map(PLANS.map((p) => [p.id, p]));
    expect(byId.get("lowest-cost")!.price).toBeCloseTo(LOCKED_QUOTE.quote - 0.2, 2);
    expect(byId.get("best-value")!.price).toBeCloseTo(LOCKED_QUOTE.quote, 2);
    expect(byId.get("highest-confidence")!.price).toBeCloseTo(LOCKED_QUOTE.quote + 0.15, 2);
    expect(buildPlan("lowest-cost").price).toBe(buildPlan("lowest-cost").price);
  });

  it("never leaks reservation-floor internals", () => {
    const serialized = JSON.stringify(PLANS).toLowerCase();
    expect(serialized).not.toContain('"floor"');
    expect(serialized).not.toContain("riskreserve");
    expect(serialized).not.toContain("reservation");
    expect(serialized).not.toContain(String(LOCKED_QUOTE.floor));
    for (const key of Object.keys(PLANS[0])) {
      expect(["floor", "riskReserve", "operatingMargin"].includes(key)).toBe(false);
    }
  });

  it("gives every plan a real first-attempt pass rate from the strategy catalog", () => {
    const rates = new Set(PLANS.map((p) => p.firstAttemptPassRate));
    expect(rates.has(0.35)).toBe(true);
    expect(rates.has(0.85)).toBe(true);
    for (const p of PLANS) {
      expect(p.firstAttemptPassRate).toBeGreaterThan(0);
      expect(p.firstAttemptPassRate).toBeLessThanOrEqual(1);
      expect(Number.isFinite(p.expectedCostToSuccess)).toBe(true);
    }
  });
});

describe("toCustomerPlan — internal cost model must not reach a customer surface", () => {
  it("strips expectedCostToSuccess but keeps every customer-safe field", () => {
    for (const plan of PLANS) {
      const customerPlan = toCustomerPlan(plan);
      expect(Object.keys(customerPlan)).not.toContain("expectedCostToSuccess");
      expect(JSON.stringify(customerPlan).toLowerCase()).not.toContain("expectedcosttosuccess");
      expect(customerPlan.id).toBe(plan.id);
      expect(customerPlan.price).toBe(plan.price);
      expect(customerPlan.firstAttemptPassRate).toBe(plan.firstAttemptPassRate);
    }
  });

  it("keeps cardMetrics and qualitativeMetrics on the customer-safe DTO", () => {
    for (const plan of PLANS) {
      const customerPlan = toCustomerPlan(plan);
      expect(customerPlan.cardMetrics).toEqual(plan.cardMetrics);
      expect(customerPlan.qualitativeMetrics).toEqual(plan.qualitativeMetrics);
    }
  });
});

describe("plan card presentation — the 'why do two plans show the same 35%' bug", () => {
  const byId = new Map(PLANS.map((p) => [p.id, p]));

  it("never mislabels firstAttemptPassRate as overall plan confidence, a guarantee, or a completion probability", () => {
    const serialized = JSON.stringify(PLANS.map((p) => p.cardMetrics)).toLowerCase();
    for (const forbidden of FORBIDDEN_CONFIDENCE_LABELS) {
      expect(serialized).not.toContain(forbidden);
    }
  });

  it("shows Lowest Cost and Highest Confidence's real first-attempt estimate, sourced from firstAttemptPassRate", () => {
    for (const id of ["lowest-cost", "highest-confidence"] as PlanId[]) {
      const plan = byId.get(id)!;
      const row = plan.cardMetrics.find((m) => m.label === "First-attempt estimate");
      expect(row).toBeDefined();
      expect(row!.value).toBe(`${Math.round(plan.firstAttemptPassRate * 100)}%`);
    }
  });

  it("does not lead Best Value's card with a first-attempt-estimate row — its differentiator is adaptive selection, not entry pSuccess", () => {
    const bestValue = byId.get("best-value")!;
    expect(bestValue.cardMetrics.some((m) => m.label === "First-attempt estimate")).toBe(false);
  });

  it("every plan's entry-provider row names a real STRATEGY_CATALOG label matching its entryStrategyId", () => {
    const labelById = new Map(STRATEGY_CATALOG.map((s) => [s.id, s.label]));
    for (const plan of PLANS) {
      const row = plan.cardMetrics.find((m) => m.label === "Entry provider");
      expect(row).toBeDefined();
      expect(row!.value).toBe(labelById.get(plan.entryStrategyId as (typeof STRATEGY_CATALOG)[number]["id"]));
    }
  });

  it("gives every plan exactly two qualitative axes, each a 1-5 level (never a disguised percentage)", () => {
    for (const plan of PLANS) {
      expect(plan.qualitativeMetrics).toHaveLength(2);
      for (const m of plan.qualitativeMetrics) {
        expect(Number.isInteger(m.level)).toBe(true);
        expect(m.level).toBeGreaterThanOrEqual(1);
        expect(m.level).toBeLessThanOrEqual(5);
      }
    }
  });

  it("Lowest Cost and Best Value share the same entry provider (Draft) but present visibly different card content", () => {
    const lowestCost = byId.get("lowest-cost")!;
    const bestValue = byId.get("best-value")!;
    // The actual source of the original bug: both plans legitimately enter
    // with Draft, so their raw firstAttemptPassRate is identical. The fix
    // is presentation, not economics — assert the two cards' label sets
    // differ even though this one underlying number does not.
    expect(lowestCost.entryStrategyId).toBe(bestValue.entryStrategyId);
    const lowestCostLabels = lowestCost.cardMetrics.map((m) => m.label);
    const bestValueLabels = bestValue.cardMetrics.map((m) => m.label);
    expect(lowestCostLabels).not.toEqual(bestValueLabels);
  });
});

describe("plan ladders are genuinely different policies", () => {
  it("lowest-cost exposes one rung at a time, cheapest-first", () => {
    const fresh = availableStrategiesForPlan("lowest-cost", {});
    expect(fresh.map((s) => s.id)).toEqual(["s1"]);

    const afterDraft = availableStrategiesForPlan("lowest-cost", { s1: 1 });
    expect(afterDraft.map((s) => s.id)).toEqual(["s2"]);

    const afterDraftAndRepair = availableStrategiesForPlan("lowest-cost", { s1: 1, s2: 2 });
    expect(afterDraftAndRepair.map((s) => s.id)).toEqual(["s3"]);

    expect(availableStrategiesForPlan("lowest-cost", { s1: 1, s2: 2, s3: 3 })).toEqual([]);
  });

  it("highest-confidence leads with Premium and falls back reliability-first", () => {
    const fresh = availableStrategiesForPlan("highest-confidence", {});
    expect(fresh.map((s) => s.id)).toEqual(["s3"]);

    const afterPremiumExhausted = availableStrategiesForPlan("highest-confidence", { s3: 3 });
    expect(afterPremiumExhausted.map((s) => s.id)).toEqual(["s2"]);
  });

  it("best-value keeps every strategy with attempts left available", () => {
    const fresh = availableStrategiesForPlan("best-value", {}).map((s) => s.id);
    expect(fresh).toContain("s1");
    expect(fresh).toContain("s2");
    expect(fresh).toContain("s3");

    const midJob = availableStrategiesForPlan("best-value", { s1: 1 }).map((s) => s.id);
    expect(midJob).toEqual(["s2", "s3"]);
  });

  it("respects per-strategy attempt caps under every plan", () => {
    for (const planId of ["lowest-cost", "best-value", "highest-confidence"] as PlanId[]) {
      const exhausted = availableStrategiesForPlan(planId, { s1: 1, s2: 2, s3: 3 });
      expect(exhausted).toEqual([]);
    }
  });
});
