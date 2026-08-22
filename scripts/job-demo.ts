import "dotenv/config";
import { randomUUID } from "node:crypto";
import { runJob } from "../src/lib/orchestrator/run-job";
import { createX402ProviderClient } from "../src/lib/orchestrator/provider-client";
import type { JobEvent } from "../src/lib/orchestrator/types";

/**
 * Real end-to-end run: real x402 payments on Algorand TESTNET against a
 * running dev server, using whatever TREASURY_MNEMONIC is in .env. Testnet
 * assets have no real monetary value, but the transactions are genuine,
 * independently verifiable on Lora — mirrors payment:smoke's role from
 * Prompt 1, meant to be run by you, not invoked automatically.
 *
 * Requires: `npm run dev` running in another terminal, and a funded testnet
 * wallet (small amount of ALGO + testnet USDC, opted into ASA 10458941 —
 * both free from a faucet).
 */

const PORT = process.env.PORT ?? "3000";
const BASE_URL = `http://localhost:${PORT}`;
const REVENUE = Number(process.env.JOB_DEMO_REVENUE ?? "1.05");

function describeEvent(event: JobEvent): string {
  switch (event.type) {
    case "decision": {
      const s = event.step;
      const parts = [`round ${event.round}: ${s.kind}`];
      if (s.selected) parts.push(`selected ${s.selected.strategyId}@$${s.selected.price.toFixed(2)}`);
      for (const r of s.rejected) {
        parts.push(`REJECT ${r.strategyId}@$${r.price.toFixed(2)} (affordable=${r.affordable}) — ${r.reason}`);
      }
      if (s.honouring) parts.push(`honouring=${s.honouring.decision} (pay $${s.honouring.lossFromPaying.toFixed(2)} vs refund $${s.honouring.lossFromRefunding.toFixed(2)})`);
      return parts.join("\n    ");
    }
    case "payment":
      return `round ${event.round}: paid ${event.strategyId} $${event.price.toFixed(2)}${event.txId ? ` (tx ${event.txId}, ${event.settlementMs}ms)` : ""}`;
    case "verification":
      return `round ${event.round}: verified ${event.strategyId} -> ${event.passed}/${event.total}${event.verified ? " ALL PASS" : ""}`;
    case "closed":
      return `CLOSED: ${event.outcome} — revenue $${event.revenue.toFixed(2)}, executionCost $${event.executionCost.toFixed(2)}, margin $${event.margin.toFixed(2)}`;
  }
}

async function main() {
  console.log(`[job:demo] DEMO_MODE=${process.env.DEMO_MODE ?? "true"}  revenue=$${REVENUE.toFixed(2)}  target=${BASE_URL}`);
  console.log("[job:demo] this makes REAL x402 payments on Algorand TESTNET (no real monetary value, real on-chain transactions).\n");

  const jobId = randomUUID();
  const providerClient = createX402ProviderClient(BASE_URL, jobId);

  const result = await runJob({ revenue: REVENUE, providerClient });

  for (const event of result.events) {
    console.log(describeEvent(event));
  }

  console.log(`\n[job:demo] outcome: ${result.outcome}${result.error ? ` (${result.error})` : ""}`);
  if (result.outcome !== "VERIFIED") process.exit(1);
}

main().catch((err) => {
  console.error("[job:demo] error:", err);
  process.exit(1);
});
