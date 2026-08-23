import type { StrategyId } from "./strategies";

/**
 * Demo-mode canned candidate code for parseDuration, keyed by strategy.
 * Hand-verified against the real sandbox verifier (src/lib/sandbox) and the
 * real 8-test suite (src/lib/workloads/parse-duration.ts) to produce exactly
 * the canonical demo's pass counts:
 *   draft   -> 5/8  (missing: negative sign, overflow guard, malformed-input check)
 *   repair  -> 7/8  (fixes sign + malformed-input handling; still misses overflow)
 *   premium -> 8/8  (correct)
 *
 * These are never asserted as "5/8" etc. anywhere — every caller runs them
 * through the real verifier and gets back whatever it actually computes.
 */

export const DRAFT_CANDIDATE = `
function parseDuration(input) {
  const re = /(\\d+)([hms])/g;
  let match;
  let total = 0;
  while ((match = re.exec(input)) !== null) {
    const value = Number(match[1]);
    const unit = match[2];
    const mult = unit === 'h' ? 3600 : unit === 'm' ? 60 : 1;
    total += value * mult;
  }
  return total;
}
`;

export const REPAIR_CANDIDATE = `
function parseDuration(input) {
  const trimmed = String(input).trim();
  if (trimmed.length === 0) throw new Error('empty duration');
  let negative = false;
  let rest = trimmed;
  if (rest[0] === '-') { negative = true; rest = rest.slice(1); }
  const re = /(\\d+)([hms])/g;
  let match;
  let total = 0;
  let consumed = 0;
  let any = false;
  while ((match = re.exec(rest)) !== null) {
    any = true;
    consumed += match[0].length;
    const value = Number(match[1]);
    const unit = match[2];
    const mult = unit === 'h' ? 3600 : unit === 'm' ? 60 : 1;
    total += value * mult;
  }
  if (!any || consumed !== rest.length) throw new Error('invalid duration format');
  return negative ? -total : total;
}
`;

export const PREMIUM_CANDIDATE = `
function parseDuration(input) {
  const trimmed = String(input).trim();
  if (trimmed.length === 0) throw new Error('empty duration');
  let negative = false;
  let rest = trimmed;
  if (rest[0] === '-') { negative = true; rest = rest.slice(1); }
  const re = /(\\d+)([hms])/g;
  let match;
  let total = 0;
  let consumed = 0;
  let any = false;
  while ((match = re.exec(rest)) !== null) {
    any = true;
    consumed += match[0].length;
    const value = Number(match[1]);
    const unit = match[2];
    const mult = unit === 'h' ? 3600 : unit === 'm' ? 60 : 1;
    total += value * mult;
  }
  if (!any || consumed !== rest.length) throw new Error('invalid duration format');
  if (total > Number.MAX_SAFE_INTEGER) throw new RangeError('duration overflow');
  return negative ? -total : total;
}
`;

export const DEMO_CANDIDATES_BY_STRATEGY: Record<StrategyId, string> = {
  s1: DRAFT_CANDIDATE,
  s2: REPAIR_CANDIDATE,
  s3: PREMIUM_CANDIDATE,
};
