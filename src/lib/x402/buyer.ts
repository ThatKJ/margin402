import { x402Client } from "@x402/core/client";
import { decodePaymentResponseHeader } from "@x402/core/http";
import { wrapFetchWithPayment } from "@x402/fetch";
import { ExactAvmScheme } from "@x402/avm/exact/client";
import { toClientAvmSigner } from "@x402/avm";
import { getTreasurySigner } from "./wallet";
import { ALGORAND_NETWORK } from "./network";
import { checkAndRecordSpend } from "@/lib/spend-guard";

export interface BuyResult {
  ok: boolean;
  status: number;
  body: unknown;
  amountUsd: number;
  settlementMs: number;
  txId?: string;
}

/**
 * Calls an x402-gated URL as the buyer: on 402 it signs and pays with the
 * treasury wallet, retries with X-PAYMENT, and returns the settled result.
 * Every call is routed through the spend guard first. `init` is passed
 * straight through to fetch (e.g. POST + a JSON body for routes that take
 * input beyond the URL) — wrapFetchWithPayment re-issues it unchanged on
 * the paid retry.
 */
export async function buyPaidResource(
  url: string,
  jobId: string,
  amountUsd: number,
  init?: RequestInit,
): Promise<BuyResult> {
  checkAndRecordSpend(jobId, amountUsd);

  const { privateKeyBase64 } = getTreasurySigner();
  const signer = toClientAvmSigner(privateKeyBase64);

  const client = new x402Client()
    .register(
      ALGORAND_NETWORK,
      new ExactAvmScheme(signer, {
        algodUrl: process.env.ALGOD_URL ?? "https://testnet-api.algonode.cloud",
      }),
    )
    // The SDK's own built-in per-payment ceiling defaults to $1 — below the
    // $1.05+ Premium strategy this product actually charges (CLAUDE.md's
    // price curve spikes to $1.05). Without raising this, every real
    // Premium payment is silently refused by the client before it ever
    // reaches the network. Matched to our own per-job cap (spend-guard.ts)
    // rather than disabled outright, so a real safety ceiling still exists.
    .setSpendControls({ maxAmountPerPayment: `$${process.env.SPEND_CAP_PER_JOB_USD ?? "2"}` });

  const fetchWithPay = wrapFetchWithPayment(fetch, client);

  const start = Date.now();
  const response = await fetchWithPay(url, init);
  const settlementMs = Date.now() - start;

  const body = await response.json();

  const settleHeader =
    response.headers.get("PAYMENT-RESPONSE") ?? response.headers.get("X-PAYMENT-RESPONSE");
  let txId: string | undefined;
  if (settleHeader) {
    try {
      txId = decodePaymentResponseHeader(settleHeader).transaction;
    } catch {
      txId = undefined;
    }
  }

  return { ok: response.ok, status: response.status, body, amountUsd, settlementMs, txId };
}
