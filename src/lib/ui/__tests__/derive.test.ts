import { describe, it, expect } from "vitest";
import { runJob } from "@/lib/orchestrator/run-job";
import { createInProcessProviderClient } from "@/lib/orchestrator/provider-client";
import { deriveExecutionView, dramaticRejectionPrice } from "../derive";

describe("deriveExecutionView", () => {
  it("turns the real canonical job's event stream into the exact 5-row timeline the UI renders", async () => {
    const result = await runJob({ revenue: 1.05, providerClient: createInProcessProviderClient() });
    const view = deriveExecutionView(result.events);

    expect(view.rows.map((r) => `${r.kind}:${r.strategyId}:${r.price}`)).toEqual([
      "paid:s1:0.05",
      "paid:s2:0.09",
      "rejected:s3:0.85",
      "paid:s2:0.09",
      "paid:s3:1.05",
    ]);

    expect(view.spent).toBeCloseTo(1.28, 10);
    expect(view.executionCost).toBeCloseTo(1.28, 10);
    expect(view.margin).toBeCloseTo(-0.23, 10);
    expect(view.outcome).toBe("VERIFIED");

    // The $0.55 rejections from rounds 1-2 are real events but never rendered —
    // that's Premium's own base price, not a spike it was tempted by.
    expect(view.rows.some((r) => r.kind === "rejected" && r.price === 0.55)).toBe(false);

    // The one rejection shown is also the one flagged for the dramatic treatment.
    expect(dramaticRejectionPrice(view.rows)).toBe(0.85);
  });

  it("never shows a rejection at Premium's own opening price, and never repeats an unchanged spiked price twice", () => {
    const rejected = (price: number) => [
      { strategyId: "s3" as const, label: "Premium", price, pSuccess: 0.85, expectedCostToSuccess: 1, affordable: true, reason: "x", detail: "x" },
    ];
    const events = [
      // Round 1 establishes Premium's base price at $0.30 — never shown.
      { type: "decision" as const, round: 1, step: { kind: "PAY" as const, rejected: rejected(0.3), remainingBudgetBefore: 1, rationale: "" } },
      // Round 2 quotes it higher — this IS a spike, shown once.
      { type: "decision" as const, round: 2, step: { kind: "PAY" as const, rejected: rejected(0.55), remainingBudgetBefore: 1, rationale: "" } },
      // Round 3 quotes the exact same spiked price again — not repeated.
      { type: "decision" as const, round: 3, step: { kind: "PAY" as const, rejected: rejected(0.55), remainingBudgetBefore: 1, rationale: "" } },
    ];
    const view = deriveExecutionView(events);
    const rejections = view.rows.filter((r) => r.kind === "rejected");
    expect(rejections).toHaveLength(1);
    expect(rejections[0].price).toBe(0.55);
  });
});
