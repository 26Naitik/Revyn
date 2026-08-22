# Revyn - AI-Powered Revenue Recovery Agent
**Razorpay AI Buildathon 2026 | Track 03: AI Revenue Recovery**

---

## 1. Recommended Technology Stack

| Layer | Technology | Why |
|-------|-----------|-----|
| Frontend | Next.js 14 (App Router) + React + Tailwind CSS + shadcn/ui | Full-stack framework, server components, API routes, fast to build |
| Language | TypeScript | End-to-end type safety with Prisma + Next.js |
| Database | SQLite via Prisma ORM | Zero config, file-based, perfect for hackathon |
| AI Engine | Anthropic Claude API (claude-sonnet-4-20250514) | Best tool-use capabilities, structured output, reliable reasoning |
| Payment Gateway | Razorpay SDK (test mode) | Required for buildathon, real API integration |
| Web Server | Next.js API Routes (built-in) | No separate backend needed |
| Charts | Recharts | Lightweight, React-native |
| Validation | Zod | Type-safe schema validation |

**Key Dependencies:**
next@14, react@18, typescript, prisma, @prisma/client, razorpay, @anthropic-ai/sdk, tailwindcss, postcss, autoprefixer, shadcn/ui (via npx), recharts, zod, date-fns

---

## 2. Complete Project Architecture

### Core Loop: Detect -> Diagnose -> Decide -> Recover -> Measure


`
+------------------+     +-----------------------------------------+
|   Dashboard      |     |         API Layer (Next.js)             |
|   (React/shadcn) |<--->|  /api/detect  /api/recover  /api/stats  |
|                  |     |  /api/webhooks/razorpay                  |
+------------------+     +-------------------+---------------------+
                                         |
+---------------------------------------v----------------------------+
|                    Core Engine Layer                               |
|  +----------+  +----------+  +----------+  +------------------+  |
|  | DETECT   |->| DIAGNOSE |->| DECIDE   |->|     RECOVER      |  |
|  | Scanner  |  | Root     |  | AI Agent |  | Workflow         |  |
|  | Engine   |  | Cause    |  | Decision |  | Executor         |  |
|  +----------+  +----------+  +----------+  +------------------+  |
|                      MEASURE: Results & Analytics                  |
+--------------------------------------------------------------------+
|  Data: SQLite + Prisma ORM + Razorpay API Client (test-mode)      |
|  External: Razorpay API | Anthropic Claude API | Synthetic Data   |
+--------------------------------------------------------------------+
`
---

## 3. Folder Structure


`
revyn/
  prisma/
    schema.prisma
    seed.ts
  src/
    app/
      layout.tsx
      page.tsx
      globals.css
      dashboard/page.tsx
      risks/page.tsx
      recoveries/page.tsx
      audit/page.tsx
      api/
        detect/route.ts
        diagnose/route.ts
        recover/route.ts
        stats/route.ts
        simulate/route.ts
        webhooks/razorpay/route.ts
    lib/
      prisma.ts
      razorpay.ts
      anthropic.ts
      engine/
        detect.ts
        diagnose.ts
        decide.ts
        recover.ts
        measure.ts
      agent/
        tools.ts
        prompts.ts
        executor.ts
      guardrails/
        rules.ts
        limits.ts
      razorpay/
        payments.ts
        orders.ts
        subscriptions.ts
        payment-links.ts
        webhooks.ts
      synthetic/
        generators.ts
        scenarios.ts
      types/
        index.ts
    components/
      ui/ (shadcn components)
      layout/ (Sidebar.tsx, Header.tsx)
      dashboard/ (StatsCards.tsx, RevenueChart.tsx, RecentActivity.tsx)
      risks/ (RiskTable.tsx, RiskCard.tsx)
      recoveries/ (RecoveryList.tsx, RecoveryDetail.tsx)
      audit/ (AuditTable.tsx)
    hooks/
      useStats.ts
  .env.example
  .gitignore
  package.json
  tsconfig.json
  tailwind.config.ts
  next.config.js
`
---

## 4. Database Design

### Entities (Prisma Schema with SQLite)

**9 tables total:**

