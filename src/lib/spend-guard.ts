/**
 * Hard spend guard. Every x402 payment call must route through
 * checkAndRecordSpend() before it is allowed to execute. Caps are read from
 * env so they can be tightened without a code change.
 */

export class SpendCapExceededError extends Error {}

interface SpendRecord {
  jobId: string;
  amountUsd: number;
  timestamp: number;
}

const spendLog: SpendRecord[] = [];
const ONE_HOUR_MS = 60 * 60 * 1000;

function getCaps(): { perJobUsd: number; perHourUsd: number } {
  const perJobUsd = Number(process.env.SPEND_CAP_PER_JOB_USD ?? "2");
  const perHourUsd = Number(process.env.SPEND_CAP_PER_HOUR_USD ?? "5");
  return { perJobUsd, perHourUsd };
}

/**
 * Throws SpendCapExceededError if recording amountUsd against jobId would
 * breach either the per-job or the rolling per-hour cap. Records the spend
 * only if both checks pass.
 */
export function checkAndRecordSpend(jobId: string, amountUsd: number): void {
  const { perJobUsd, perHourUsd } = getCaps();
  const now = Date.now();
  const hourAgo = now - ONE_HOUR_MS;

  const jobSpent = spendLog
    .filter((r) => r.jobId === jobId)
    .reduce((sum, r) => sum + r.amountUsd, 0);
  if (jobSpent + amountUsd > perJobUsd) {
    throw new SpendCapExceededError(
      `per-job spend cap exceeded for job ${jobId}: ${jobSpent.toFixed(4)} + ${amountUsd.toFixed(4)} > ${perJobUsd}`,
    );
  }

  const hourSpent = spendLog
    .filter((r) => r.timestamp >= hourAgo)
    .reduce((sum, r) => sum + r.amountUsd, 0);
  if (hourSpent + amountUsd > perHourUsd) {
    throw new SpendCapExceededError(
      `per-hour spend cap exceeded: ${hourSpent.toFixed(4)} + ${amountUsd.toFixed(4)} > ${perHourUsd}`,
    );
  }

  spendLog.push({ jobId, amountUsd, timestamp: now });
}

/** Test/inspection helper — total recorded spend for a job. */
export function getJobSpend(jobId: string): number {
  return spendLog
    .filter((r) => r.jobId === jobId)
    .reduce((sum, r) => sum + r.amountUsd, 0);
}
