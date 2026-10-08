# 14 — Progress statistics
Status: Not started
Dependencies: 06,12
Authoritative references: AGENTS.md and context/. Shared security/configuration rules apply to every feature.

## User outcome and scope
Accurate creation/publication counts by day/week/brand plus modest evidence-based AI improvement suggestions.

## Implementation and data contracts
Define originals/derivatives/publications and production stage metrics; compact daily aggregates with source facts, freshness timestamp and reconciliation. Accessible charts/tables and scoped indexed queries. Compare plan vs actual; AI cites recorded observations and does not claim audience growth without performance input.
Design typed input/output schemas, explicit auth policy and database migration before implementation. Reuse existing patterns. Document new configuration in .env.example. Add only data/entities required by this feature.

## Acceptance and verification
Multiple-platform upload does not inflate original count; reopened tasks reduce proper aggregates; timezone week boundaries match planner; reconciliation detects/corrects drift; large-history read uses compact data; cross-customer stats denied. Explain empty and stale stats.
Record actual checks and results in progress-tracker.md; generated code alone is not completion. Unit-test domain rules, integration-test boundaries, and include critical journey coverage where applicable.

## Edge cases and limits
Late completion edits, archived brand, no data, delayed aggregate job. Broad engagement/financial/marketing analytics deferred.

## Security and operations gate
Validate inputs and AI output; check approved-account/workspace/brand/owner authorization as appropriate; test forbidden access; keep secrets/private content out of client/logs; apply configurable resource limits and idempotency to mutations/jobs. Trace failures with safe error messages. Describe migration/recovery implications. No automatic external irreversible actions.