1. **Merchant** - id (cuid PK), name, razorpayMerId (optional), createdAt
2. **Customer** - id (cuid PK), merchantId (FK), name, email, phone, createdAt
3. **Order** - id (cuid PK), merchantId (FK), customerId (FK), razorpayOrderId, amount (Int paise), currency, status, createdAt
4. **Plan** - id (cuid PK), merchantId (FK), name, amount (Int paise), currency, interval, createdAt
5. **Subscription** - id (cuid PK), merchantId (FK), customerId (FK), planId (FK), razorpaySubId, status, currentStart, currentEnd, paidCount, remainingCount, createdAt
6. **Payment** - id (cuid PK), merchantId (FK), customerId (FK), orderId (FK nullable), subscriptionId (FK nullable), razorpayPaymentId, amount, currency, method, status, errorCode, errorDescription, errorSource, errorStep, errorReason, captured, amountRefunded, createdAt
7. **RevenueAtRisk** - id (cuid PK), merchantId (FK), paymentId (FK nullable), subscriptionId (FK nullable), orderId (FK nullable), type (failed_payment/abandoned_checkout/failed_subscription/overdue_receivable), amountAtRisk, currency, status (detected/diagnosing/decided/recovering/recovered/failed/abandoned/expired), rootCause (text nullable), confidenceScore (Float), createdAt
8. **RecoveryWorkflow** - id (cuid PK), revenueRiskId (FK), strategy (retry_payment/send_payment_link/offer_discount/schedule_retry/escalate_human/no_action), aiDecisionReason (text), status (pending/executing/succeeded/failed/cancelled), razorpayActionId (nullable), amountRecovered (Int paise default 0), startedAt, completedAt, createdAt
9. **AuditLog** - id (cuid PK), revenueRiskId (FK nullable), recoveryId (FK nullable), action, actor, details (String/JSON), status (success/failure/warning), createdAt

### Key Relationships

- Merchant 1:N Customers, Orders, Payments, Plans, Subscriptions, RevenueAtRisk
- Customer N:1 Merchant, 1:N Orders, Payments, Subscriptions
- Order 1:N Payments, N:1 Merchant + Customer
- Payment optionally N:1 Order + Subscription
- RevenueAtRisk 1:1 RecoveryWorkflow, linked to Payment/Subscription/Order
- AuditLog optionally linked to RevenueAtRisk + RecoveryWorkflow

---

## 5. API Design

| Method | Endpoint | Purpose | Request | Response |
|--------|----------|---------|---------|----------|
| POST | /api/detect | Scan for revenue at risk | {} or {merchantId} | {risks, totalAtRisk} |
| POST | /api/diagnose | AI diagnoses root cause | {riskId} | {riskId, rootCause, confidenceScore, details} |
| POST | /api/recover | Execute recovery | {riskId} | {recoveryId, strategy, status} |
| GET | /api/stats | Dashboard statistics | query params (date range) | {totalAtRisk, totalRecovered, recoveryRate, byType, byStatus} |
| POST | /api/simulate | Run full simulation | {scenarioCount} | {detected, diagnosed, recovered, totalValue} |
| POST | /api/webhooks/razorpay | Razorpay webhook handler | Razorpay webhook payload | {ok: true} |

---

## 6. Razorpay Integration Points

### APIs Used (all test-mode)

| Razorpay API | Revyn Usage | Why |
|-------------|-------------|-----|
| Payments - Fetch All | Detect failed payments | Scan for status=failed payments |
| Payments - Fetch Single | Get payment details | Enrich risk diagnosis with error codes |
| Orders - Create | Create new orders for retries | Recovery: create fresh order for retry |
| Subscriptions - Fetch All | Detect failed subscriptions | Scan for expired/activation_failed |
| Subscriptions - Fetch | Get subscription details | Diagnose subscription failures |
| Payment Links - Create | Send payment link recovery | Recovery action: send payment link |
| Refunds | Handle refund recovery cases | Process refund-based recovery |
| Webhooks | Real-time event processing | payment.failed, payment.captured, subscription.cancelled |

### Webhook Events to Handle
- payment.failed - Detect failed payment in real-time
- payment.captured - Confirm recovery success
- payment.authorized - Track authorization events
- subscription.cancelled - Detect subscription failures
- subscription.charged - Track subscription payments

