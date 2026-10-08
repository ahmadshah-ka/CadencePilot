# 15 — Operations and release checks
Status: Not started
Dependencies: 01,02,03,04,05,06,07,08,09,10,11,12,13,14
Authoritative references: AGENTS.md and context/. Shared security/configuration rules apply to every feature.

## User outcome and scope
Minimal owner health/usage view and a demonstrably ready pilot. No unsupported scalability or security claims.

## Implementation and data contracts
Trace requests/jobs/provider calls with redacted metadata; metrics for latency/errors/queue lag/tokens/research credits/slow queries. Define representative dataset and concurrency profile, p95 targets and capacity/admission limits. Backup/restore, schema rollout, retention/export/forget, credential rotation and owner recovery procedures. Privacy/terms for third-party processing; deployment and billing require owner approval.
Design typed input/output schemas, explicit auth policy and database migration before implementation. Reuse existing patterns. Document new configuration in .env.example. Add only data/entities required by this feature.

## Acceptance and verification
CI checks pass; adversarial tenant/owner tests cover all boundaries; bounded worker recovery verified; documented load results and EXPLAIN for key queries; backup restoration exercised in controlled environment; secret scan/dependency review completed; production configuration reviewed; no private payloads in logs or owner health screens.
Record actual checks and results in progress-tracker.md; generated code alone is not completion. Unit-test domain rules, integration-test boundaries, and include critical journey coverage where applicable.

## Edge cases and limits
Cold starts, concurrent weekly burst, provider exhaustion, DB failover/outage, deleted memory resurfacing, migration rollback constraints. Customer launch blocked on unresolved material security/data-loss issues; free tiers not guaranteed production capacity.

## Security and operations gate
Validate inputs and AI output; check approved-account/workspace/brand/owner authorization as appropriate; test forbidden access; keep secrets/private content out of client/logs; apply configurable resource limits and idempotency to mutations/jobs. Trace failures with safe error messages. Describe migration/recovery implications. No automatic external irreversible actions.
