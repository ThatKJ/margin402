import { x402Client } from "@x402/core/client";
import { decodePaymentResponseHeader } from "@x402/core/http";
import { wrapFetchWithPayment } from "@x402/fetch";
import { ExactAvmScheme } from "@x402/avm/exact/client";
import { ALGORAND_NETWORK } from "./network";
import type { ClientAvmSigner } from "@/lib/wallet/pera-signer";

export interface BrowserBuyResult {
  ok: boolean;
  status: number;
  body: unknown;
  settlementMs: number;
  txId?: string;
}

/**
 * Browser-side counterpart to lib/x402/buyer.ts — identical protocol
 * (402 -> sign -> retry -> facilitator verify/settle), different signer.
 * The server buyer signs with the Margin402 treasury (Layer 2, paying
 * providers); this signs with whatever wallet the customer connected
 * (Layer 1, paying Margin402 — see CLAUDE.md's two-sided x402 section).
 * Never touches private key material: signing happens inside the wallet
 * via `signer.signTransactions`, this module only ever sees signed bytes.
 */
export async function buyPaidResourceAsCustomer(url: string, signer: ClientAvmSigner): Promise<BrowserBuyResult> {
  const client = new x402Client().register(
    ALGORAND_NETWORK,
    new ExactAvmScheme(signer, { algodUrl: "https://testnet-api.algonode.cloud" }),
  );

  const fetchWithPay = wrapFetchWithPayment(fetch, client);

  const start = Date.now();
  const response = await fetchWithPay(url);
  const settlementMs = Date.now() - start;

  const body = await response.json().catch(() => undefined);

  const settleHeader = response.headers.get("PAYMENT-RESPONSE") ?? response.headers.get("X-PAYMENT-RESPONSE");
  let txId: string | undefined;
  if (settleHeader) {
    try {
      txId = decodePaymentResponseHeader(settleHeader).transaction;
    } catch {
      txId = undefined;
    }
  }

  return { ok: response.ok, status: response.status, body, settlementMs, txId };
}