### Razorpay SDK Initialization

`	ypescript
import Razorpay from 'razorpay';
const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID!,
  key_secret: process.env.RAZORPAY_KEY_SECRET!,
});
`
---

## 7. Synthetic Data Strategy

### Approach: Seed Script + Razorpay Test-Mode Realism

**Two data sources:**
1. Seed-generated synthetic data (primary) - populated via Prisma seed script
2. Razorpay test-mode APIs (secondary) - create real test orders/links for live demo

### Synthetic Data Coverage

| Entity | Count | Distribution |
|--------|-------|-------------|
| Merchants | 3 | SaaS platform, E-commerce store, Education portal |
| Customers | 50 | Realistic Indian names, emails, phone numbers |
| Plans | 6 | Monthly/Annual at INR 99, 299, 999, 1499, 2999, 4999 |
| Orders | 100 | Mix of created/captured/failed statuses |
| Payments | 150 | 40% failed, 10% authorized (uncaptured), 50% captured |
| Subscriptions | 30 | Mix of active/expired/activation_failed |
| RevenueAtRisk | 60-80 | Generated from failed payments + abandoned + expired subs |
| RecoveryWorkflow | 30-50 | Generated with various strategies |
| AuditLog | 200+ | Auto-generated with engine operations |

### Failure Scenario Patterns (from Razorpay error codes)

1. Card declined - error_code: BAD_REQUEST_ERROR, error_reason: card_declined
2. Insufficient funds - error_reason: insufficient_funds
3. Expired card - error_reason: expired_card
4. Network timeout - error_step: payment_authentication, error_reason: network_timeout
5. UPI PIN failed - error_reason: incorrect_otp
6. 3D Secure failed - error_step: payer_authentication, error_reason: authentication_failed
7. Subscription mandate failed - subscription status: activation_failed
8. Checkout abandoned - order created but no payment attempted

---

## 8. Revenue Detection Logic

### Detection Engine (src/lib/engine/detect.ts)

The detection engine scans the database for four categories of revenue at risk:

**1. Failed Payments**
- Query: Payments where status = failed AND no RevenueAtRisk exists for it
- Risk amount: payment.amount
- Type: failed_payment

**2. Abandoned Checkouts**
- Query: Orders where status = created AND createdAt > 30 minutes ago AND no payment linked
- Risk amount: order.amount
- Type: abandoned_checkout

**3. Failed Subscriptions**
- Query: Subscriptions where status IN (expired, activation_failed, halted) AND remaining_count > 0
- Risk amount: plan.amount * remaining_count (projected LTV loss)
- Type: failed_subscription

**4. Overdue Receivables**
- Query: Orders where status = created AND createdAt > 24 hours ago AND no subsequent payment
- Risk amount: order.amount
- Type: overdue_receivable

### Output
- Creates RevenueAtRisk records for each detected item
- Returns list of detected risks with total amount at risk
- Logs detection to AuditLog

---

## 9. AI Agent Architecture

### Agent Design: Claude-Powered Decision Agent

The AI agent uses Anthropic Claude API with tool-use to make intelligent recovery decisions.

### Agent Loop

1. Receive context: risk item details, customer history, error codes, past recovery attempts
2. Use tools to gather additional data (fetch payment details, check customer history)
3. Analyze root cause from error codes and patterns
4. Decide on recovery strategy based on: root cause, amount, customer value, risk level
5. Output structured decision with reasoning and confidence score

### System Prompt Strategy

The agent receives a system prompt that includes:
- Role definition (Revenue Recovery Specialist)
- Available tools and when to use them
- Decision framework (root cause -> strategy mapping)
- Guardrails (max retry count, max discount %, escalation rules)
- Output format requirements (JSON with strategy, reasoning, confidence)

### Model Configuration

- Model: claude-sonnet-4-20250514 (best balance of speed + quality)
- Max tokens: 1024 (structured output)
- Temperature: 0.3 (deterministic decisions)
- Tool choice: auto (let model decide which tools to use)

---

## 10. Agent Tools/Functions

The AI agent has access to these tools:

