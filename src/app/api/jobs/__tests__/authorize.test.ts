import { describe, it, expect, beforeAll } from "vitest";
import algosdk from "algosdk";
import { NextRequest } from "next/server";
import { createJob, markPaid, markExecuting } from "@/lib/state/job-store";

// A fresh, syntactically-valid, unfunded test wallet — set before any route
// module is imported so getTreasurySigner()'s lazy cache never sees a real
// .env value. Never a real key; nothing here can send a real payment (these
// requests never carry X-PAYMENT, so they never reach the facilitator) —
// same pattern as providers/__tests__/routes.test.ts.
beforeAll(() => {
  const acct = algosdk.generateAccount();
  process.env.TREASURY_MNEMONIC = algosdk.secretKeyToMnemonic(acct.sk);
});

async function decode402(res: Response) {
  const header = res.headers.get("payment-required");
  if (!header) return undefined;
  return JSON.parse(Buffer.from(header, "base64").toString("utf8"));
}

describe("/api/jobs/authorize — payment safety", () => {
  it("returns 404 with no payment-required header for an unknown jobId — never fabricates a $0 contract", async () => {
    const { GET } = await import("../authorize/route");
    const res = await GET(new NextRequest("http://localhost/api/jobs/authorize?jobId=does-not-exist"));
    expect(res.status).toBe(404);
    expect(res.headers.get("payment-required")).toBeNull();
  });

  it("returns 402 with a real payment-required challenge at the job's exact accepted price for a known, unpaid (ACCEPTED) job", async () => {
    const { GET } = await import("../authorize/route");
    const job = await createJob("best-value", 1.2);
    const res = await GET(new NextRequest(`http://localhost/api/jobs/authorize?jobId=${job.jobId}`));
    expect(res.status).toBe(402);
    const challenge = await decode402(res);
    expect(challenge?.accepts?.[0]?.amount).toBe(String(Math.round(1.2 * 1_000_000)));
  });

  it("returns 409 with NO payment-required header for an already-PAID job — a retried authorize must never charge twice", async () => {
    const { GET } = await import("../authorize/route");
    const job = await createJob("best-value", 1.2);
    await markPaid(job.jobId, "REALTXID-DUPLICATE-GUARD");

    const res = await GET(new NextRequest(`http://localhost/api/jobs/authorize?jobId=${job.jobId}`));
    expect(res.status).toBe(409);
    expect(res.headers.get("payment-required")).toBeNull();
    const body = await res.json();
    expect(body.status).toBe("PAID");
  });

  it("returns 409 with no payment-required header for a job already EXECUTING", async () => {
    const { GET } = await import("../authorize/route");
    const job = await createJob("best-value", 1.2);
    await markPaid(job.jobId, "REALTXID-EXECUTING-GUARD");
    await markExecuting(job.jobId);

    const res = await GET(new NextRequest(`http://localhost/api/jobs/authorize?jobId=${job.jobId}`));
    expect(res.status).toBe(409);
    expect(res.headers.get("payment-required")).toBeNull();
  });
});
