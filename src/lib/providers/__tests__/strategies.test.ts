import { describe, expect, it } from "vitest";
import { STRATEGY_CATALOG, strategyById } from "../strategies";

/**
 * The provider catalog is the single source of truth every customer-facing
 * pSuccess number must trace back to — the quote UI's plan cards and its
 * "Provider market" table both read STRATEGY_CATALOG directly rather than
 * duplicating these numbers (see plans.ts, PlanCard.tsx, ProviderMarket.tsx).
 * If these values ever move, every surface that quotes them should move
 * with them automatically; this test exists to catch an accidental edit
 * here, not to pin the UI.
 */
describe("STRATEGY_CATALOG", () => {
  it("has exactly the three locked pSuccess values from CLAUDE.md's economics", () => {
    expect(strategyById("s1").pSuccess).toBe(0.35);
    expect(strategyById("s2").pSuccess).toBe(0.45);
    expect(strategyById("s3").pSuccess).toBe(0.85);
  });

  it("labels every entry with its real provider name", () => {
    expect(strategyById("s1").label).toBe("Draft");
    expect(strategyById("s2").label).toBe("Repair");
    expect(strategyById("s3").label).toBe("Premium");
  });

  it("gives every strategy a non-empty, distinct market note for the customer-facing provider table", () => {
    const notes = STRATEGY_CATALOG.map((s) => s.marketNote);
    for (const note of notes) {
      expect(typeof note).toBe("string");
      expect(note.length).toBeGreaterThan(0);
    }
    expect(new Set(notes).size).toBe(STRATEGY_CATALOG.length);
  });
});