### Tool 1: get_payment_details
- Input: {paymentId: string}
- Output: Full payment object with error codes, method, customer info
- Use: Enrich diagnosis with detailed payment failure info

### Tool 2: get_customer_history
- Input: {customerId: string}
- Output: List of past payments, success rate, total spend
- Use: Assess customer value and past behavior

### Tool 3: get_subscription_details
- Input: {subscriptionId: string}
- Output: Subscription status, billing history, plan details
- Use: Diagnose subscription-specific failures

### Tool 4: check_existing_recovery_attempts
- Input: {riskId: string}
- Output: Previous recovery workflows and their outcomes
- Use: Avoid duplicate recovery actions, learn from past attempts

### Tool 5: get_guardrail_status
- Input: {customerId: string, strategy: string}
- Output: Whether action is allowed, remaining retry count, limits
- Use: Verify guardrails before making a decision

---

## 11. Recovery Decision Engine

### Decision Framework

The AI agent maps root causes to recovery strategies:

| Root Cause | Recommended Strategy | Confidence Threshold |
|-----------|---------------------|---------------------|
| Card declined (transient) | retry_payment | > 0.7 |
| Insufficient funds | schedule_retry (24-48h delay) | > 0.6 |
| Expired card | send_payment_link (update card) | > 0.8 |
| Network timeout | retry_payment (immediate) | > 0.8 |
| UPI PIN failed | send_payment_link (retry UPI) | > 0.7 |
| 3D Secure failed | send_payment_link (retry with 3DS) | > 0.7 |
| Checkout abandoned | send_payment_link + offer_discount (5-10%) | > 0.6 |
| Subscription mandate failed | schedule_retry + send_payment_link | > 0.6 |
| High-value customer (5+ payments) | offer_discount + priority support | > 0.7 |
| Repeated failure (3+ attempts) | escalate_human | always |

### Decision Output Format

The agent outputs a JSON object:
  strategy: string (one of the 6 strategies)
  reasoning: string (AI explanation of why this strategy)
  confidence: number (0.0-1.0)
  estimatedRecovery: number (in paise)
  discountPercent: number (0 if no discount)
  retryDelay: string or null (e.g., 24h, 48h)
  escalationReason: string or null

---

## 12. Recovery Workflow

### Workflow Executor (src/lib/engine/recover.ts)

Each recovery strategy maps to a bounded set of actions:

**1. retry_payment**
- Action: Create new Razorpay Order for the same amount
- Guardrails: Max 3 retries per customer, max 2 retries per day
- Success: payment.captured webhook received

**2. send_payment_link**
- Action: Create Razorpay Payment Link via API
- Guardrails: Max 2 links per week per customer
- Success: payment_link.paid webhook received

**3. offer_discount**
- Action: Create Payment Link with discounted amount (5-10% max)
- Guardrails: Max 10% discount, max 1 discount per customer per month
- Success: payment_link.paid webhook received

**4. schedule_retry**
- Action: Create retry job for future execution (24-48h delay)
- Guardrails: Max 1 scheduled retry per risk item
- Success: Retry executed and payment captured

**5. escalate_human**
- Action: Flag for manual review, no automated recovery
- Triggered when: guardrails breached, AI confidence < 0.5, or explicit decision

**6. no_action**
- Action: Close the risk item with zero recovery
- Triggered when: amount too low (< INR 10), customer marked as churned

---

## 13. Guardrails and Stopping Rules

### Hard Limits (configurable in src/lib/guardrails/limits.ts)

| Rule | Limit | Action on Breach |
|------|-------|------------------|
| Max retries per customer | 3 total | Stop, escalate to human |
| Max retries per day | 2 per customer | Skip today, schedule for tomorrow |
| Max payment links per week | 2 per customer | Stop sending links |
| Max discount per customer | 10% max, 1 per month | Use base amount, no discount |
| Min recovery amount | INR 10 (1000 paise) | Skip if below threshold |
- Max recovery attempts per risk item | 3 total | Mark as failed, log reason |
| Max total recovery budget | INR 50,000 per merchant | Stop all recovery, alert |
| Cooldown between actions | 1 hour minimum | Delay next action |
| Customer opt-out | Check notes field | Respect customer wishes |

