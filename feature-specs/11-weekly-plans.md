# 11 — Weekly plans
Status: Not started
Dependencies: 05,06,09,10
Authoritative references: AGENTS.md and context/. Shared security/configuration rules apply to every feature.

## User outcome and scope
Generate manageable proposed weekly content for chosen brands, incorporating history, series, availability and researched topics; accept before scheduling.

## Implementation and data contracts
Plan schema includes week/timezone, goals vs capacity, originals/derivatives, work estimates, publication tasks and research job refs. Generate topics then essential research asynchronously; include current/history context within budgets. Deterministic validator checks schedule capacity, dependencies, duplicates, scope and dates. Atomic idempotent acceptance; accepted revisions retained.
Design typed input/output schemas, explicit auth policy and database migration before implementation. Reuse existing patterns. Document new configuration in .env.example. Add only data/entities required by this feature.

## Acceptance and verification
Oversubscribed target explained with lighter alternatives; shift override respected; accepted plan creates one task set under retries; incomplete research visible and not marked Ready; previous series/history used accurately; AI never marks tasks done; user edits survive regeneration as explicit protected edits.
Record actual checks and results in progress-tracker.md; generated code alone is not completion. Unit-test domain rules, integration-test boundaries, and include critical journey coverage where applicable.

## Edge cases and limits
Zero free time, multiple brands competing, partial research failure, Sunday/Monday timezone boundary, simultaneous regenerate/accept. No hardcoded weekdays or weekly quotas.

## Security and operations gate
Validate inputs and AI output; check approved-account/workspace/brand/owner authorization as appropriate; test forbidden access; keep secrets/private content out of client/logs; apply configurable resource limits and idempotency to mutations/jobs. Trace failures with safe error messages. Describe migration/recovery implications. No automatic external irreversible actions.
