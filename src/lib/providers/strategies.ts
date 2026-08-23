export type StrategyId = "s1" | "s2" | "s3";

export interface StrategyDef {
  id: StrategyId;
  label: string;
  pSuccess: number;
  /**
   * How many times this strategy may be offered in one job before the
   * orchestrator stops including it in `available`. Orchestration policy,
   * not economics — see run-job.ts.
   *   s1 (Draft): no feedback loop, so a second attempt would be identical — 1 try.
   *   s2 (Repair): takes failing tests as feedback, worth a couple of tries — 2.
   *   s3 (Premium): the last resort — generous cap, in practice never re-tried
   *     in the canonical demo since it either passes or the honouring rule closes the job.
   */
  maxAttempts: number;
}

export const STRATEGY_CATALOG: StrategyDef[] = [
  { id: "s1", label: "Draft", pSuccess: 0.35, maxAttempts: 1 },
  { id: "s2", label: "Repair", pSuccess: 0.45, maxAttempts: 2 },
  { id: "s3", label: "Premium", pSuccess: 0.85, maxAttempts: 3 },
];

export function strategyById(id: StrategyId): StrategyDef {
  const found = STRATEGY_CATALOG.find((s) => s.id === id);
  if (!found) throw new Error(`unknown strategy id: ${id}`);
  return found;
}

export function isStrategyId(id: string): id is StrategyId {
  return STRATEGY_CATALOG.some((s) => s.id === id);
}
