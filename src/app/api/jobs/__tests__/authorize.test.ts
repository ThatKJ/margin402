import { describe, it, expect, beforeAll } from "vitest";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import algosdk from "algosdk";
import { toClientAvmSigner } from "@x402/avm";
import { NextRequest } from "next/server";
import { createJob, getJob, markPaid, markExecuting } from "@/lib/state/job-store";
import { buyPaidResourceAsCustomer } from "@/lib/x402/browser-buyer";

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

  it("no longer exposes a POST handler — a client can no longer claim an arbitrary settlement txId", async () => {
    // Regression for a real finding: this route used to accept {txId} in a
    // POST body and store it verbatim for any already-PAID job, with no
    // verification the string was ever a real transaction. The real txId
    // now comes only from lib/x402/server.ts's onAfterSettle hook, sourced
    // from the facilitator's own confirmed settlement result.
    const routeModule = await import("../authorize/route");
    expect((routeModule as { POST?: unknown }).POST).toBeUndefined();
  });

  it("a payment attempt that never actually settles (unfunded signer) leaves the job ACCEPTED, never stuck at PAID", async () => {
    // Regression for a real finding: withX402 runs the wrapped handler
    // (paidHandler) once a payment is VERIFIED but before it's actually
    // SETTLED on-chain. The handler used to call markPaid() itself, so a
    // payment that failed at the settle step (a real, not hypothetical,
    // failure mode — balance/network/facilitator issues between verify and
    // settle) would still leave the job stuck PAID with no money having
    // moved: permanently blocking a legitimate retry behind the
    // duplicate-payment 409 guard, and worse, leaving the job looking
    // execute-eligible. markPaid() now only ever runs from
    // lib/x402/server.ts's onAfterSettle hook, which fires only on
    // confirmed settlement success — this exercises the real two-round-trip
    // x402 flow end to end against an unfunded signer to prove it.
    const { GET } = await import("../authorize/route");
    const job = await createJob("lowest-cost", 1);

    const server = createServer((req, res) => {
      (async () => {
        const url = `http://127.0.0.1${req.url}`;
        const headers = new Headers();
        for (const [key, value] of Object.entries(req.headers)) {
          if (typeof value === "string") headers.set(key, value);
        }
        const response = await GET(new NextRequest(url, { headers }));
        res.writeHead(response.status, Object.fromEntries(response.headers.entries()));
        res.end(Buffer.from(await response.arrayBuffer()));
      })().catch((err) => {
        res.writeHead(500).end(String(err));
      });
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const port = (server.address() as AddressInfo).port;

    try {
      const unfundedAccount = algosdk.generateAccount();
      const signer = toClientAvmSigner(Buffer.from(unfundedAccount.sk).toString("base64"));
      const buy = await buyPaidResourceAsCustomer(`http://127.0.0.1:${port}/api/jobs/authorize?jobId=${job.jobId}`, signer);
      expect(buy.ok).toBe(false); // an unfunded signer cannot actually settle

      const after = await getJob(job.jobId);
      expect(after?.status).toBe("ACCEPTED");
      expect(after?.customerTxId).toBeUndefined();
    } finally {
      server.close();
    }
  }, 20000);
});
