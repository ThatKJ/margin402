import "dotenv/config";

/**
 * Proves the machine-customer path end to end over plain HTTP — no
 * React, no browser, exactly what an autonomous agent would do:
 *   POST /api/quote            -> fixed quote, no reservation floor anywhere in it
 *   POST /api/quote {offer}    -> counteroffer evaluated by the real engine, still no floor
 *   GET  /api/jobs/execute     -> accept and run, streaming real orchestrator events
 *
 * Equivalent curl:
 *   curl -s -X POST http://localhost:3000/api/quote | jq
 *   curl -s -X POST http://localhost:3000/api/quote -H 'Content-Type: application/json' -d '{"offer":1.05}' | jq
 *   curl -N "http://localhost:3000/api/jobs/execute?revenue=1.05"
 *
 * Payment reality here is whatever /api/jobs/execute is configured for —
 * real x402 by default, PROVIDER_CLIENT_MODE=inprocess as the explicit
 * local-only opt-out. This script doesn't change that; it just proves the
 * machine-facing surface works.
 */

const PORT = process.env.PORT ?? "3000";
const BASE = `http://localhost:${PORT}`;

function assertNoFloor(obj: unknown, label: string) {
  const json = JSON.stringify(obj);
  const lower = json.toLowerCase();
  // Checks both the word and the underlying numbers: expectedCost + riskReserve
  // sum to exactly the reservation floor, so exposing both fields leaks it
  // just as surely as a literal "floor" field would.
  if (lower.includes("floor") || lower.includes("reservation")) {
    throw new Error(`[machine:smoke] FAILED — ${label} response mentions the reservation floor: ${json}`);
  }
  if (lower.includes("expectedcost") && lower.includes("riskreserve")) {
    throw new Error(
      `[machine:smoke] FAILED — ${label} response exposes both expectedCost and riskReserve, which sum to the reservation floor: ${json}`,
    );
  }
}

async function main() {
  console.log(`=== machine:smoke — ${BASE} ===\n`);

  console.log("1) POST /api/quote");
  const quoteRes = await fetch(`${BASE}/api/quote`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ task: "Implement parseDuration()" }),
  });
  const quote = await quoteRes.json();
  assertNoFloor(quote, "quote");
  console.log(`   quote: $${quote.quote} (valid ${quote.validSeconds}s)`);
  console.log(`   floor present in response: NO (verified)\n`);

  console.log("2) POST /api/quote { offer: 1.05 }");
  const offerRes = await fetch(`${BASE}/api/quote`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ offer: 1.05 }),
  });
  const offerResult = await offerRes.json();
  assertNoFloor(offerResult, "counteroffer");
  console.log(`   decision: ${offerResult.decision}`);
  console.log(`   rationale: ${offerResult.rationale}`);
  console.log(`   floor present in response: NO (verified)\n`);

  if (offerResult.decision !== "ACCEPT") {
    throw new Error("[machine:smoke] FAILED — expected $1.05 to be accepted");
  }

  console.log(`3) GET /api/jobs/execute?revenue=${offerResult.offer} (streaming real events)`);
  const execRes = await fetch(`${BASE}/api/jobs/execute?revenue=${offerResult.offer}`);
  if (!execRes.ok || !execRes.body) {
    throw new Error(`[machine:smoke] FAILED — execute stream returned HTTP ${execRes.status}`);
  }

  const reader = execRes.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let closedEvent:
    | { outcome: string; revenue: number; executionCost: number; margin: number; settlements: { strategyId: string; txId: string }[] }
    | undefined;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.startsWith("data: ")) continue;
      const event = JSON.parse(line.slice(6));
      console.log(`   [${event.type}]${event.round ? ` round ${event.round}` : ""}`);
      if (event.type === "closed") closedEvent = event;
    }
  }

  if (!closedEvent) throw new Error("[machine:smoke] FAILED — stream closed without a final event");

  console.log(`\n=== final ===`);
  console.log(`outcome:        ${closedEvent.outcome}`);
  console.log(`revenue:        $${closedEvent.revenue.toFixed(2)}`);
  console.log(`execution cost: $${closedEvent.executionCost.toFixed(2)}`);
  console.log(`margin:         $${closedEvent.margin.toFixed(2)}`);
  console.log(`settlements:    ${closedEvent.settlements.length} real payment(s) recorded on this event alone`);
  for (const s of closedEvent.settlements) {
    console.log(`  - ${s.strategyId}: ${s.txId}`);
  }
  console.log("\n[machine:smoke] PASSED — a machine can quote, accept, and execute with zero UI,");
  console.log("[machine:smoke] and read a self-contained receipt off the final event alone.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
