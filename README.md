# Margin402

**Margin402 doesn't guarantee profit. It guarantees the outcome.**

Margin402 is fixed-price, outcome-guaranteed AI code execution. A customer — typically an
autonomous agent or a CI pipeline, not a human clicking buttons — buys a verified outcome at a
fixed price. Margin402 decides internally how to spend its own execution budget to reach that
outcome, and absorbs the loss when the real cost of getting there runs over.

The first (and currently only) workload: *"make this JavaScript function pass these 8 tests."*
Binary, no partial credit. The verifier is in-house, free, and deliberately not for sale — it's
the oracle Margin402 is judged against, so it can't also be a paid participant in its own economics.

---

## 1. The Problem

Autonomous agents increasingly need to buy work, not just call APIs:

- A task may require multiple paid attempts before it succeeds.
- The agent has a budget, not infinite money.
- The cheapest provider is not always the cheapest *path to success* — a cheap provider that
  fails half the time can cost more in expectation than an expensive one that rarely fails.
- Paying for a failed attempt is a sunk cost with no recourse — the agent bears 100% of the risk
  of provider failure, on every single call.
- Nobody is watching. A human can't review every one of a fleet of agents' micro-decisions in
  real time, so the payment and provider-selection logic has to be trustworthy on its own.

## 2. The Solution

Margin402 is **outcome-underwriting infrastructure for autonomous software work**.

The machine customer gives Margin402 three things: a task, a test suite, and a price (the quote,
or one counteroffer). Margin402 then owns every decision from there:

- which provider strategy to try first
- how much to spend, and when to stop trying a strategy that isn't working
- when to reject a price it can technically afford, because a cheaper path is still available
- when to escalate to a more expensive, more reliable strategy
- when continuing to spend is still the right call even though the job is now unprofitable
- when to give up and refund instead

The customer is not buying model tokens or API calls. **The customer is buying a verified
outcome at a quoted price** — the economic risk of getting there belongs to Margin402, not to them.

## 3. Why x402

A machine cannot reasonably create an account with every provider it might need, hold a credit
card, manage a pile of API keys, or manually approve a subscription checkout flow. Machine-to-
machine commerce needs payment that is as programmable as the request itself:

```text
Machine
   ↓
Margin402 (quote → accept → orchestrate)
   ↓
Paid provider (x402: 402 → sign → retry → settle)
   ↓
Verified result
   ↓
Machine
```

x402 turns "pay for this" into a normal part of an HTTP request/response cycle: no session, no
stored card, no human approval step — just a 402 challenge, a signed payment, and a retry. That's
what lets Margin402 pay per attempt, per strategy, per round, entirely under its own economic
logic, with no human in the loop. If x402 were removed, this product would have nothing left to
automate the payment side with — it would be back to manual invoicing, which defeats the point.

## 4. Why Algorand

