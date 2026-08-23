export function formatUsd(value: number): string {
  const sign = value < 0 ? "−" : "";
  return `${sign}$${Math.abs(value).toFixed(2)}`;
}

export function formatTestsAsCode(
  tests: { name: string; args: unknown[]; expected?: unknown; expectThrow?: boolean }[],
  functionName: string,
): string {
  return tests
    .map((t) => {
      const args = t.args.map((a) => JSON.stringify(a)).join(", ");
      if (t.expectThrow) return `${functionName}(${args})${" ".repeat(Math.max(1, 28 - args.length))}// throws`;
      return `${functionName}(${args}) === ${JSON.stringify(t.expected)}`;
    })
    .join("\n");
}
