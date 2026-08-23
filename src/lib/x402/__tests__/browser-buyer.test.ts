import { describe, it, expect } from "vitest";
import algosdk from "algosdk";
import { x402Client } from "@x402/core/client";
import type { PaymentRequired, PaymentRequirements, SchemeNetworkClient, PaymentPayloadResult } from "@x402/core/types";
import { findDefaultAsset, USDC_TESTNET_ASA_ID, USDC_DECIMALS } from "@x402/avm";
import { ALGORAND_NETWORK } from "../network";
import { CUSTOMER_MAX_PAYMENT_PER_CONTRACT } from "../browser-buyer";

/**
 * Regression coverage for the real production incident: @x402/core's client
 * defaults spendControls.maxAmountPerPayment to $1, which silently rejected
 * every Margin402 contract above $1 (Best Value $1.20, Highest Confidence
 * $1.35) before Pera was ever asked to sign anything — see CLAUDE.md's
 * locked economics and browser-buyer.ts.
 *
 * This exercises the real, installed @x402/core spend-control gate (not a
 * reimplementation of its cap-parsing/conversion logic) via a scheme stub
 * that reuses @x402/avm's actual findDefaultAsset — the same function
 * ExactAvmScheme registers — so the gate genuinely recognizes testnet USDC.
 * The stub never signs or touches the network; createPaymentPayload is only
 * reached at all once a requirement has already passed the cap.
 */
function stubExactScheme(): SchemeNetworkClient {
  return {
    scheme: "exact",
    findDefaultAsset,
    async createPaymentPayload(): Promise<PaymentPayloadResult> {
      return { x402Version: 2, payload: {} };
    },
  };
}

const payTo = algosdk.generateAccount().addr.toString();

function paymentRequiredFor(dollars: number): PaymentRequired {
  const requirement: PaymentRequirements = {
    scheme: "exact",
    network: ALGORAND_NETWORK,
    asset: USDC_TESTNET_ASA_ID,
    amount: String(Math.round(dollars * 10 ** USDC_DECIMALS)),
    payTo,
    maxTimeoutSeconds: 300,
    extra: {},
  };
  return {
    x402Version: 2,
    resource: { url: "https://margin402.test/api/jobs/authorize" },
    accepts: [requirement],
  };
}

function clientWithCustomerCap() {
  return new x402Client()
    .register(ALGORAND_NETWORK, stubExactScheme())
    .setSpendControls({ maxAmountPerPayment: CUSTOMER_MAX_PAYMENT_PER_CONTRACT });
}

describe("customer x402 spend cap (browser-buyer.ts)", () => {
  it.each([1.0, 1.2, 1.35])("accepts a real Margin402 contract price of $%s", async (dollars) => {
    await expect(clientWithCustomerCap().createPaymentPayload(paymentRequiredFor(dollars))).resolves.toBeDefined();
  });

  it("rejects an excessive requirement ($2.01) before ever reaching the scheme's signer", async () => {
    await expect(clientWithCustomerCap().createPaymentPayload(paymentRequiredFor(2.01))).rejects.toThrow(
      /spendControls\.maxAmountPerPayment/,
    );
  });

  it("reproduces the actual production bug: the SDK default ($1) cap rejects Best Value ($1.20)", async () => {
    const defaultCapClient = new x402Client().register(ALGORAND_NETWORK, stubExactScheme());
    await expect(defaultCapClient.createPaymentPayload(paymentRequiredFor(1.2))).rejects.toThrow(
      /spendControls\.maxAmountPerPayment/,
    );
  });
});