- **Testnet** implementation throughout — every payment in this repository settles on Algorand
  Testnet, verifiable independently on [Lora](https://lora.algokit.io/testnet).
- **USDC ASA `10458941`** (testnet) — a stable unit of account for micropayments as small as $0.05.
- Fast finality and low, predictable fees make per-request settlement viable at the price points
  this product actually charges (as low as $0.05 per provider call).
- The architecture is network-agnostic beyond a handful of constants (see §14) — moving to
  mainnet is a configuration change, not a rewrite. This repository deliberately stays on
  testnet; see §11 for why.

## 5. Real x402 Flow

```text
Request
   ↓
402 Payment Required
   ↓
Client signs payment (treasury wallet, @x402/avm)
   ↓
Retry with X-PAYMENT
   ↓
GoPlausible facilitator — verify
   ↓
GoPlausible facilitator — settle
   ↓
Algorand Testnet transaction
   ↓
Paid service responds
   ↓
Transaction-linked receipt
```

Every step above is real, running code — not a mock:

| Step | Code |
|---|---|
| 402 challenge | [`src/lib/providers/create-provider-route.ts`](src/lib/providers/create-provider-route.ts) via `@x402/next`'s `withX402` |
| Client signs + retries | [`src/lib/x402/buyer.ts`](src/lib/x402/buyer.ts) via `@x402/fetch`'s `wrapFetchWithPayment` |
| Facilitator verify/settle | [`src/lib/x402/server.ts`](src/lib/x402/server.ts) — `HTTPFacilitatorClient` against GoPlausible |
| Network identity | [`src/lib/x402/network.ts`](src/lib/x402/network.ts) — full CAIP-2 genesis-hash form, matched exactly against the facilitator's own `/supported` response |
| Receipt | Real `txId` decoded from the `PAYMENT-RESPONSE` header, carried on every `payment` SSE event and aggregated onto the final `closed` event's `settlements[]` |

**This flow has been run for real** against Algorand Testnet — see §16 for a verified transaction.

## 6. Architecture

See [`docs/diagrams.md`](docs/diagrams.md) for the five core diagrams (system architecture,
payment flow, outcome-underwriting loop, economic decision, canonical demo timeline).

One Next.js (App Router, TypeScript) application. No other services.

- **UI + orchestrator + provider routes**, all in the same app — `/quote`, `/execution`,
  `/statement` on the customer side; `/api/providers/{draft,repair,premium}` as the x402-gated
  "simulated provider market" Margin402 buys from.
- **Economics engine** (`src/lib/economics/`) — pure functions, no I/O: strategy selection by
  expected cost-to-success, a separate affordability check, and the honouring rule. Nothing here
  touches payments or the network.
- **Orchestrator** (`src/lib/orchestrator/run-job.ts`) — the state machine that sequences
  decide → pay → verify → record → repeat, streaming every step as a Server-Sent Event.
- **Sandbox** (`src/lib/sandbox/`) — `node:vm` inside a `worker_thread`, no Docker: a 2-second
  total budget, 500ms per test, 64MB memory cap, and a hard-kill backstop. Verification never
  fakes pass/fail, in demo mode or otherwise.
- **x402 payment layer** (`src/lib/x402/`) — real buyer and resource-server wiring against
  Algorand Testnet via the GoPlausible facilitator.
- **Machine API** (`/api/quote`, `/api/jobs/execute`) — the same product, over plain HTTP, with
  zero UI dependency.
- **State** — no database. Job state lives in a React context on the client for the length of one
  browser session; on the server, an in-memory idempotency guard (`active`/`settled` sets) is all
  that's needed to prevent a duplicate real payment.

## 7. Canonical Demo

```text
Quote:          $1.20
Counteroffer:   $1.05 → accepted

Draft      $0.05   5/8 tests
Repair     $0.09   7/8 tests
Premium    $0.85   AFFORDABLE — REJECTED (economically inferior to an available alternative)
Repair     $0.09   7/8 tests
Premium    $1.05   8/8 tests — accepted under the honouring rule

Total execution:  $1.28
Revenue:           $1.05
Margin:           -$0.23
Outcome:           VERIFIED
```

The negative margin is **intentional, not a bug** — it's the entire thesis made concrete.
Margin402 had already accepted the job at $1.05; when the only path left to a verified outcome
cost more than what remained of the budget, it paid anyway rather than refund, because delivering
at a loss cost less than refunding after sunk spend. The customer got exactly what they were
quoted. Margin402 absorbed the difference.

Reproduce this exact scenario yourself, over plain HTTP, with `npm run machine:smoke`.

## 8. Hidden Tests

The workload ships 8 tests: 6 visible, 2 hidden. Providers (whether a canned demo candidate or a
live model call) only ever see the visible 6 — the hidden pair exists purely to catch code that
special-cases what it can see rather than solving the actual problem.

Every attempt is verified against **all 8**, visible and hidden alike, by the same sandboxed
`verify()` call — there's no separate, looser check for what the provider was shown.
`run-job.ts`'s `visibleFailuresOnly()` guarantees a hidden test's name or failure reason never
reaches `previousFailures`, which is what gets fed back into the next provider call (and, in live
mode, into an actual LLM prompt) — regression-tested in
[`run-job.test.ts`](src/lib/orchestrator/__tests__/run-job.test.ts).

## 9. Economic Decision

Two separate questions, deliberately never merged into one:

- **Affordability** — *can we technically pay this, given what's left of the budget?*
- **Economic rationality** — *is paying this the cheapest expected path to a verified outcome,
  given the alternatives still available?*

`selectStrategy()` answers the second question first, using only expected cost-to-success —
affordability plays no part in choosing a winner. Only afterward is the winner checked against
the remaining budget. That ordering is what makes it possible for Margin402 to say:

> "We can afford $0.85. We're rejecting it anyway, because $0.09 is a better expected bet
> right now."

Every such rejection carries a fixed, literal reason string
(`Payment rejected: economically inferior to available alternative.`) — never a budget
explanation — so a rejection is provably economic, not a disguised "insufficient funds."

## 10. Important Limitation

**Be honest about this: the three provider strategies (Draft, Repair, Premium) are endpoints
Margin402 itself owns**, not independent third-party providers. The price curve driving them is
scripted and deterministic, labelled "simulated provider market" everywhere it appears in the UI.

What *is* real regardless: the x402 payment rail and the Algorand settlement. Every provider call
still goes through a genuine 402 → sign → retry → facilitator-verify → facilitator-settle round
trip, and a genuine transaction lands on Algorand Testnet — the protocol integration being
demonstrated doesn't change based on who happens to be on the receiving end.

The statement screen also separates three numbers that must never be conflated:

- **Revenue** — what the customer actually paid.
- **Execution cost** — the real sum of every payment Margin402 made this job.
- **Ext. inference cost** — shown honestly as **"Not tracked"** rather than a fabricated number,
  since this build has no separate external-inference metering to report.

## 11. Test Commands

Every command below exists in `package.json` and does what it says — nothing here is aspirational.

```bash
npm install                # install dependencies
npm run dev                 # start the dev server (real x402 payments by default)
npm test                    # run the full test suite (44+ tests, no network/payment involved)
npx tsc --noEmit             # typecheck
npm run lint                 # eslint
npm run build                 # production build

npm run economics:demo       # print the economics engine's decisions for the canonical scenario
npm run machine:smoke        # prove the machine-customer API (quote → counteroffer → execute) over plain HTTP
npm run job:demo             # run one full job against a running dev server (real x402 payments unless PROVIDER_CLIENT_MODE=inprocess)
npm run payment:smoke        # alias of x402:testnet-smoke
npm run x402:testnet-smoke   # ONE real x402 payment against Algorand Testnet — needs a funded TREASURY_MNEMONIC
npm run wallet:opt-in-usdc   # one-time: opt the treasury wallet into testnet USDC (asset 10458941)
```

`payment:smoke` / `x402:testnet-smoke` and `job:demo` spend real (zero-value, testnet-only) USDC.
Everything else is free to run repeatedly.

## 12. Environment Variables

See [`.env.example`](.env.example) for the authoritative, commented list. Summary:

| Variable | Purpose |
|---|---|
| `TREASURY_MNEMONIC` | 25-word mnemonic for the custodial server-side Algorand Testnet wallet. Never commit a real value. |
| `FACILITATOR_URL` | GoPlausible facilitator endpoint (defaults to the public one) |
| `ALGOD_URL` | Public Algorand Testnet node (defaults to Algonode, no key required) |
| `ECHO_PRICE_USD` | Price of the `/api/providers/echo` smoke-test route |
| `SPEND_CAP_PER_JOB_USD` / `SPEND_CAP_PER_HOUR_USD` | Hard spend guard — every payment call is checked against both before it runs |
| `DEMO_MODE` | `true` (default): candidate code is a pre-verified canned response, never a live model call. Payments, the sandbox, and the economics engine are real either way. |
| `OPENAI_API_KEY` | Only needed when `DEMO_MODE=false` |
| `PROVIDER_CLIENT_MODE` | Unset (default): real x402 payments. `inprocess`: local-only, zero-payment escape hatch for safely exercising the orchestrator/UI |
| `JOB_DEMO_REVENUE` | Revenue `npm run job:demo` uses (defaults to the canonical $1.05) |

Never put real secrets in this file or in the README — `.env` is gitignored.

## 13. Deployment

1. Provision a Next.js host (Vercel or equivalent).
2. Set every variable from §12 in the host's environment config — at minimum
   `TREASURY_MNEMONIC` (a funded Algorand Testnet wallet, opted into USDC ASA `10458941`),
   `FACILITATOR_URL`, and `ALGOD_URL`.
3. Leave `PROVIDER_CLIENT_MODE` unset in production — that's what makes payments real.
4. `npm run build && npm run start`.
5. No database, no queue, no cache to provision — this app is deliberately a single deployable
   unit.

Moving from testnet to mainnet later is a configuration change (network constant, ASA id,
facilitator URL, a mainnet-funded wallet), not an architecture change — see
[`src/lib/x402/network.ts`](src/lib/x402/network.ts).

## 14. Judge Quickstart

If you only have two minutes:

1. `npm install && npm run dev`, open `/quote`.
2. Pick a plan — Lowest Cost, Best Value (recommended), or Highest Confidence — then accept,
   or submit one counteroffer (try $1.05 on Best Value).
3. Watch `/execution` stream live — the moment that matters is **Premium requested at $0.85,
   rejected on screen** even though it's affordable.
4. Watch `/statement` land on **Margin −$0.23, Outcome VERIFIED**.
5. Check the footer in small grey type for the real Algorand Testnet settlement proof.
6. Run `npm run machine:smoke` in a second terminal to see the identical scenario happen with
   zero browser involved.

## 15. Real Settlement Proof

Real x402 payments have been run against this exact codebase and independently verified
on-chain (not from application logs) via the Algorand Testnet indexer — both an isolated
smoke payment and, more importantly, **the canonical demo's own final Premium payment**,
settling for real at the exact honouring-rule moment that produces the $-0.23 margin:

```text
Isolated smoke test — npm run x402:testnet-smoke
Transaction ID:  XCAIMTNX36Z4CV4BY4R35UA6LKE3QEX5CRY6ISJWITVPDHBIGYFQ
Network:         Algorand Testnet
Asset:           USDC (ASA 10458941)
Amount:          $0.01 (10000 base units, axfer)
Facilitator:     GoPlausible
Fee:             0 (sponsored by the facilitator)
Confirmed round: 66569692
Lora:            https://lora.algokit.io/testnet/transaction/XCAIMTNX36Z4CV4BY4R35UA6LKE3QEX5CRY6ISJWITVPDHBIGYFQ

Canonical demo, final Premium payment — npm run machine:smoke
Transaction ID:  PSPHKWWGDD6NZQY2GT4YKIN6K5K5IG3VMIJCAM4MXCVZOI6TEVYA
Network:         Algorand Testnet
Asset:           USDC (ASA 10458941)
Amount:          $1.05 (1050000 base units, axfer)
Facilitator:     GoPlausible
Confirmed round: 66569993
Lora:            https://lora.algokit.io/testnet/transaction/PSPHKWWGDD6NZQY2GT4YKIN6K5K5IG3VMIJCAM4MXCVZOI6TEVYA
```

That second transaction is the honouring-rule payment itself — Margin402 paying $1.05 against
a $1.05 quote because the only remaining path to a verified outcome cost more than what was
left of the budget. It settles on Algorand Testnet exactly like every other payment in this
codebase; nothing about the "loss" in the canonical demo is simulated.

Reproduce with `npm run x402:testnet-smoke` (isolated) or `npm run machine:smoke` (the full
scenario, real payments unless `PROVIDER_CLIENT_MODE=inprocess`) against a funded testnet
wallet, or verify either transaction above directly on Lora / any Algorand Testnet indexer.
