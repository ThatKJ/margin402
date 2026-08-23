import { LOCKED_QUOTE } from "./quote";
import { rankStrategies } from "./expected-cost";
import { STRATEGY_CATALOG } from "@/lib/providers/strategies";
import { priceForRound } from "@/lib/providers/price-curve";
import type { PlanId } from "@/lib/orchestrator/types";

export interface ExecutionPlan {
  id: PlanId;
  name: string;
  objective: string;
  description: string;
  recommended: boolean;
  price: number;
  firstAttemptPassRate: number;
  entryStrategyId: string;
  expectedCostToSuccess: number;
  riskLabel: string;
  strategyOrder: string[];
  executionPolicy: string;
  retryPolicy: string;
  escalationPolicy: string;
  verificationPolicy: string;
  refundPolicy: string;
  tradeoffs: string[];
  recommendationReason?: string;
}

const ROUND = 1;

function pricedStrategies() {
  return STRATEGY_CATALOG.map((s) => ({
    id: s.id,
    label: s.label,
    pSuccess: s.pSuccess,
    price: priceForRound(s.id, ROUND),
  }));
}

function ladderPriceAdjustment(planId: PlanId): number {
  switch (planId) {
    case "lowest-cost":
      return -0.2;
    case "best-value":
      return 0;
    case "highest-confidence":
      return 0.15;
  }
}

