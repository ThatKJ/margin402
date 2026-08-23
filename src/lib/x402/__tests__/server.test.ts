import { describe, expect, it } from "vitest";
import { jobIdFromAuthorizeSettlement } from "../server";

/**
 * Regression coverage for a real finding from the security audit: the
 * customer's recorded settlement txId used to come from whatever the
 * browser POSTed after the fact, trusted verbatim once the job was
 * already PAID. It now comes only from the shared resourceServer's
 * onAfterSettle hook, sourced from the facilitator's own confirmed
 * result — never from client input (see server.ts).
 *
 * This tests the one piece of that wiring that's actually this app's own
 * logic (which settled resource belongs to a customer job at all) rather
 * than re-testing the SDK's own settlement-success guarantee, which is
 * already exercised by real facilitator round-trips elsewhere (see
 * providers/__tests__/routes.test.ts).
 */
describe("jobIdFromAuthorizeSettlement", () => {
  it("extracts the jobId from a real authorize resource URL", () => {
    const url = "https://margin402.vercel.app/api/jobs/authorize?jobId=abc-123";
    expect(jobIdFromAuthorizeSettlement(url)).toBe("abc-123");
  });

  it("never attributes a provider-route settlement to a job — a Draft/Repair/Premium payment must not touch job state", () => {
    for (const path of ["/api/providers/draft", "/api/providers/repair", "/api/providers/premium", "/api/providers/echo"]) {
      const url = `https://margin402.vercel.app${path}?round=1`;
      expect(jobIdFromAuthorizeSettlement(url)).toBeNull();
    }
  });

  it("returns null for a missing or malformed resource URL rather than throwing", () => {
    expect(jobIdFromAuthorizeSettlement(undefined)).toBeNull();
    expect(jobIdFromAuthorizeSettlement("")).toBeNull();
    expect(jobIdFromAuthorizeSettlement("not a url at all /api/jobs/authorize")).toBeNull();
  });

  it("returns null when the authorize URL has no jobId", () => {
    expect(jobIdFromAuthorizeSettlement("https://margin402.vercel.app/api/jobs/authorize")).toBeNull();
  });
});