### Stopping Rules (src/lib/guardrails/rules.ts)

The agent checks these before EVERY action:
1. Has the customer exceeded max retry count? -> STOP
2. Is the amount below minimum threshold? -> SKIP
3. Was a recovery action performed in the last hour? -> COOLDOWN
4. Has the customer been marked as churned/opted-out? -> STOP
5. Has the merchant exceeded recovery budget? -> STOP ALL
6. Has this risk item exceeded max attempts? -> MARK FAILED
7. Is AI confidence below 0.3? -> ESCALATE to human

### Audit on Guardrail Breach
Every guardrail action is logged to AuditLog with:
- action: guardrail_block or guardrail_warn
- details: {rule, limit, current_value, reason}
- status: warning or failure

---

## 14. Audit Trail Design

### AuditLog Table
Every significant action generates an AuditLog entry:

| Field | Type | Description |
|-------|------|-------------|
| id | String (cuid) | Unique identifier |
| revenueRiskId | String (nullable) | Link to the risk item |
| recoveryId | String (nullable) | Link to recovery workflow |
| action | String | detect, diagnose, decide, recover, measure, guardrail_block, guardrail_warn, error, webhook |
| actor | String | system, ai_agent, razorpay_webhook, user |
| details | String (JSON) | Arbitrary structured data about the action |
| status | String | success, failure, warning |
| createdAt | DateTime | When the action occurred |

### Audit Examples

- DETECT: {itemsFound: 12, totalAtRisk: 450000, scanType: full}
- DIAGNOSE: {rootCause: expired_card, confidence: 0.92, toolsUsed: [get_payment_details]}
- DECIDE: {strategy: send_payment_link, reasoning: ..., estimatedRecovery: 29900}
- RECOVER: {strategy: send_payment_link, razorpayActionId: plink_xxx, status: created}
- GUARDRAIL: {rule: max_retries, limit: 3, currentValue: 3, action: stopped}
- WEBHOOK: {event: payment.captured, paymentId: pay_xxx, amount: 29900}
- MEASURE: {totalDetected: 60, totalRecovered: 35, totalValue: 1250000}

### Audit Viewer (Frontend)
- Filterable by action type, actor, status, date range
- Linked to specific risk items and recovery workflows
- Timeline view showing the full lifecycle of a recovery

---

## 15. Dashboard Requirements

### Page 1: Main Dashboard (/dashboard)

**Stats Cards Row (4 cards):**
- Total Revenue at Risk (INR with icon, red)
- Total Revenue Recovered (INR with icon, green)
- Recovery Rate (% with icon, blue)
- Active Recoveries (count with icon, yellow)

**Revenue Recovery Chart:**
- Line/area chart showing at-risk vs recovered over time
- Filterable by date range

**Risk by Type Pie Chart:**
- Breakdown: failed_payment, abandoned_checkout, failed_subscription, overdue_receivable

**Recent Activity Feed:**
- Last 10 audit log entries with action icons
- Link to full audit trail

### Page 2: Revenue At Risk (/risks)

- Sortable/filterable table of all RevenueAtRisk items
- Columns: Type, Amount, Customer, Status, Root Cause, Created, Actions
- Row actions: Diagnose, Recover, View Details
- Bulk actions: Run detection, Batch diagnose

### Page 3: Recovery Workflows (/recoveries)

- Table of all recovery workflows
- Columns: Strategy, Status, Amount Recovered, AI Reasoning, Started, Completed
- Detail view: Full lifecycle timeline, audit trail, AI decision reasoning

### Page 4: Audit Trail (/audit)

- Full audit log table with filtering
- Filter by: action, actor, status, date range
- Link to related risk items and recovery workflows

---

## 16. Demo/Simulation Flow

### Pre-Demo Setup
1. Run prisma migrate dev to create database
2. Run prisma db seed to populate synthetic data
3. Ensure Razorpay test-mode keys are set in .env
4. Start dev server: npm run dev

### Demo Script (5-minute pitch)

**Minute 0-1: Problem Statement**
- Show dashboard with INR X,XX,XXX revenue at risk
- Highlight the 4 categories of revenue loss

