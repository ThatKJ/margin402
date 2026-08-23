# Margin402

**Margin402 doesn't guarantee profit. It guarantees the outcome.**

Margin402 lets an AI agent buy a *finished, verified result* at one fixed price, instead of
paying for every attempt along the way. The agent picks a price. Margin402 does whatever
work it takes to deliver — trying providers, paying for attempts, retrying, escalating,
occasionally eating a loss — and hands back either a verified result or a refund.

## Contents

1. [Margin402 in 30 seconds](#margin402-in-30-seconds)
2. [The problem](#the-problem)
3. [The idea](#the-idea)
4. [Who is the customer?](#who-is-the-customer)
5. [What happens when you click run](#what-happens-when-you-click-run)
6. [Architecture](#architecture)
7. [How x402 is used](#how-x402-is-used)
8. [Why Algorand](#why-algorand)
9. [Customer Agent + Pera Wallet](#customer-agent--pera-wallet)
10. [The three execution plans](#the-three-execution-plans)
11. [The economics engine](#the-economics-engine)
12. [Canonical demo scenario](#canonical-demo-scenario)
13. [Verification and hidden tests](#verification-and-hidden-tests)
14. [Real Algorand Testnet proof](#real-algorand-testnet-proof)
15. [What is real vs. simulated](#what-is-real-vs-simulated)
16. [Machine API](#machine-api)
17. [Running locally](#running-locally)
18. [Test commands](#test-commands)
19. [Environment variables](#environment-variables)
20. [Security](#security)
21. [Current limitations](#current-limitations)
22. [Judge quickstart](#judge-quickstart)
23. [Why Margin402 is different](#why-margin402-is-different)

## Live Demo

- **Web app:** [margin402.vercel.app](https://margin402.vercel.app)
- **Repository:** [github.com/ThatKJ/margin402](https://github.com/ThatKJ/margin402)
- **Network:** Algorand Testnet
- **Payment protocol:** x402
- **Wallet demo:** Pera Wallet (Testnet)

## Margin402 in 30 seconds

Normally, an AI agent pays every time it calls another service. If the first four attempts
fail and the fifth one succeeds, the agent still paid for all five.

Margin402 changes the unit of purchase from *attempt* to *outcome*.

A customer agent agrees to one fixed price for a verified result. Margin402 then:

1. chooses which provider to try,
2. pays that provider with a real x402 payment,
3. checks the result against a real test suite,
4. retries or switches strategy if it isn't good enough,
5. changes its mind mid-run if the economics change,
6. returns the verified result — or refunds the customer.

If the real cost of getting there is more than the contract price, Margin402 absorbs the
loss. The customer never sees it.

## The problem

Imagine an AI agent needs another AI service to fix a broken function.

- Provider A costs $0.05 but often fails.
- Provider B costs $0.09 and is more reliable.
- Provider C costs a lot more, but succeeds most of the time.

Normally the calling agent has to decide who to try, pay for every attempt (successful or
not), track failures, decide when to retry versus escalate, and absorb 100% of the risk that
a provider just doesn't work out. Nobody is watching a fleet of agents make these calls in
real time, so the payment and provider-selection logic has to be trustworthy entirely on
its own.

## The idea

Margin402 is **outcome-underwriting infrastructure**: it sells a finished, verified result
at a fixed price it decided in advance, then carries the risk of actually producing it.

**Outcome underwriting**, plainly: Margin402 accepts a fixed-price contract before it knows
exactly what the work will cost. If it finishes cheaply, it keeps the difference. If the job
gets expensive, Margin402 may lose money on that one job — the customer still gets the
result at the price they were quoted.

The customer gives Margin402 a task, a test suite, and a price (the quote, or one
counteroffer). From there, Margin402 owns every decision:

- which provider to try first,
- how much to spend, and when to stop trying something that isn't working,
- when to *reject* a provider it can technically afford, because a cheaper path is still
  available,
- when to escalate to a pricier, more reliable option,
- when continuing to spend is still the right call even though the job has already stopped
  being profitable,
- when to give up and refund instead.

## Who is the customer?

```text
Human judge
    │
    │ configures the demo, approves Pera's signature prompt
    ▼
Customer Agent  (reference implementation: this web app + a connected Pera wallet)
    │
    │ x402 payment for a verified-outcome contract
    ▼
Margin402
    │
    │ x402 payments for individual provider attempts
    ▼
Provider Agents
```

The **customer is an AI agent**, not a human doing a checkout flow. The web app at `/quote`
is a *reference Customer Agent console* — for the hackathon demo a human judge configures
it and approves its Testnet wallet signature, but a production customer would be another
piece of software calling the exact same API directly, with no human involved (see
[Machine API](#machine-api)). Don't read the wallet-connect UI as "Margin402 became a
consumer checkout app" — it's a demo harness around an agent-to-agent protocol.

## What happens when you click run

1. A Customer Agent asks for an outcome.
2. Margin402 returns a fixed-price quote (three plans, actually — see below).
3. The agent accepts a plan, or sends one counteroffer.
4. Margin402 accepts or declines the counteroffer against its own reservation floor.
5. The Customer Agent gets a real x402 `402 Payment Required` challenge for the accepted
   price.
6. Pera Wallet signs the Testnet payment.
7. Margin402's facilitator confirms real on-chain settlement — only *then* is the job marked
   paid.
8. Margin402 starts spending its own budget on provider attempts.
9. Every attempt is verified by a real, in-house test run — never rubber-stamped.
10. Margin402 changes strategy between rounds as the economics change.
11. The job ends **VERIFIED** (all tests pass) or is refunded per the rules below.
12. The Statement page shows the real economics and links every settlement to its Algorand
    Testnet transaction.

## Architecture

```text
                    HUMAN / JUDGE
                         │
                  configures demo
                         │
                         ▼
                  CUSTOMER AGENT
                Pera Wallet signer
                         │
                 x402 customer payment
                         │
                         ▼
                    MARGIN402
             ┌───────────┼───────────┐
             │           │           │
          Economics   Verifier   Orchestrator
             │                       │
             └───────────┬───────────┘
                         │
               x402 provider payments
                         │
             ┌───────────┼───────────┐
             ▼           ▼           ▼
           Draft       Repair      Premium
             │           │           │
             └───────────┴───────────┘
                         │
                    verification
                         │
                         ▼
                     VERIFIED
```

One Next.js (App Router, TypeScript) application handles the UI, the orchestrator, and every
provider route — there's no separate backend service. It talks to two external things: an
x402 facilitator (GoPlausible) and Algorand Testnet, both over real network calls, plus a
managed Redis instance for job/contract state (see [State](#redis-not-in-memory) below).

- **UI + Customer Agent console** (`/quote`, `/execution`, `/statement`) — a human-operable
  reference implementation of the same API a machine agent would call directly.
- **Economics engine** (`src/lib/economics/`) — pure functions, no I/O: strategy selection
  by expected cost-to-success, a separate affordability check, and the honouring rule.
- **Orchestrator** (`src/lib/orchestrator/run-job.ts`) — the state machine that sequences
  decide → pay → verify → record → repeat, streaming every step as a Server-Sent Event.
- **Sandbox verifier** (`src/lib/sandbox/`) — `node:vm` inside a `worker_thread`: a 2-second
  total budget, 500ms per test, a 64MB memory cap, and a hard-kill backstop. Nothing here
  ever fakes a pass.
- **x402 payment layer** (`src/lib/x402/`) — real buyer/signer wiring for both payment
  directions (see below), against Algorand Testnet via GoPlausible.
- **Provider routes** (`/api/providers/{draft,repair,premium,echo}`) — x402-gated endpoints
  Margin402 itself owns and pays, standing in for a "simulated provider market" (see
  [What is real vs. simulated](#what-is-real-vs-simulated)).
- **Machine API** (`/api/quote`, `/api/jobs/authorize`, `/api/jobs/execute`) — the same
  product, over plain HTTP, with zero UI dependency.

### Redis, not in-memory

Job/contract state — "which price did this customer actually accept, and have they paid
yet" — has to survive between the request that creates a quote and the request that
authorizes payment, which in production are genuinely separate serverless function
invocations, sometimes minutes apart while a human is off signing in Pera. A plain
in-memory `Map` works locally (one warm process) but silently loses jobs in production once
two requests land on different instances — that was a real bug caught during this build,
not a hypothetical. Job state now lives in Redis (a managed Vercel add-on), behind a small
`JobStore` interface with a matching in-memory adapter still used for local dev and the test
suite. Nothing else in the app needs a database.

## How x402 is used

x402 turns "pay for this" into a normal part of an HTTP request/response cycle:

```text
Request
   ↓
402 Payment Required
   ↓
Wallet signs a payment
   ↓
Request retried, carrying proof of payment
   ↓
Facilitator verifies, then settles, on Algorand Testnet
   ↓
API returns the result
```

**x402** is an HTTP payment protocol: a server can reply `402 Payment Required` instead of
serving the resource, the client signs a payment and retries, and the facilitator verifies
and settles it — all inside one logical request. No accounts, no stored cards, no human
approval step in the loop.

Margin402 runs this **twice**, in opposite directions:

```text
CUSTOMER SIDE                          PROVIDER SIDE
Customer Agent                         Margin402
      ↓ HTTP request                        ↓ provider request
402 Payment Required                   402 Payment Required
      ↓ Pera signs                          ↓ treasury signs
request retried                        request retried
      ↓                                     ↓
Margin402 receives payment              provider gets paid
```

**Margin402 is both a seller and a buyer.** It sells a verified outcome to the Customer
Agent, then uses part of that revenue to buy individual attempts from provider agents. The
statement page's Revenue / Execution cost / Margin numbers are a direct readout of that:
real money in from one side, real money out the other, two genuinely distinct wallets (see
below).

x402 headers actually used by this build (v2 protocol, installed SDK `2.23.0` — this is
**not** the older `X-PAYMENT` header some x402 docs still reference):

| Step | Header |
|---|---|
| Server issues a payment challenge | `PAYMENT-REQUIRED` |
| Client retries with a signed payment | `PAYMENT-SIGNATURE` |
| Server confirms settlement | `PAYMENT-RESPONSE` |

## Why Algorand

Margin402 makes many small payments per job — five in the canonical scenario below, as low
as $0.05 each — so the network needs to be cheap and fast enough that per-attempt settlement
is actually viable, not just a demo trick.

- **Testnet** throughout — every payment in this app settles on Algorand Testnet,
  independently checkable on [Lora](https://lora.algokit.io/testnet) or any Testnet
  indexer.
- **USDC ASA `10458941`** (Testnet) — a stable unit of account for micropayments.
- Fast finality and low, predictable fees make sub-dollar, per-request settlement realistic.
- Moving to Mainnet later is a configuration change (network constant, ASA id, facilitator
  URL, a funded wallet) — see [`src/lib/x402/network.ts`](src/lib/x402/network.ts) — not a
  rewrite. This repository stays on Testnet deliberately.

## Customer Agent + Pera Wallet

Pera Wallet gives the demo Customer Agent something to sign with — a Testnet-only,
browser-side keypair, standing in for whatever signer a real autonomous customer agent would
use.

```text
Human judge
    │
    │ approves the signature prompt
    ▼
Pera Wallet                    ← Customer Agent's signer. Browser-side, disposable.
    │
    │ x402 customer payment
    ▼
Margin402 Treasury              ← Margin402's own backend-only signer.
    │
    │ x402 provider payments
    ▼
Provider Agents
```

These are **two separate wallets that must never be confused**:

- **Pera Wallet** — the Customer Agent's signer. Lives in the browser. Margin402 never asks
  for its mnemonic or private key; Pera signs inside the wallet app and only ever hands back
  signed transaction bytes.
- **Margin402 treasury** — a server-only signer (`TREASURY_MNEMONIC`), used exclusively to
  pay providers. It never reaches the browser or a client bundle.

A connected wallet that happens to *be* the treasury would still settle a real transaction —
but it wouldn't prove anything about two genuinely distinct parties paying each other, which
is the whole point of this demo. The app checks for that specific case (`GET
/api/treasury-address` exposes the treasury's public, receiving-only address) and blocks
authorization with a clear warning instead of silently producing a same-wallet payment.

## The three execution plans

Read straight from [`src/lib/economics/plans.ts`](src/lib/economics/plans.ts) and
[`src/lib/providers/strategies.ts`](src/lib/providers/strategies.ts) — nothing below is
hand-tuned for this document.

| Plan | Price | Strategy |
|---|---:|---|
| **Lowest Cost** | $1.00 | Cheapest-first ladder: Draft, then Repair, then Premium — one tier at a time, escalating only once the current tier is exhausted. |
| **Best Value** (recommended) | $1.20 | Adaptive economics: every provider stays in play, re-ranked by expected cost-to-success after every single result. |
| **Highest Confidence** | $1.35 | Reliability-first: starts at the strongest provider and falls back reliability-first if needed. |

All three plans deliver the identical outcome guarantee (verified or refunded) — they only
differ in *how* Margin402 spends to get there.

The quote UI intentionally does **not** label anything "Confidence: X%". Lowest Cost and
Best Value both happen to start with Draft, so they'd show the identical number if reduced
to one metric — which reads as a bug, not a feature. Each plan's card instead shows its real
differentiator (strategy family, entry provider, and either a first-attempt estimate or an
adaptive-selection description, never both conflated).

### Provider market

The providers each plan draws from — read directly from `STRATEGY_CATALOG`, shown once, not
duplicated per plan:

| Provider | Modeled first-attempt success estimate | Character |
|---|---:|---|
| Draft | 35% | Low cost |
| Repair | 45% | Feedback-aware |
| Premium | 85% | Highest reliability |

That 35% / 45% / 85% is a **modeled first-attempt pass rate for one provider**, sourced
from the provider catalog — not an overall plan completion probability (Margin402 doesn't
currently compute one), not a guarantee, and not the same number as a verification result.
`Repair pSuccess = 45%` and `Repair result = 7/8 tests` are two different statistics; the
app never converts one into the other.

## The economics engine

Two questions, deliberately kept separate:

- **Affordability** — *can we technically pay this, given what's left of the budget?*
- **Economic rationality** — *is paying this the cheapest expected path to a verified
  outcome, given the alternatives still available?*

`selectStrategy()` answers the second question first, using only expected cost-to-success —
affordability plays no part in choosing a winner. Only afterward is the winner checked
against the remaining budget. That ordering is what lets Margin402 say:

> "We can afford $0.85. We're rejecting it anyway, because $0.09 is a better expected bet
> right now."

Every such rejection carries a fixed, literal reason string —
`Payment rejected: economically inferior to available alternative.` — never a budget
excuse, so a rejection is provably economic, not a disguised "insufficient funds." And it's
a genuine invariant, not just a label: a rejected option never gets an x402 payment at all
(see the canonical scenario below — no settlement exists for the rejected $0.85 attempt).

**The honouring rule**, in plain terms: once Margin402 has already spent money on a job, a
refund isn't free either — it means eating every dollar already spent *plus* the refund
itself. If the only path left to a verified outcome costs more than what remains of the
budget, but *less* than what a refund would cost at that point, Margin402 pays anyway and
finishes the job at a loss. Delivering at a loss beats refunding.

## Canonical demo scenario

This is the scripted, deterministic walkthrough this codebase is built around — reproduce it
yourself with `npm run machine:smoke` or `npm run economics:demo`.

| Step | Provider | Cost | Result | Margin402's decision |
|---|---|---:|---|---|
| 1 | Draft | $0.05 | 5/8 | Continue — cheapest expected path |
| 2 | Repair | $0.09 | 7/8 | Continue |
| 3 | Premium | $0.85 | — | **Rejected** — affordable, but economically inferior |
| 4 | Repair | $0.09 | 7/8 | Continue |
| 5 | Premium | $1.05 | 8/8 | **Verified** — honouring rule: pay anyway |

```text
Quote:          $1.20
Counteroffer:   $1.05 → accepted

Total execution:  $1.28
Revenue:           $1.05
Margin:           -$0.23
Outcome:           VERIFIED
```

Why the loss is deliberate: Margin402 had already accepted the job at $1.05. By round 5, the
only path left to a verified outcome cost more than what remained of that budget — but
refunding at that point would have meant losing the $0.23 already spent *plus* the refund
itself, a bigger loss than just finishing the job. So it paid the $1.05 Premium round,
delivered the verified result, and absorbed the difference. The customer paid exactly what
they were quoted; Margin402 carried the risk.

## Verification and hidden tests

The workload ships 8 tests: **6 visible, 2 hidden**. Providers — whether a canned demo
candidate or a live model call — only ever see the visible 6.

> Providers can see the public tests. They cannot see the hidden ones. Margin402 runs all
> eight itself, and a provider can never claim success on its own — only Margin402's own
> sandboxed `verify()` call decides. This exists specifically to stop a provider from
> special-casing the examples it can see instead of actually solving the problem.

Every attempt — visible or hidden result — is checked by the exact same `verify()` call;
there's no separate, looser check for what the provider was shown. A hidden test's name or
failure reason never leaks into what gets fed back to a repair-style provider on the next
round (regression-tested in
[`run-job.test.ts`](src/lib/orchestrator/__tests__/run-job.test.ts)).

## Real Algorand Testnet proof

Every transaction below was independently checked directly against the Algorand Testnet
indexer — not read from this app's own logs — confirming its network, asset, amount, sender,
and receiver. You don't need to trust Margin402's own bookkeeping; check them yourself on
[Lora](https://lora.algokit.io/testnet) or any Testnet indexer.

### One complete, coherent run — Best Value, $1.20

Real customer payment, signed by a Pera Wallet account genuinely distinct from the Margin402
treasury, followed by four real provider payments from that same job, ending VERIFIED:

| Direction | Amount | Transaction |
|---|---:|---|
| Customer Agent → Margin402 (Pera-signed) | $1.20 | [`B6VA5YG6XESZZDWXUQFDCWPUZ3XHFGKGTMI2HCOTC7JN5WVIGDBA`](https://lora.algokit.io/testnet/transaction/B6VA5YG6XESZZDWXUQFDCWPUZ3XHFGKGTMI2HCOTC7JN5WVIGDBA) |
| Margin402 → Draft | $0.05 | [`6VXFH6HYEZ5UM2ACRSEXGRIGSCNBNSHXSOATT5OPRA5OGJ6XOWRA`](https://lora.algokit.io/testnet/transaction/6VXFH6HYEZ5UM2ACRSEXGRIGSCNBNSHXSOATT5OPRA5OGJ6XOWRA) |
| Margin402 → Repair | $0.09 | [`OFH3BNPWETKVQLZVASOYW5IOJN4WV3BO6FWVOZ35CGQSKY7USEAQ`](https://lora.algokit.io/testnet/transaction/OFH3BNPWETKVQLZVASOYW5IOJN4WV3BO6FWVOZ35CGQSKY7USEAQ) |
| Margin402 → Repair (retry) | $0.09 | [`I2IOP5QQK3BR4TMV4AQWKM5TR2WEWQDWGAFENL5NN32MHXHH7QLQ`](https://lora.algokit.io/testnet/transaction/I2IOP5QQK3BR4TMV4AQWKM5TR2WEWQDWGAFENL5NN32MHXHH7QLQ) |
| Margin402 → Premium (honouring rule) | $1.05 | [`TWD26IWONKW4IXGRF2PIRUO3J2AD2BWS2UIQEZI676XQUFFM7R4Q`](https://lora.algokit.io/testnet/transaction/TWD26IWONKW4IXGRF2PIRUO3J2AD2BWS2UIQEZI676XQUFFM7R4Q) |

```text
Network:          Algorand Testnet
Asset:             USDC (ASA 10458941)
Facilitator:       GoPlausible
Customer sender:   Q6FEMLKJICY6KEVLEVJRPHYS6S6LU4JQ3VZC7UVYMUEV753J7HK5VMKC4U  (Pera — NOT the treasury)
Margin402 treasury: QRVBOLDQQHNYZFYWA2TGU26GC7OIF5DPVWT5ZLGNM3EO2YTUNTHYXRNZRY
Total execution:   $1.28
Revenue:            $1.20
Margin:            -$0.08
Outcome:            VERIFIED, 8/8 tests
```

This run took the direct-accept path on Best Value ($1.20) rather than the canonical
scenario's counteroffer path ($1.05), which is why the margin here is -$0.08 rather than
-$0.23 — same mechanics (the $0.85 Premium round was rejected economically before this
sequence, exactly as in the canonical scenario; no transaction exists for it, because
Margin402 never pays for a rejected option), different accepted price. Reproduce a live run
yourself from `/quote`, or over plain HTTP with `npm run machine:smoke`.

### One additional first-attempt success (for scale)

Not every run needs five rounds — this one settled on the first try:

| Direction | Amount | Transaction |
|---|---:|---|
| Customer Agent → Margin402 (Pera-signed) | $1.35 | [`LZPD364UGSUSCZ73543E7CRXQC5L7NIHQEOBIAFJIT44DNZ5HQGQ`](https://lora.algokit.io/testnet/transaction/LZPD364UGSUSCZ73543E7CRXQC5L7NIHQEOBIAFJIT44DNZ5HQGQ) |
| Margin402 → Premium | $0.55 | [`2HVY6WRDVRKRZHOE4YGMCUAC7OE3J5ALNK2QCQR37P2E2P2NGL5Q`](https://lora.algokit.io/testnet/transaction/2HVY6WRDVRKRZHOE4YGMCUAC7OE3J5ALNK2QCQR37P2E2P2NGL5Q) |

Highest Confidence, $1.35 accepted, Premium passed 8/8 on the first attempt: revenue $1.35,
execution cost $0.55, margin **+$0.80**, VERIFIED.

## What is real vs. simulated

| Part | Status |
|---|---|
| Customer Agent request / quote | Real |
| Economic decisions (selection, rejection, honouring rule) | Real |
| x402 `402` challenge | Real |
| Pera Wallet signing | Real |
| Algorand Testnet settlement | Real |
| Provider payment (x402) | Real |
| Verification sandbox | Real |
| Transaction receipts | Real — sourced from the facilitator's own confirmed settlement, never from client-reported data |
| Provider *market* (Draft/Repair/Premium as independent businesses) | **Simulated** — see below |
| Provider price curve | Scripted/deterministic |
| Candidate code generation | Canned when `DEMO_MODE=true` (default); a real model call when `false` |

Be plainly honest about the one simplification: **Draft, Repair, and Premium are endpoints
Margin402 itself owns**, not independent third parties — labelled "simulated provider
market" everywhere it appears in the UI. What's real regardless of who's on the receiving
end: the full 402 → sign → retry → facilitator-verify → facilitator-settle round trip, and a
genuine transaction landing on Algorand Testnet every time. The protocol integration doesn't
change based on who's being paid.

## Machine API

The web console and the machine API are the same product — a human operating `/quote` and a
piece of autonomous software calling these routes directly reach the identical Margin402
backend:

```text
Human-operated demo console                Autonomous software
        ↓                                          ↓
Customer Agent request                    Customer Agent request
        ↓                                          ↓
              same Margin402 backend
```

| Route | Method | What it does |
|---|---|---|
| `/api/quote` | `POST` | Get the three plans, submit a counteroffer, or accept a plan (returns a `jobId`) |
| `/api/jobs/authorize` | `GET` | x402-gated. Unpaid → real `402` at the job's accepted price. Already-settled → `409`, no fresh challenge. |
| `/api/jobs/execute` | `GET` | Streams the run as Server-Sent Events. Requires a durably-`PAID` job (or the legacy `revenue=` machine path). |
| `/api/providers/{draft,repair,premium,echo}` | `GET` | x402-gated provider endpoints Margin402 itself pays |
| `/api/treasury-address` | `GET` | The treasury's public, receiving-only address |

One realistic end-to-end example:

```bash
curl -s -X POST http://localhost:3000/api/quote \
  -H 'Content-Type: application/json' \
  -d '{"planId":"best-value","accept":true}'
# -> { jobId, acceptedPrice: 1.2, authorize: { url: ".../api/jobs/authorize?jobId=..." }, ... }

curl -i "http://localhost:3000/api/jobs/authorize?jobId=<jobId>"
# unpaid -> 402 with real payment requirements at $1.20
# pay it (a real x402 client signs and retries), then:

curl -N "http://localhost:3000/api/jobs/execute?jobId=<jobId>"
# streams real orchestrator events: decisions, x402 payments, verification, final statement
```

## Running locally

```bash
npm install
npm run dev
```

Then open `http://localhost:3000`.

**Before you touch payment commands:** the dev server makes **real** x402 payments by
default (zero-value Testnet USDC, but genuine on-chain transactions). Set
`PROVIDER_CLIENT_MODE=inprocess` if you want to exercise the orchestrator/UI without
spending anything.

## Test commands

Every command below exists in `package.json` and does exactly what it says.

```bash
npm test                    # full test suite (90+ tests) — no network or payment involved
npx tsc --noEmit             # typecheck
npm run lint                 # eslint
npm run build                 # production build

npm run economics:demo       # print the economics engine's decisions for the canonical scenario
npm run machine:smoke        # the machine-customer API (quote -> counteroffer -> execute) over plain HTTP
```

> **Testnet payment warning** — the commands below make real (zero-value) Algorand Testnet
> USDC transactions. Everything above this line is free to run repeatedly.

```bash
npm run job:demo             # one full job against a running dev server
npm run payment:smoke        # alias of x402:testnet-smoke
npm run x402:testnet-smoke   # one isolated real x402 payment — needs a funded TREASURY_MNEMONIC
npm run wallet:opt-in-usdc   # one-time: opt the treasury wallet into testnet USDC (asset 10458941)
```

## Environment variables

See [`.env.example`](.env.example) for the authoritative, commented list.

| Variable | What it does | Secret? |
|---|---|---|
| `TREASURY_MNEMONIC` | 25-word mnemonic for the server-side treasury wallet that pays providers | **Yes** — never commit a real value |
| `REDIS_URL` | Durable job/contract store (see [Architecture](#redis-not-in-memory)). Unset in dev falls back to an in-memory store. | Yes, if set |
| `FACILITATOR_URL` | GoPlausible x402 facilitator endpoint | No |
| `ALGOD_URL` | Public Algorand Testnet node (defaults to Algonode) | No |
| `SPEND_CAP_PER_JOB_USD` / `SPEND_CAP_PER_HOUR_USD` | Cumulative spend guard, checked before every provider payment | No |
| `DEMO_MODE` | `true` (default): candidate code is a pre-verified canned response, never a live model call. Payments, the sandbox, and the economics engine are real either way. | No |
| `OPENAI_API_KEY` | Only needed when `DEMO_MODE=false` | Yes |
| `PROVIDER_CLIENT_MODE` | Unset (default): real x402 payments. `inprocess`: local-only, zero-payment escape hatch. | No |
| `ECHO_PRICE_USD` | Price of the `/api/providers/echo` smoke-test route | No |
| `JOB_DEMO_REVENUE` | Revenue `npm run job:demo` uses | No |

Never put real secrets in this file or in the README — `.env*` is gitignored, and only
`.env.example` (with empty/placeholder values) is committed.

## Security

A few invariants worth stating plainly, each backed by a real fix and a regression test
during this build, not just written down:

- **The browser never sets its own price.** `/api/jobs/authorize`'s x402 price callback
  reads the accepted price back from the server-side job record — a job's `acceptedPrice` is
  fixed at accept time and cannot move.
- **A job can be paid at most once.** An already-`PAID`/`EXECUTING`/`CLOSED` job responds
  `409` to a repeat authorize request, with *no* fresh payment challenge — a duplicated or
  retried request can't produce a second real charge.
- **A job is only marked `PAID` after real, confirmed settlement** — not merely a verified-
  but-not-yet-settled payment. A settlement that fails downstream (a real, non-hypothetical
  failure mode) leaves the job safely `ACCEPTED`, not incorrectly stuck `PAID`.
- **A settlement receipt is never taken on a client's word.** The recorded transaction id
  comes from the facilitator's own confirmed settlement response, never from anything a
  browser reports after the fact.
- **The customer wallet and the Margin402 treasury are checked to be genuinely distinct**
  before authorizing a payment — see [Customer Agent + Pera Wallet](#customer-agent--pera-wallet).
- **The browser client enforces its own spend ceiling** independent of whatever price the
  server quotes, capped comfortably above the highest real contract and well below an
  obviously-wrong requirement.
- **`TREASURY_MNEMONIC` never reaches client code** — every importer is a server-only route
  or module; confirmed against the actual compiled client bundle output, not just the
  source.

## Current limitations

Said plainly, not hidden:

- Margin402 currently has **one** fully implemented, deterministically-verified workload
  (parsing a duration string) — `parseDuration()` is the demo's canonical task, not the
  entire product. It's designed around a small workload-adapter registry
  (`src/lib/workloads/`) so a second real, verifier-backed workload can be added without
  restructuring anything; none exists yet.
- The provider market is simulated — Draft/Repair/Premium are Margin402's own endpoints, not
  independent businesses. The payment rail settling those calls is not simulated.
- This build runs on Algorand **Testnet**, not Mainnet.
- With `DEMO_MODE=true` (the default), candidate code is a pre-verified canned response —
  useful for a reliable demo, but it means the *content* of what's generated isn't
  live-model output unless `DEMO_MODE=false` and a real `OPENAI_API_KEY` is set.
- No overall numeric "probability this plan finishes" is computed or shown — only real,
  catalog-sourced first-attempt estimates for individual providers. Inventing a compound
  probability without the underlying model to back it would be exactly the kind of
  misleading number this project tries hard to avoid.

## Judge quickstart

1. Open [margin402.vercel.app](https://margin402.vercel.app) and go to `/quote`.
2. Connect a Testnet Pera wallet.
3. Pick **Best Value** (or any plan) and accept it.
4. Approve the real x402 payment in Pera.
5. Watch `/execution` stream live — the moment that matters is **Premium requested at
   $0.85, rejected on screen**, even though it's affordable.
6. Watch `/statement` land on a real margin and a **VERIFIED** outcome.
7. Open the settlement receipts and follow a transaction to Lora — it's real, independently
   checkable, and not just this app's own word for it.
8. Optional: run `npm run machine:smoke` in a second terminal to see the identical scenario
   happen with zero browser involved.

## Why Margin402 is different

**It's not just an x402 wrapper.** x402 answers *how software pays software*. Margin402
answers *who should get paid, when, how many times, at what price, and whether the result is
actually good enough to keep*. x402 is the payment rail. Margin402 is the decision layer on
top of it.

**It's not just an AI router.** A router picks a model and returns whatever it gives you.
Margin402 accepts a financial contract for an *outcome*, spends its own budget trying to
reach it, pays real providers along the way, verifies every result independently, and can
choose to take a loss rather than fail the contract.

AI agents are increasingly able to act on their own, but most AI services still bill like
utilities — every call costs money whether it worked or not. Margin402 changes the unit of
purchase from an attempt to an outcome: x402 lets agents pay each other directly, Algorand
settles those payments cheaply enough to do it per-attempt, and Margin402 decides how to
spend the money and takes responsibility for the result.

**Margin402 doesn't guarantee profit. It guarantees the outcome.**
