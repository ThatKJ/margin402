import { DEMO_CANDIDATES_BY_STRATEGY } from "./candidates";
import type { StrategyId } from "./strategies";
import type { TestFailure } from "../sandbox/types";

export interface GenerateArgs {
  strategyId: StrategyId;
  problemDescription: string;
  functionName: string;
  /** Failing tests from the most recent attempt, fed back in for repair-style strategies. */
  previousFailures?: TestFailure[];
}

/**
 * Demo mode is the safe default — model/inference failures must never be
 * able to take down the Sunday demo. Set DEMO_MODE=false to call a real LLM.
 */
export function isDemoMode(): boolean {
  return process.env.DEMO_MODE !== "false";
}

/**
 * Returns candidate code for a strategy. Demo mode returns the pre-verified
 * canned candidate (see candidates.ts) regardless of input — deterministic,
 * free, and never fails. Live mode calls an actual model. Either way, what
 * comes back is just a string of code; the caller (the sandbox verifier)
 * decides pass/fail for real — nothing here fakes a test result.
 */
export async function generateCandidate(args: GenerateArgs): Promise<string> {
  if (isDemoMode()) {
    const code = DEMO_CANDIDATES_BY_STRATEGY[args.strategyId];
    if (!code) throw new Error(`no demo candidate for strategy ${args.strategyId}`);
    return code;
  }
  return generateViaLLM(args);
}

async function generateViaLLM(args: GenerateArgs): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("DEMO_MODE=false but OPENAI_API_KEY is not set — cannot call a live model");
  }

  const failureContext = args.previousFailures?.length
    ? `\n\nThe previous attempt failed these tests — fix them:\n${args.previousFailures
        .map((f) => `- ${f.name}: ${f.reason}`)
        .join("\n")}`
    : "";

  const prompt =
    `Write a single JavaScript function named ${args.functionName} that solves this problem:\n\n` +
    `${args.problemDescription}${failureContext}\n\n` +
    "Reply with ONLY the function definition in a ```javascript code block — no explanation, no other text.";

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.2,
    }),
  });

  if (!response.ok) {
    throw new Error(`OpenAI request failed: ${response.status} ${await response.text()}`);
  }

  const data = (await response.json()) as { choices?: { message?: { content?: string } }[] };
  const content = data.choices?.[0]?.message?.content ?? "";
  const match = content.match(/```(?:javascript|js)?\s*([\s\S]*?)```/);
  const code = (match ? match[1] : content).trim();
  if (!code) throw new Error("live model response did not contain any code");
  return code;
}
