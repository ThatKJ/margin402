import { describe, it, expect, beforeAll } from "vitest";
import { NextRequest } from "next/server";

// In-process mode: no real payment, no network — this test is about the
// idempotency/duplicate-payment guard's own logic, not the payment rail.
beforeAll(() => {
  process.env.PROVIDER_CLIENT_MODE = "inprocess";
  process.env.DEMO_MODE = "true";
});

async function drain(res: Response): Promise<{ status: number; events: { type: string }[] }> {
  if (res.status !== 200 || !res.body) return { status: res.status, events: [] };
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  const events: { type: string }[] = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const chunks = buffer.split("\n\n");
    buffer = chunks.pop() ?? "";
    for (const chunk of chunks) {
      if (chunk.startsWith("data: ")) events.push(JSON.parse(chunk.slice(6)));
    }
  }
  return { status: res.status, events };
}

describe("/api/jobs/execute — payment safety (duplicate-payment guard)", () => {
  it("rejects a second request for a jobId that already made real payment progress", async () => {
    const { GET } = await import("../execute/route");
    const jobId = "test-settled-guard-1";

    const first = await GET(new NextRequest(`http://localhost/api/jobs/execute?revenue=1.05&jobId=${jobId}`));
    const firstResult = await drain(first);
    expect(firstResult.status).toBe(200);
    expect(firstResult.events.some((e) => e.type === "payment")).toBe(true); // confirms it's not a vacuous pass
    expect(firstResult.events.some((e) => e.type === "closed")).toBe(true);

    // Same jobId again, after the first fully finished — this is the actual
    // duplicate-payment scenario (a retried request, a resubmitted form).
    const second = await GET(new NextRequest(`http://localhost/api/jobs/execute?revenue=1.05&jobId=${jobId}`));
    expect(second.status).toBe(409);
  });

  it("rejects a concurrent second request for a jobId that's still actively running", async () => {
    const { GET } = await import("../execute/route");
    const jobId = "test-active-guard-1";

    const firstPromise = GET(new NextRequest(`http://localhost/api/jobs/execute?revenue=1.05&jobId=${jobId}`));
    // Fired before the first has any chance to finish — this is the
    // "double-click" / "browser retry while still loading" scenario.
    const second = await GET(new NextRequest(`http://localhost/api/jobs/execute?revenue=1.05&jobId=${jobId}`));
    expect(second.status).toBe(409);

    // Let the first actually finish so it doesn't leak into other tests via the module-level state.
    const first = await firstPromise;
    await drain(first);
  });

  it("allows retrying a jobId whose only attempt was aborted before any payment happened", async () => {
    const { GET } = await import("../execute/route");
    const jobId = "test-aborted-retry-guard-1";

    const controller = new AbortController();
    const aborted = new NextRequest(`http://localhost/api/jobs/execute?revenue=1.05&jobId=${jobId}`, {
      signal: controller.signal,
    });
    controller.abort(); // aborted before the handler even starts running its loop
    const firstAttempt = await GET(aborted);
    // Still 200 at the HTTP level (the abort is observed inside runJob's
    // loop, between rounds — the response itself starts streaming normally).
    await drain(firstAttempt);

    // Because that attempt made zero real payments, retrying the same jobId
    // must be allowed — this is what keeps React Strict Mode's dev-only
    // mount/cleanup/remount cycle working instead of permanently 409ing the
    // real, lasting connection.
    const retry = await GET(new NextRequest(`http://localhost/api/jobs/execute?revenue=1.05&jobId=${jobId}`));
    expect(retry.status).toBe(200);
    const retryResult = await drain(retry);
    expect(retryResult.events.some((e) => e.type === "closed")).toBe(true);
  });

  it("rejects invalid revenue before touching the payment-safety guards", async () => {
    const { GET } = await import("../execute/route");
    const res = await GET(new NextRequest("http://localhost/api/jobs/execute?revenue=not-a-number"));
    expect(res.status).toBe(400);
  });
});
