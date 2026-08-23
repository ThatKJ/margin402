export interface TestCase {
  name: string;
  args: unknown[];
  expected?: unknown;
  /** True if calling the candidate with `args` must throw to pass. */
  expectThrow?: boolean;
}

export interface TestFailure {
  name: string;
  reason: string;
}

export interface VerifyResult {
  passed: number;
  total: number;
  failures: TestFailure[];
  /** True if the overall time budget ran out before every test could run. */
  timedOut: boolean;
  /** True if the worker itself died (e.g. hit the memory cap) rather than finishing normally. */
  crashed: boolean;
}