export function buildPlan(planId: PlanId): ExecutionPlan {
  const strategies = pricedStrategies();
  const ranked = rankStrategies(strategies);
  const byId = new Map(ranked.map((r) => [r.strategyId, r]));

  if (planId === "lowest-cost") {
    const entry = strategies.reduce((a, b) => (a.price <= b.price ? a : b));
    return {
      id: "lowest-cost",
      name: "Lowest Cost",
      objective: "Minimize spend",
      description:
        "Optimized for minimum spend. Margin402 works strictly up a cheapest-first ladder and escalates only when a tier is exhausted.",
      recommended: false,
      price: round2(LOCKED_QUOTE.quote + ladderPriceAdjustment(planId)),
      firstAttemptPassRate: entry.pSuccess,
      entryStrategyId: entry.id,
      expectedCostToSuccess: byId.get(entry.id)!.expectedCostToSuccess,
      riskLabel: "Variable",
      strategyOrder: ["Draft", "Repair", "Premium"],
      executionPolicy:
        "Strict cheapest-first ladder: Draft, then Repair, then Premium. Only one tier is active at a time — the engine may never skip ahead to a pricier provider while a cheaper tier has attempts remaining.",
      retryPolicy:
        "A failed tier consumes one of its attempts; the ladder advances only when the current tier has no attempts left.",
      escalationPolicy:
        "Escalation is exhaustion-driven, never economics-driven: the next tier unlocks only after the previous one is fully spent.",
      verificationPolicy:
        "Every attempt runs the full 8-test suite — 6 visible, 2 hidden from providers. Binary: all pass or nothing ships.",
      refundPolicy:
        "If the ladder is exhausted or the remaining budget cannot honourably continue, the contract is refunded.",
      tradeoffs: [
        "Lowest upfront price",
        "More attempts before success is likely",
        "Slower expected completion",
        "Outcome certainty arrives later in the run",
      ],
    };
  }

  if (planId === "highest-confidence") {
    const entry = strategies.reduce((a, b) => (a.pSuccess >= b.pSuccess ? a : b));
    return {
      id: "highest-confidence",
      name: "Highest Confidence",
      objective: "Maximize certainty",
      description:
        "Optimized for completion confidence. Margin402 commits to the strongest path first and falls back reliability-first.",
      recommended: false,
      price: round2(LOCKED_QUOTE.quote + ladderPriceAdjustment(planId)),
      firstAttemptPassRate: entry.pSuccess,
      entryStrategyId: entry.id,
      expectedCostToSuccess: byId.get(entry.id)!.expectedCostToSuccess,
      riskLabel: "Low",
      strategyOrder: ["Premium", "Repair", "Draft"],
      executionPolicy:
        "Reliability-first ladder: Premium, then Repair, then Draft. The highest-success provider is always attempted before any cheaper fallback is considered.",
      retryPolicy:
        "Premium holds up to three attempts at its current market price before any fallback tier unlocks.",
      escalationPolicy:
        "Fallback preserves reliability ordering — mid-tier Repair is preferred over the low-cost Draft whenever both are available.",
      verificationPolicy:
        "Every attempt runs the full 8-test suite — 6 visible, 2 hidden from providers. Binary: all pass or nothing ships.",
      refundPolicy:
        "The honouring rule applies: when the only path to done costs more than the budget that remains, Margin402 pays anyway while losing less than a refund would cost.",
      tradeoffs: [
        "Highest first-attempt pass rate",
        "Fewer attempts on average",
        "Higher upfront price",
        "Fastest expected completion",
      ],
    };
  }

  const best = ranked[0];
  return {
    id: "best-value",
    name: "Best Value",
    objective: "Balance cost and confidence",
    description:
      "Recommended. Every provider stays in play and the engine re-ranks them by expected cost-to-success after every result.",
    recommended: true,
    price: round2(LOCKED_QUOTE.quote + ladderPriceAdjustment(planId)),
    firstAttemptPassRate: best.pSuccess,
    entryStrategyId: best.strategyId,
    expectedCostToSuccess: best.expectedCostToSuccess,
    riskLabel: "Balanced",
    strategyOrder: ["Engine-decided each round"],
    executionPolicy:
      "All strategies with attempts remaining are available every round. The engine selects the lowest expected cost-to-success option — and will decline an affordable provider when a better expectation exists.",
    retryPolicy:
      "Re-evaluated per attempt using live results; failing tests feed back into repair-style strategies (visible failures only).",
    escalationPolicy:
      "Purely economic: escalate when a pricier provider becomes the cheapest expected path to a verified outcome — even mid-run, even above its list price.",
    verificationPolicy:
      "Every attempt runs the full 8-test suite — 6 visible, 2 hidden from providers. Binary: all pass or nothing ships.",
    refundPolicy:
      "The honouring rule applies: paying anyway beats refunding whenever the loss from delivering is smaller than the loss from stopping.",
    tradeoffs: [
      "Best expected cost-to-success",
      "Adapts to real-time results",
      "Can reject affordable-but-inferior options",
      "Strategy order emerges from live economics",
    ],
    recommendationReason:
      "Minimizes expected cost-to-success while keeping every option available — the strongest balance of price, probability, and adaptivity.",
  };
}

export function buildPlans(): ExecutionPlan[] {
  return [buildPlan("lowest-cost"), buildPlan("best-value"), buildPlan("highest-confidence")];
}

export function recommendedPlanId(): PlanId {
  return "best-value";
}

/**
 * What any client — the React UI or a machine calling the HTTP API — is
 * allowed to see. `expectedCostToSuccess` is Margin402's own live cost
 * estimate for fulfilling the plan, computed the same way the orchestrator
 * ranks strategies internally (see expected-cost.ts) — exactly the kind of
 * internal cost model CLAUDE.md says a customer never gets, same rule as
 * the reservation floor. Same sanitizing-boundary pattern as
 * evaluateOfferForCustomer() in customer-offer.ts: the pure engine keeps the
 * field (plans.test.ts asserts it's a real, finite number), this is the
 * crossing point that strips it before a plan reaches a customer surface.
 */
export type CustomerPlan = Omit<ExecutionPlan, "expectedCostToSuccess">;

export function toCustomerPlan(plan: ExecutionPlan): CustomerPlan {
  const customerPlan: CustomerPlan & { expectedCostToSuccess?: number } = { ...plan };
  delete customerPlan.expectedCostToSuccess;
  return customerPlan;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
