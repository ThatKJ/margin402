# Margin402 — Diagrams

Five diagrams a judge needs to understand the product. Each one matches the actual
implementation, referenced by file where relevant.

## 1. System Architecture

```mermaid
flowchart TD
    Machine["Machine customer / CI pipeline"] --> Quote["/api/quote"]
    Quote --> Engine["Margin402 orchestrator\n(run-job.ts)"]
    Engine --> Draft["Draft $0.05"]
    Engine --> Repair["Repair $0.09"]
    Engine --> Premium["Premium $0.55→$0.85→$1.05"]
    Draft --> Routes["x402-gated provider routes\n(create-provider-route.ts)"]
    Repair --> Routes
    Premium --> Routes
    Routes --> Facilitator["GoPlausible facilitator"]
    Facilitator --> Algorand["Algorand Testnet"]
    Algorand --> Settle["USDC ASA 10458941 settlement"]
    Routes --> Code["Candidate code"]
    Code --> Sandbox["Sandbox verifier\n(node:vm in worker_thread)"]
    Sandbox --> Outcome{"8/8 tests pass?"}
    Outcome -->|yes| Verified["VERIFIED outcome"]
    Outcome -->|no| Engine
```

## 2. x402 Payment Flow

```mermaid
sequenceDiagram
    participant C as Client (buyer.ts)
    participant R as Provider route (create-provider-route.ts)
    participant F as GoPlausible facilitator
    participant A as Algorand Testnet

    C->>R: Request (no payment)
    R-->>C: 402 Payment Required
    C->>C: Sign payment (treasury wallet, @x402/avm)
    C->>R: Retry with X-PAYMENT header
    R->>F: Verify payment
    F->>A: Settle transaction
    A-->>F: Confirmed
    F-->>R: Settlement confirmed
    R-->>C: 200 + candidate code + PAYMENT-RESPONSE (real txId)
```

## 3. Outcome Underwriting Loop

```mermaid
flowchart TD
    Task["Task + tests + quote/budget"] --> Select["Select strategy\n(lowest expected cost-to-success)"]
    Select --> Afford{"Affordable within\nremaining budget?"}
    Afford -->|yes| Pay["Pay via real x402"]
    Afford -->|no| Honour{"Honouring rule:\npaying < refunding?"}
    Honour -->|yes, pay anyway| Pay
    Honour -->|no| Refund["REFUND"]
    Pay --> Execute["Provider generates candidate"]
    Execute --> Verify["Sandbox verifies\nvisible + hidden tests"]
    Verify --> Pass{"8/8 pass?"}
    Pass -->|yes| Done["VERIFIED — statement issued"]
    Pass -->|no| Select
```

## 4. Economic Decision

```mermaid
flowchart TD
    Start["Candidate strategy at current price"] --> A{"Affordable?"}
    A -->|no| H{"Honouring rule:\nis paying anyway cheaper\nthan refunding?"}
    H -->|yes| Pay["PAY (absorb the loss)"]
    H -->|no| Refund["REFUND"]
    A -->|yes| B["Compare expected cost-to-success\nagainst other available strategies"]
    B --> C{"Is a cheaper expected\npath still available?"}
    C -->|yes| Reject["REJECT — economically inferior,\nnot unaffordable"]
    C -->|no| Pay2["PAY"]
```

*Affordable ≠ economically optimal — this is the distinction the $0.85 rejection in the
canonical demo exists to make visible.*

## 5. Canonical Demo Timeline

```mermaid
flowchart LR
    S1["S1 Draft\n$0.05 → 5/8"] --> S2a["S2 Repair\n$0.09 → 7/8"]
    S2a --> S3a["S3 Premium requested\n$0.85 — AFFORDABLE\nREJECTED (economic)"]
    S3a --> S2b["S2 Repair\n$0.09 → 7/8"]
    S2b --> S3b["S3 Premium\n$1.05 → 8/8\n(honouring rule: PAY_ANYWAY)"]
    S3b --> Verified["VERIFIED\nRevenue $1.05 − Cost $1.28\n= Margin −$0.23"]
```
