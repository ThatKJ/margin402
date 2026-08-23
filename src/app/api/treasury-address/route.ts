import { NextResponse } from "next/server";
import { getTreasurySigner } from "@/lib/x402/wallet";

/**
 * The Margin402 treasury's public Algorand address — a receiving address,
 * safe to expose (every payment to it is already public on-chain). Exists
 * so the browser can assert its connected customer wallet is NOT this same
 * account before authorizing a payment: a customer wallet that happens to
 * equal the treasury would settle as a real on-chain transaction, but it
 * would prove nothing about the two-sided x402 story (Pera Customer Agent
 * paying a distinct Margin402 treasury) — see QuoteScreen.tsx's guard.
 */
export async function GET() {
  return NextResponse.json({ address: getTreasurySigner().address });
}
