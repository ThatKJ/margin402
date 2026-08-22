import {
  createLedger,
  recordAttempt,
  executionCost,
  remainingBudget,
  realizedMargin,
  isVerified,
} from "../src/lib/economics/ledger";
import { decideNextStep } from "../src/lib/economics/engine";
import { rankStrategies } from "../src/lib/economics/expected-cost";
import { LOCKED_QUOTE } from "../src/lib/economics/quote";
import { evaluateOffer } from "../src/lib/economics/counteroffer";
import type { Strategy } from "../src/lib/economics/types";

const S1: Strategy = { id: "s1", label: "Draft", price: 0.05, pSuccess: 0.35 };
const S2: Strategy = { id: "s2", label: "Repair", price: 0.09, pSuccess: 0.45 };
const s3At = (price: number): Strategy => ({ id: "s3", label: "Premium", price, pSuccess: 0.85 });

console.log("=== 1-3. Quote + counteroffer ===");
console.log("quote:", LOCKED_QUOTE);
const offer = evaluateOffer(1.05, LOCKED_QUOTE);
console.log("counteroffer $1.05:", offer);

if (offer.decision !== "ACCEPT") throw new Error("expected the canonical counteroffer to be accepted");
const REVENUE = offer.offer;
console.log(`\n>>> revenue fixed at $${REVENUE.toFixed(2)} for the rest of the job (never the raw $1.20 quote) <<<`);

let ledger = createLedger(REVENUE);

function printRanking(available: Strategy[]) {
  console.log("  expected cost-to-success for every available path:");
  for (const r of rankStrategies(available)) {
    console.log(`    ${r.strategyId} (${r.label}) @ $${r.price.toFixed(2)}: E = ${r.expectedCostToSuccess.toFixed(4)}`);
  }
}

function run(label: string, available: Strategy[], testsPassed: number, testsTotal: number) {
  console.log(`\n--- ${label} ---`);
  console.log(
    `  reservation floor: $${LOCKED_QUOTE.floor.toFixed(2)}  |  remaining budget before: $${remainingBudget(ledger).toFixed(2)}`,
  );
  printRanking(available);

  const step = decideNextStep(ledger, available);
  console.log(`  decision kind: ${step.kind}`);
  console.log(`  selected: ${step.selected?.strategyId} @ $${step.selected?.price.toFixed(2)}`);
  for (const rej of step.rejected) {
    console.log(`  REJECTED ${rej.strategyId} @ $${rej.price.toFixed(2)}: affordable=${rej.affordable}`);
    console.log(`    reason: "${rej.reason}"`);
    console.log(`    detail: ${rej.detail}`);
  }
  if (step.affordability) {
    console.log(
      `  affordability check on selected: affordable=${step.affordability.affordable} ` +
        `(price $${step.affordability.price.toFixed(2)} vs remaining $${step.affordability.remainingBudget.toFixed(2)})`,
    );
  }
  if (step.honouring) {
    console.log(
      `  HONOURING RULE: lossFromPaying=$${step.honouring.lossFromPaying.toFixed(2)}  ` +
        `lossFromRefunding=$${step.honouring.lossFromRefunding.toFixed(2)}  decision=${step.honouring.decision}`,
    );
  }
  console.log(`  rationale: ${step.rationale}`);

  if (!step.selected) return;
  ledger = recordAttempt(ledger, {
    strategyId: step.selected.strategyId,
    price: step.selected.price,
    testsPassed,
    testsTotal,
  });
  // Once verified the job is closed — from here the same number is the
  // statement's "margin", never "budget remaining" (CLAUDE.md label
  // discipline: the two must never share a UI label).
  const closed = isVerified(ledger);
  const trailing = closed
    ? "job closed — see final ledger below"
    : `remaining budget after: $${remainingBudget(ledger).toFixed(2)}`;
  console.log(
    `  OUTCOME: ${testsPassed}/${testsTotal}  |  spent this attempt: $${step.selected.price.toFixed(2)}  |  ` +
      `cumulative executionCost: $${executionCost(ledger).toFixed(2)}  |  ${trailing}`,
  );
}

run("Round 1 (Draft)", [S1, S2, s3At(0.55)], 5, 8);
run("Round 2 (Repair)", [S2, s3At(0.55)], 7, 8);
run("Round 3 (rejection beat, S3 requests $0.85)", [S2, s3At(0.85)], 7, 8);
run("Round 4 (honouring beat, S3 requests $1.05)", [s3At(1.05)], 8, 8);

console.log("\n=== FINAL LEDGER (source of truth — nothing above was asserted, only computed) ===");
console.log("attempts:", ledger.attempts);
console.log(`  customer revenue:    $${REVENUE.toFixed(2)}`);
console.log(`- provider payments:   ${ledger.attempts.map((a) => `$${a.price.toFixed(2)}`).join(" + ")} = $${executionCost(ledger).toFixed(2)}`);
console.log(`= realized margin:     $${realizedMargin(ledger).toFixed(2)}`);
console.log(`  verified:            ${isVerified(ledger)}`);
