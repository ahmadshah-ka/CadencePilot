# 09 — Durable jobs
Status: Not started
Dependencies: 07
Authoritative references: AGENTS.md and context/. Shared security/configuration rules apply to every feature.

## User outcome and scope
Durable fair execution for research, plans, reminders and refreshes; usable progress without keeping browser open.

## Implementation and data contracts
Supabase PGMQ adapter plus job records/outbox. Atomic enqueue intent; lease/visibility handling, checkpoint/resume, capped retries/backoff, dedupe and dead-letter state. Prompt bounded worker dispatch plus scheduled recovery through authenticated Cron/pg_net request. Protect endpoint secrets; reauthorize jobs on execution. Poll/subscription progress is scoped.
Design typed input/output schemas, explicit auth policy and database migration before implementation. Reuse existing patterns. Document new configuration in .env.example. Add only data/entities required by this feature.

## Acceptance and verification
Worker crash recovers; redelivery produces one side effect; revoked membership/suspension prevents execution; stale lease reclaimed; failures actionable; global/provider caps respected; queue fairness tested with competing tenants; no durable dependency on detached serverless promise.
Record actual checks and results in progress-tracker.md; generated code alone is not completion. Unit-test domain rules, integration-test boundaries, and include critical journey coverage where applicable.

## Edge cases and limits
DB outage, dispatch failure, expired lease, provider timeout, cancellation racing completion. Specify poll/recovery cadence through config; no unauthenticated cron handler.

## Security and operations gate
Validate inputs and AI output; check approved-account/workspace/brand/owner authorization as appropriate; test forbidden access; keep secrets/private content out of client/logs; apply configurable resource limits and idempotency to mutations/jobs. Trace failures with safe error messages. Describe migration/recovery implications. No automatic external irreversible actions.
