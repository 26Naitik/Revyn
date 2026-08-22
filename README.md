# Revyn

**AI-Powered Revenue Recovery Platform**

Razorpay AI Buildathon 2026 — Track 03: AI Revenue Recovery

## What is Revyn?

Revyn continuously scans a merchant's payment data for revenue that is slipping away — failed payments, abandoned checkouts, failed subscriptions and overdue receivables — then runs a bounded recovery workflow against each risk and measures exactly how much money was recovered, with a complete audit trail.

## Problem

Indian merchants silently lose revenue through four leakages:

| Leakage | Example |
|---|---|
| Failed payments | Card declined / expired at checkout |
| Abandoned checkouts | Order created, payment never attempted |
| Failed subscriptions | Recurring mandate breaks mid-cycle |
| Overdue receivables | Invoice/order unpaid for days |

Manual recovery is slow, inconsistent, over-eager (spamming customers) or too timid. There is rarely any measurement of how much was actually won back.

## Solution

Revyn closes the loop automatically but **safely**:

```
Detect → Diagnose → Decide → Execute → Webhook → Measure
```

1. **Detect** — scan for the four risk categories
2. **Diagnose** — map error codes/sub-statuses to root causes with confidence scores
3. **Decide** — choose a bounded intervention per root cause (payment link, retry, discount link, scheduled retry, human escalation)
4. **Execute** — create a real Razorpay Payment Link (test mode) via the official SDK
5. **Webhook** — `payment_link.paid`, HMAC-SHA256 verified, is the sole source of truth for success
6. **Measure** — ₹ recovered, recovery rate, per-category breakdowns, full audit trail

## Key Features

- Four-category revenue-at-risk detection engine
- Rule-based diagnosis with confidence scoring (AI-agent-ready architecture, deterministic today)
- Root-cause → strategy decision matrix with escalation on repeat failures
- Financial guardrails enforced before every decision and execution
- Real Razorpay Standard Payment Links (test mode) — no fake success paths
- Timing-safe webhook signature verification; duplicate deliveries are idempotent
- Live merchant dashboard: stats, pipeline runner, recoveries table, activity feed
- Risks / Recoveries / Audit trail pages
- 90 unit tests; zero lint errors; clean production build

## Architecture

```
Dashboard (RSC)                 API routes
┌────────────────┐   ┌──────────────────────────────┐
│ /dashboard     │──▶│ POST /api/pipeline           │
│ /risks         │   │ GET  /api/stats              │
│ /recoveries    │   │ POST /api/recover/payment-link│
│ /audit         │   │ POST /api/webhooks/razorpay  │
└────────────────┘   └──────────────┬───────────────┘
                                    │
                     Engine layer (src/lib/engine)
        detect ─▶ diagnose ─▶ decide ─▶ measure (+ orchestrator)
                                    │
                     Guardrails (src/lib/guardrails)
                     Razorpay layer (src/lib/razorpay)
                                    │
                     PostgreSQL + Prisma 7 (driver adapter)
```

- `src/lib/engine/` — detection scanners, diagnosis rules, decision matrix, stats aggregation, pipeline orchestrator
- `src/lib/guardrails/` — hard limits + stopping rules, checked before every action
- `src/lib/razorpay/` — isolated SDK client, typed payment-link service, webhook verification/processing
- `src/lib/dashboard/` — read models for the UI
- Prisma models: Merchant, Customer, Order, Plan, Subscription, Payment, RevenueAtRisk, RecoveryWorkflow, AuditLog

## Complete Recovery Flow

1. Click **Run detection pipeline** on the dashboard → risks detected, diagnosed, decided (guardrails applied); pending recovery workflows appear in the table
2. For an eligible workflow (pending + payment-link strategy) click **Create payment link** → server validates eligibility, claims the workflow atomically, creates a Razorpay test-mode Standard Payment Link (`reference_id = revyn_<workflowId>`), stores the link ID, moves it to *executing*, writes an audit entry
3. Customer pays the link (Razorpay test checkout)
4. Razorpay calls `POST /api/webhooks/razorpay` → signature verified against the raw body → workflow marked `succeeded` with `amountRecovered`, risk marked `recovered`, one audit entry written
5. Duplicate webhook deliveries change nothing (atomic conditional update inside a transaction)
6. Dashboard stat cards, tables and activity feed reflect the recovered revenue after refresh