**Minute 1-2: Detection**
- Click Run Detection button
- Show real-time scanning for failed payments, abandoned checkouts, etc.
- Show newly detected risk items appearing in the table

**Minute 2-3: AI Diagnosis**
- Select a risk item, click Diagnose
- Show AI agent analyzing error codes, customer history
- Display root cause (e.g., expired card) with confidence score

**Minute 3-4: Recovery Decision + Execution**
- Show AI deciding on strategy (e.g., send payment link)
- Click Execute Recovery
- Show payment link created via Razorpay API
- Simulate customer paying (Razorpay test mode)
- Show webhook received, recovery marked as succeeded

**Minute 4-5: Results + Guardrails**
- Show money recovered in dashboard stats
- Show guardrails preventing over-contact
- Show complete audit trail
- Show measurable ROI

### Simulation Endpoint
- POST /api/simulate runs the full Detect -> Diagnose -> Decide -> Recover -> Measure loop
- Processes all risk items in batch
- Returns summary with total recovered value

---

## 17. Security Considerations

1. **Environment Variables**: All API keys stored in .env (gitignored)
2. **Webhook Verification**: All Razorpay webhooks verified using HMAC-SHA256 signature
3. **No PII in Logs**: Customer email/phone never logged in audit trail
4. **Input Validation**: All API inputs validated with Zod schemas
5. **Amount Validation**: Recovery amounts always match original payment amounts
6. **Rate Limiting**: API endpoints protected against abuse
7. **No Secrets in Client**: All Razorpay/AI calls happen server-side only
8. **Test Mode Only**: Razorpay test-mode keys prevent real money movement

---

## 18. Error Handling

### API Layer
- All endpoints return structured JSON errors with status codes
- Zod validation errors return 400 with field-level messages
- Razorpay API errors are caught and wrapped with context
- AI API errors fall back to rule-based decisions

### Engine Layer
- Each engine step (detect/diagnose/decide/recover) is wrapped in try-catch
- Failures at any step are logged to AuditLog with action: error
- Partial failures do not block other risk items from processing
- The measure step always runs, even if some recoveries failed

### Razorpay Integration
- API call failures are retried once, then logged as error
- Webhook signature verification failures return 401
- Invalid payment states are logged but do not crash the system

### AI Agent
- If Claude API fails, fallback to rule-based decision engine
- If agent returns invalid JSON, retry once, then use defaults
- Tool call failures are reported back to agent for reconsideration

---

## 19. Testing Strategy

### Unit Tests (Vitest)
- Engine functions: detect, diagnose, decide, recover, measure
- Guardrail rules: limits, stopping rules
- Synthetic data generators: scenarios, data consistency
- Razorpay helpers: order creation, payment link creation
- Type validation: Zod schemas

### Integration Tests
- API endpoints: /api/detect, /api/diagnose, /api/recover, /api/stats
- Database operations: Prisma CRUD, seed data integrity
- Webhook handler: Razorpay webhook processing
- AI agent loop: tool calls, decision output format

### Demo Verification Tests
- Seed data populates all 9 tables correctly
- Detection finds exactly the expected number of risk items
- Diagnosis produces valid root cause for each failure type
- Recovery creates valid Razorpay orders/payment links
- Measure calculates correct totals
- Guardrails block when limits are exceeded
- Audit trail has entries for every operation

### Test Commands
- npm test (Vitest in watch mode)
- npm run test:ci (Vitest single run)
- npx prisma db seed (verify seed completes)

---

## 20. Deployment Strategy

### Hackathon Demo: Local Development
- Run locally with: npm run dev
- SQLite database file: prisma/dev.db
- Razorpay test-mode keys (no real money)
- Anthropic API key for Claude

### Optional: Vercel Deployment
- Push to GitHub repository
- Connect to Vercel for auto-deployment
- Use Vercel Postgres or Turso for hosted SQLite alternative
- Set environment variables in Vercel dashboard

### Demo Day Requirements
- Working local demo on laptop
- Razorpay test-mode dashboard open to show real API calls
- Database pre-seeded with realistic data
- One-click simulation endpoint for live demo

---

## 21. Phased Implementation Order

