# Revyn

**AI-Powered Revenue Recovery Agent**

Razorpay AI Buildathon 2026 — Track 03: AI Revenue Recovery

## Problem

Businesses lose revenue through failed payments, abandoned checkouts, failed subscriptions, and overdue receivables. Manual recovery is slow, inconsistent, and doesn't scale.

## Core Loop

```
Detect → Diagnose → Decide → Recover → Measure
```

1. **Detect** — Scan for revenue at risk across all payment channels
2. **Diagnose** — AI analyzes root causes using error codes and customer history
3. **Decide** — Select the safest recovery intervention with bounded guardrails
4. **Recover** — Execute recovery workflow (payment links, retries, escalation)
5. **Measure** — Track money recovered with measurable ₹ value

## Revenue Risk Categories

- Failed payments
- Abandoned checkouts
- Failed subscriptions
- Overdue receivables

## Current Phase

**Phase 1: Foundation** — Project scaffolding, database schema, basic layout

## Tech Stack

- Next.js (App Router) + TypeScript
- PostgreSQL + Prisma ORM
- Tailwind CSS
- Zod (validation)
- Recharts (visualization)
- Razorpay SDK (test-mode)
- AI Provider (pluggable, with rule-based fallback)

## Getting Started

1. Copy `.env.example` to `.env` and configure your database URL
2. Run `npx prisma migrate dev` to create the database schema
3. Run `npm run dev` to start the development server
4. Open [http://localhost:3000](http://localhost:3000)

## License

MIT