Client-side redirects are never trusted as proof of payment — the verified webhook is the only success path.

## Razorpay Integration

| Capability | Implementation |
|---|---|
| SDK | Official `razorpay` Node SDK, server-only client built from env credentials |
| Payment Links | Typed `createPaymentLink()` — Zod-validated input (integer paise, INR, customer block, reference ID, optional expiry) |
| Reference IDs | `revyn_<recoveryWorkflowId>` for webhook correlation (with link-ID fallback) |
| Webhooks | `payment_link.paid`; raw-body HMAC-SHA256 + `timingSafeEqual`; unknown references logged as warnings |
| Secrets | Keys live only in `.env` (gitignored) and are used exclusively in server routes |

## Guardrails

Enforced by `src/lib/guardrails` before decisions/executions (all breaches audited):

| Rule | Limit |
|---|---|
| Max attempts per risk | 3 |
| Max retries per customer | 3 |
| Max payment links per week | 2 |
| Max discount | 10% (max 1/customer/month) |
| Min recovery amount | ₹10 |
| Merchant recovery budget | ₹50,000 |
| Cooldown between actions | 60 min |
| Escalate to human after | 3 failed recoveries |

Blocked actions are forced to the `escalate_human` strategy rather than silently dropped.

## Tech Stack

- Next.js (App Router) + React 19 + TypeScript
- Tailwind CSS v4
- PostgreSQL + Prisma ORM 7 (driver adapter `@prisma/adapter-pg`)
- Zod validation
- Razorpay Node SDK (test mode)
- Vitest

## Local Setup

```bash
git clone <repo> && cd revyn
npm install
cp .env.example .env      # fill in the variables below
npx prisma migrate dev    # creates schema (first time: --name init)
npm run dev               # http://localhost:3000
```

## Environment Variables

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string |
| `RAZORPAY_KEY_ID` | Test-mode key id (`rzp_test_…`) |
| `RAZORPAY_KEY_SECRET` | Test-mode key secret — server-only |
| `RAZORPAY_WEBHOOK_SECRET` | Secret used to verify webhook signatures |

`.env` is gitignored; only `.env.example` is committed. Secrets are never sent to the browser and never returned by API responses.

## Testing Commands

```bash
npm test          # Vitest, all suites
npm run test:watch
npm run test:ci
npm run typecheck # tsc --noEmit
npm run lint      # eslint
npm run build     # production build
```

## Demo Flow (5 minutes)

1. Open `/dashboard` — show Revenue at Risk vs Recovered cards and category breakdown
2. Click **Run detection pipeline** — watch risks get detected/diagnosed/decided and appear in the recoveries table
3. Point out guardrail behaviour: high-failure risks land as *escalate_human* instead of automated action
4. On a pending payment-link row click **Create payment link** — open the generated Razorpay test-mode link and complete the payment
5. The webhook lands: row flips to *succeeded* with the recovered amount, risk shows *recovered*, audit page records the event
6. Refresh the dashboard — Recovered Revenue and Recovery Rate update with real ₹ value; open `/dashboard/audit` for the full trail

## Current Phase

Phase 5 — polish and hackathon submission readiness (engine, Razorpay integration and dashboard complete).

## Known Limitations

- Decisions are rule-based; the Claude/AI agent layer is architected (pluggable provider in env) but not yet wired in
- Only `send_payment_link` / `offer_discount` strategies execute automatically; `retry_payment`, `schedule_retry` and `escalate_human` remain manual/pending
- Webhook handling covers `payment_link.paid`; other events (e.g. `subscription.charged`) are acknowledged but not processed
- Single-merchant demo scope; API routes are not authenticated (local demo assumption)
- Recovery amounts are recorded net of discounts decided earlier only where persisted; links charge the full at-risk amount
- Requires a reachable PostgreSQL instance at runtime

## Future Improvements

- Wire the Claude tool-use agent into `diagnose`/`decide` with the existing guardrails as hard constraints
- Executors for retry scheduling (24–48h delays) and subscription mandate re-auth
- Additional webhook events for subscription recovery
- Multi-merchant tenancy + auth on dashboard/API
- Charts (Recharts) for recovery trends over time

## License

MIT
