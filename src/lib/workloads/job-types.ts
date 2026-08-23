import { PARSE_DURATION_PROBLEM, PARSE_DURATION_TESTS, VISIBLE_TEST_COUNT, HIDDEN_TEST_COUNT } from "./parse-duration";

/**
 * The job-type registry — what turns "Margin402 happens to demo one fixed
 * task" into "Margin402 is an agent-job protocol with one genuinely
 * verifiable job type today." This is a presentation/selection layer only:
 * it does not change what the orchestrator executes or how verify() works
 * (still exactly PARSE_DURATION_PROBLEM/PARSE_DURATION_TESTS — see
 * run-job.ts). Do not add a second entry here unless a second real,
 * server-verified job type actually exists; an entry with no working
 * verifier behind it is exactly the "pretend it can verify anything"
 * failure mode this registry exists to avoid.
 */
export interface JobType {
  id: string;
  jobTypeLabel: string;
  title: string;
  publicOutcomeDescription: string;
  functionSignature: string;
  testCount: number;
  visibleTestCount: number;
  hiddenTestCount: number;
  verifiedBy: string;
  status: "available";
}

export const DEMO_DURATION_PARSER: JobType = {
  id: "demo_duration_parser",
  jobTypeLabel: "Code Repair",
  title: "Duration Parser Repair",
  publicOutcomeDescription: PARSE_DURATION_PROBLEM.description,
  functionSignature: PARSE_DURATION_PROBLEM.signature,
  testCount: PARSE_DURATION_TESTS.length,
  visibleTestCount: VISIBLE_TEST_COUNT,
  hiddenTestCount: HIDDEN_TEST_COUNT,
  verifiedBy: "Automated tests",
  status: "available",
};

/** Labeled honestly as not-yet-real rather than omitted outright — communicates the registry is extensible without claiming a verifier exists for them. */
export const PLANNED_JOB_TYPES: { jobTypeLabel: string }[] = [
  { jobTypeLabel: "Structured Extraction" },
  { jobTypeLabel: "Security Analysis" },
];

export const JOB_TYPES: JobType[] = [DEMO_DURATION_PARSER];

export function getDefaultJobType(): JobType {
  return DEMO_DURATION_PARSER;
}

/** A fresh reference Customer Agent identity for this browser session — the demo operator's agent, not the operator themselves. */
export function generateCustomerAgentId(): string {
  return `demo-agent-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
}
