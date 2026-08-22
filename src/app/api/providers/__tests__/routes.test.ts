import { describe, it, expect, beforeAll } from "vitest";
import algosdk from "algosdk";
import { NextRequest } from "next/server";

// A fresh, syntactically-valid, unfunded test wallet — set before any route
// module is imported so getTreasurySigner()'s lazy cache never sees the real
// .env value. Never a real key; nothing here can send a real payment (these
// requests never carry X-PAYMENT, so they never reach the facilitator).
beforeAll(() => {
  const acct = algosdk.generateAccount();
  process.env.TREASURY_MNEMONIC = algosdk.secretKeyToMnemonic(acct.sk);
});

async function decode402(res: Response) {
  const header = res.headers.get("payment-required");
  if (!header) return undefined;
  return JSON.parse(Buffer.from(header, "base64").toString("utf8"));
}

describe("provider routes are real x402-gated endpoints with per-round pricing", () => {
  it("draft is flat $0.05 regardless of round", async () => {
    const { GET } = await import("../draft/route");
    for (const round of [1, 2, 3, 4]) {
      const res = await GET(new NextRequest(`http://localhost/api/providers/draft?round=${round}`));
      expect(res.status).toBe(402);
      const body = await decode402(res);
      expect(body.accepts[0].amount).toBe("50000"); // $0.05 in USDC atomic units (6dp)
      expect(body.accepts[0].asset).toBe("10458941"); // testnet USDC
    }
  });

  it("repair is flat $0.09 and accepts a POST body of previous failures", async () => {
    const { POST } = await import("../repair/route");
    const res = await POST(
      new NextRequest("http://localhost/api/providers/repair?round=3", {
        method: "POST",
        body: JSON.stringify({ previousFailures: [{ name: "x", reason: "y" }] }),
      }),
    );
    expect(res.status).toBe(402);
    const body = await decode402(res);
    expect(body.accepts[0].amount).toBe("90000");
  });

  it("premium escalates $0.55 -> $0.85 -> $1.05 by round, matching the price-curve module exactly", async () => {
    const { GET } = await import("../premium/route");
    const expected: Record<number, string> = { 1: "550000", 2: "550000", 3: "850000", 4: "1050000" };
    for (const [round, amount] of Object.entries(expected)) {
      const res = await GET(new NextRequest(`http://localhost/api/providers/premium?round=${round}`));
      expect(res.status).toBe(402);
      const body = await decode402(res);
      expect(body.accepts[0].amount).toBe(amount);
    }
  });
});
