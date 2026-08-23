# Margin402

Fixed-price, outcome-guaranteed AI execution. The customer buys a verified outcome
at a fixed price. Margin402 decides how to spend its own execution budget to get
there, and absorbs the loss when it overspends.

Tagline: "Margin402 doesn't guarantee profit. It guarantees the outcome."

## First workload

"Make this JavaScript function pass these 8 tests."

Definition of done: all tests pass in a sandboxed run under time and memory caps.
Binary. No partial credit. The verifier is in-house and free — it is the oracle
Margin402 is judged against, so it is deliberately NOT a purchasable provider.

## Stack (do not add to this beyond what's listed)

- One Next.js app (App Router, TypeScript) — UI + orchestrator + provider routes.
  May split into a thin Next.js frontend (Vercel) + a standalone Node backend
  (Railway/Render) if the customer-facing x402 + Pera Wallet work requires it —
  reuse the existing lib/ modules as shared server code either way, never fork them.
- SQLite (better-sqlite3) — single file, no ORM
- Sandbox: node:vm in a worker_thread, hard timeout + memory cap. NO Docker.
- x402 payments on Algorand TESTNET via the GoPlausible facilitator
  (switched from mainnet — final hackathon evaluation requires a demonstrable
  testnet transaction on Lora; see git history for the migration)
- Pera Wallet client integration (e.g. @txnlab/use-wallet-react + Pera adapter)
  for a browser-side customer-agent signer — Testnet only, session-restorable,
  never handles or receives private key material.
- No other services beyond the above.

## Hard exclusions — do not build these under any circumstance

Auth (login/accounts), marketplace, provider onboarding, runtime service
discovery, chat interface, smart contracts, SDK, analytics dashboards,
agent-reasoning visualisation, streaming token output, dark mode.

Wallet connect (Pera) is explicitly ALLOWED as of the two-sided x402 direction
below — this supersedes the earlier blanket exclusion. It is a Testnet signer
for a reference customer-agent client, not a login system: no accounts, no
sessions tied to identity, nothing persisted server-side keyed by wallet address
beyond what a job/contract already needs.

## Two-sided x402 (current direction)

Margin402 now sits in the middle of two independent x402 relationships:

  Layer 1 — CUSTOMER → MARGIN402: a customer agent (reference implementation:
  Pera Wallet in the browser, Testnet only) pays Margin402 via x402 for a
  verified-outcome contract. The accepted price is ALWAYS resolved from
  server-authoritative job/quote state — never trust a client-supplied amount.

  Layer 2 — MARGIN402 → PROVIDERS: unchanged. Margin402 pays Draft/Repair/
  Premium via x402 using its own backend-controlled treasury signer, exactly
  as before.

  These are two distinct signers and must never be confused: the customer's
  Pera wallet is browser-side and disposable; the Margin402 treasury is
  backend-only and never reaches the client. This split is what makes
  Revenue / Execution cost / Margin on the statement page a real two-sided
  story instead of a single internal number.

Do not begin Layer 2 (provider) spend until Layer 1 (customer) payment has
actually settled — provider spend must never happen against an unpaid or
rejected customer contract.

## UI direction

Minimal, premium, LIGHT. Think Stripe or Linear, not "AI dashboard".
No neon, no glow, no gradients, no terminal-green. Generous whitespace.
One serious typeface. Numbers are the hero — set them large and tabular.

Blockchain vocabulary is no longer hidden by default — the customer path now
legitimately shows a wallet control, a Testnet badge, and real transaction
proof, because the two-sided x402 story is the point. But the hierarchy still
matters: Outcome → Economics → Agent decisions → Verification → x402 → Wallet
→ Blockchain, in that order of visual prominence. The wallet is a signer for
the demo, not the hero of the page — never let wallet UI dominate more space
than the job/economics it exists to authorize.

## Locked economics — do not redesign these

Quote $1.20 = expected cost $0.42 + risk reserve $0.35 + operating margin $0.43
Reservation floor = $0.77 (expected cost + risk reserve)

Counteroffers: below floor -> decline. At/above floor -> accept, margin compresses.

Strategies (all endpoints we own, in this same app):
  S1 Draft   $0.05  p(pass)=0.35
  S2 Repair  $0.09  p(pass)=0.45   (failing tests fed back)
  S3 Premium $0.55  p(pass)=0.85   (spikes to $0.85 then $1.05 in demo scenario)

Selection = minimise expected cost-to-success. Affordability is a SEPARATE,
SECOND check — the engine must be able to decline something it can afford.

Honouring rule: if the only path to done costs more than remaining budget, pay
anyway while the loss is smaller than the refund. Delivering at a loss beats
refunding.

## Demo scenario (accepted counteroffer $1.05)

  S1 $0.05 -> 5/8      spent 0.05
  S2 $0.09 -> 7/8      spent 0.14
  S3 requested at $0.85 -> REJECTED (affordable, worse expected cost)
  S2 $0.09 -> 7/8      spent 0.23
  S3 at $1.05 -> 8/8 PASS   spent 1.28

  Revenue 1.05, cost 1.28, MARGIN -0.23, outcome VERIFIED

## Working rules

- Backend before UI. Engine before wiring.
- Every feature must make the 90-second demo more convincing. If not, don't build it.
- Provider price curve is scripted and labelled "simulated provider market" in the UI.
- Test pass/fail is NEVER faked.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
