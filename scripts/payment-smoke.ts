import "dotenv/config";
import { buyPaidResource } from "../src/lib/x402/buyer";

/**
 * ONE real x402 payment, end to end, against /api/providers/echo — the
 * proof that the payment rail genuinely works before spending anything on
 * a real job. This is LIVE TESTNET, never REPLAY: it makes a real network
 * call through a real facilitator and either gets a real settled Algorand
 * transaction back, or fails loudly. Nothing here can silently fall back to
 * simulation — buyPaidResource either returns a real result or this throws.
 *
 * A settled response (ok: true, a txId) is itself the proof of every step
 * in the chain, because wrapFetchWithPayment cannot produce one without all
 * of them happening for real: the route returned 402 with real payment
 * requirements -> the buyer built and signed a real payment -> retried with
 * X-PAYMENT -> the GoPlausible facilitator verified and settled it on
 * Algorand Testnet -> the route only then returned 200. There is no code
 * path that reaches a printed txId without that sequence actually occurring.
 *
 * Usage: `npm run dev` in one terminal, `npm run x402:testnet-smoke` in another.
 */

const PORT = process.env.PORT ?? "3000";
const ECHO_URL = `http://localhost:${PORT}/api/providers/echo`;
const ECHO_PRICE_USD = Number(process.env.ECHO_PRICE_USD ?? "0.01");

function loraUrl(txId: string): string {
  return `https://lora.algokit.io/testnet/transaction/${txId}`;
}

async function main() {
  console.log("=== x402 LIVE TESTNET smoke test (not REPLAY — this is a real payment) ===");
  console.log(`target:  ${ECHO_URL}`);
  console.log(`amount:  $${ECHO_PRICE_USD.toFixed(2)}`);
  console.log(`network: Algorand Testnet, via GoPlausible facilitator\n`);

  const result = await buyPaidResource(ECHO_URL, "x402-testnet-smoke", ECHO_PRICE_USD);

  console.log("=== result ===");
  console.log(`http status:     ${result.status}`);
  console.log(`amount:          $${result.amountUsd.toFixed(2)}`);
  console.log(`settlement time: ${result.settlementMs}ms`);
  console.log(`response body:   ${JSON.stringify(result.body)}`);

  if (!result.ok || !result.txId) {
    console.error("");
    console.error("[x402:testnet-smoke] FAILED — no settled transaction.");
    console.error(`  http ok: ${result.ok}, txId: ${result.txId ?? "(none)"}`);
    console.error("  This is not simulated as a pass. Check: wallet funded? opted into USDC ASA 10458941?");
    process.exit(1);
  }

  console.log(`transaction id:  ${result.txId}`);
  console.log(`verify on Lora:  ${loraUrl(result.txId)}`);
  console.log("\n[x402:testnet-smoke] PASSED — settled, real, and independently verifiable on Lora.");
}

main().catch((err) => {
  console.error("[x402:testnet-smoke] error (not a simulated failure — the real call threw):", err);
  process.exit(1);
});