### Phase 1: Foundation (Steps 1-4)
**Goal:** Project scaffolding, database, and basic data flow

1. Initialize Next.js 14 project with TypeScript + App Router
2. Install and configure Tailwind CSS + shadcn/ui
3. Set up Prisma with SQLite, define schema (all 9 models)
4. Create prisma/seed.ts with synthetic data generators
5. Create lib/prisma.ts singleton
6. Verify: prisma migrate dev + prisma db seed works
7. Create basic layout with sidebar navigation

**Verification:** Database exists, seed data populates all tables, dev server starts

### Phase 2: Core Engine (Steps 5-8)
**Goal:** Detection, diagnosis, decision, and recovery logic

5. Implement lib/engine/detect.ts - scan for revenue at risk
6. Implement lib/engine/diagnose.ts - root cause analysis (rule-based first)
7. Implement lib/engine/decide.ts - recovery strategy selection
8. Implement lib/engine/recover.ts - recovery workflow execution
9. Implement lib/engine/measure.ts - results calculation

**Verification:** Each engine function works independently with seed data

### Phase 3: Razorpay Integration (Steps 9-11)
**Goal:** Real Razorpay API integration

9. Set up Razorpay SDK (lib/razorpay.ts)
10. Implement Razorpay helpers: orders, payment links, subscriptions, payments
11. Implement webhook handler with signature verification
12. Create lib/razorpay/webhooks.ts for event processing

**Verification:** Can create test orders and payment links via Razorpay API

### Phase 4: AI Agent (Steps 12-14)
**Goal:** Claude-powered intelligent decision making

12. Set up Anthropic SDK (lib/anthropic.ts)
13. Implement agent tools (lib/agent/tools.ts)
14. Create system prompts (lib/agent/prompts.ts)
15. Implement agent executor loop (lib/agent/executor.ts)
16. Add rule-based fallback when AI fails

**Verification:** AI agent returns valid decisions for test scenarios

### Phase 5: Guardrails (Step 15)
**Goal:** Safety limits and stopping rules

15. Implement guardrail rules (lib/guardrails/rules.ts)
16. Implement rate limits (lib/guardrails/limits.ts)
17. Integrate guardrails into recovery workflow

**Verification:** Guardrails block actions when limits exceeded

### Phase 6: API Layer (Steps 16-18)
**Goal:** RESTful API endpoints

16. POST /api/detect - run detection scan
17. POST /api/diagnose - AI diagnosis
18. POST /api/recover - execute recovery
19. GET /api/stats - dashboard statistics
20. POST /api/simulate - run full simulation
21. POST /api/webhooks/razorpay - webhook handler

**Verification:** All endpoints return correct responses

### Phase 7: Dashboard UI (Steps 19-22)
**Goal:** Full dashboard with all pages

22. Dashboard home page with stats cards + charts
23. Revenue at risk page with table + filters
24. Recovery workflows page with list + detail view
25. Audit trail page with filtering
26. Layout components: Sidebar, Header

**Verification:** All pages render correctly with real data

### Phase 8: Integration + Polish (Step 23)
**Goal:** End-to-end flow works

27. Wire up frontend to API endpoints
28. Add loading states and error handling
29. Test full simulation flow end-to-end
30. Add audit trail logging to all operations

**Verification:** Complete Detect -> Diagnose -> Decide -> Recover -> Measure works

### Phase 9: Demo Preparation (Step 24)
**Goal:** Demo-ready state

31. Re-seed database with fresh data
32. Test demo script flow
33. Verify all Razorpay test-mode integrations work
34. Prepare fallback scenarios if live API fails

**Verification:** Demo script runs successfully end-to-end

---

## Implementation Dependencies

```
Phase 1 (Foundation)
    |
    v
Phase 2 (Core Engine) ---> Phase 3 (Razorpay) ---> Phase 6 (API)
    |                           |
    v                           v
Phase 4 (AI Agent) --------> Phase 5 (Guardrails)
    |
    v
Phase 7 (Dashboard UI)
    |
    v
Phase 8 (Integration)
    |
    v
Phase 9 (Demo Prep)
```

---

PLAN READY - WAITING FOR APPROVAL
