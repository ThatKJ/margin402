import { NextResponse } from "next/server";
import { withX402 } from "@x402/next";
import { resourceServer } from "@/lib/x402/server";
import { getTreasurySigner } from "@/lib/x402/wallet";
import { ALGORAND_NETWORK } from "@/lib/x402/network";

async function handler() {
  return NextResponse.json({ ok: true });
}

export const GET = withX402(
  handler,
  {
    accepts: {
      scheme: "exact",
      network: ALGORAND_NETWORK,
      payTo: () => getTreasurySigner().address,
      price: `$${process.env.ECHO_PRICE_USD ?? "0.01"}`,
    },
    description: "x402 payment smoke test",
  },
  resourceServer,
);
