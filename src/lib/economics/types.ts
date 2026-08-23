/** A strategy Margin402 can spend money on to try to reach a verified outcome. */
export interface Strategy {
  id: string;
  label: string;
  /** Current quoted price in USD. Taken at face value — never forecast to revert. */
  price: number;
  /** Probability this attempt verifies, in [0, 1]. */
  pSuccess: number;
}

/** One resolved attempt at a strategy, as recorded in the ledger. */
export interface AttemptRecord {
  strategyId: string;
  price: number;
  testsPassed: number;
  testsTotal: number;
  verified: boolean;
}

/** Component breakdown of a customer quote. Reconciles: expectedCost + riskReserve + operatingMargin = quote. */
export interface QuoteBreakdown {
  expectedCost: number;
  riskReserve: number;
  operatingMargin: number;
  quote: number;
  /** expectedCost + riskReserve — the minimum price Margin402 will accept. */
  floor: number;
}

export type OfferDecision = "ACCEPT" | "DECLINE";

export interface OfferEvaluation {
  decision: OfferDecision;
  offer: number;
  floor: number;
  expectedCost: number;
  riskReserve: number;
  /** Only set when decision is ACCEPT: offer - expectedCost - riskReserve. */
  compressedOperatingMargin?: number;
  rationale: string;
}

/** A strategy ranked by expected cost-to-success, not raw price or price/probability. */
export interface StrategyRanking {
  strategyId: string;
  label: string;
  price: number;
  pSuccess: number;
  expectedCostToSuccess: number;
}

export interface RejectedCandidate extends StrategyRanking {
  affordable: boolean;
  /**
   * Canonical, fixed reason text. Every selectStrategy() rejection is
   * economic by construction — affordability plays no part in choosing a
   * winner — so this is always the same literal string, never a budget
   * explanation. See `detail` for the numeric comparison.
   */
  reason: string;
  /** The actual expected-cost-to-success numbers being compared, human-readable. */
  detail: string;
}

export interface AffordabilityCheck {
  affordable: boolean;
  price: number;
  remainingBudget: number;
}

export type HonouringDecision = "PAY_ANYWAY" | "REFUND";

export interface HonouringEvaluation {
  lossFromPaying: number;
  lossFromRefunding: number;
  decision: HonouringDecision;
  rationale: string;
}

export type StepKind = "PAY" | "REFUND" | "NO_STRATEGIES_LEFT";

/** The full, structured result of one execution decision. Rendered verbatim in the UI. */
export interface StepDecision {
  kind: StepKind;
  selected?: StrategyRanking;
  rejected: RejectedCandidate[];
  affordability?: AffordabilityCheck;
  /** Present only when the selected strategy failed the affordability check. */
  honouring?: HonouringEvaluation;
  remainingBudgetBefore: number;
  rationale: string;
}
