# Approved commercialization plan

User approved this plan on 2026-10-29 (Asia/Bangkok). Antigravity is the primary
implementation worker; the coordinator assigns bounded batches and verifies results.

## Product decisions

- Windows-first journal for Thai XAUUSD/Forex traders using SMC/ICT.
- Hotkey screenshot, short trade form, editable condition presets, existing Recap Quiz.
- Local-first saves and images; offline operation and multi-device synchronization.
- Pilot: 10 people in two waves of five; seven-day trial per account from first
  server-confirmed use, no card required. Price is decided after feedback.
- Default: three registered Windows devices per account; user can remove devices.
- Offline entitlement: up to seven days since online verification, capped by trial or
  paid period expiry. Expired accounts retain read/export access and pending data.
- Normal insights use deterministic statistics. AI is opt-in, weekly, online-generated
  and cached for offline viewing; one report per account/week for a chosen profile.
- AI receives aggregate statistics only, no images, free-form journal text, names or
  email. Start with Groq Free subject to account quota and Thai-language evaluation;
  keep deterministic summaries available on failure. Never auto-upgrade to paid AI.
- Monthly/yearly recurring card subscriptions with automatic entitlements before
  charging customers. Stripe Checkout/Billing is proposed primary provider, subject
  to individual Thai merchant onboarding and user approval of final prices/terms.

## Milestones and gates

1. A: verify backup/restore, reconcile remote schema/history, stage/deploy security
   migration, establish installation/update/recovery checks. No historical replay.
2. B: SQLite in Electron main; durable outbox, operation idempotency, revision checks,
   preserved conflict copies, tombstones, independently queued image uploads.
3. C: deterministic condition/weekly insights with sample sizes and caveats; test Quiz
   answer hiding and review; implement bounded, grounded weekly AI summaries.
4. D: account-level trial, signed device leases, verified/idempotent billing webhooks,
   renewals, failed payments and cancellation at paid period end; sandbox first.
5. E: Thai onboarding/support/privacy/terms, Windows signing/install/update verification,
   two pilot waves and feedback. At least 7/10 can log independently and return on
   three days; no data-loss or cross-account disclosure; price remains a decision gate.

Estimated planning envelope is 8–10 weeks including pilot, revised after phase A.
Production subscriptions, merchant KYC, signing costs and live pricing are external
dependencies; do not claim them completed from local tests.

## Current batch

A1 completed and coordinator-verified on 2026-10-29: read-only schema snapshot,
six preflight integration tests, and updated rollout guidance. Full suite: 24/24
tests pass; typecheck passes; lint has zero errors and 10 existing Fast Refresh
warnings. Production snapshot, verified backup/restore, schema reconciliation,
migration-ledger repair and deployment are not completed by this local batch.

A1 scope: Antigravity may modify only `supabase/preflight/schema-snapshot.sql`,
`src/test/schema-preflight.test.ts`, and `docs/production-rollout.md`.
Deliver read-only metadata SQL, PGlite tests, and schema-baseline/backup guidance.
Coordinator runs tests and reviews before remote execution. No shell commands,
credentials, network access, production mutation, commits, pushes or deployment by
the worker in this batch.
