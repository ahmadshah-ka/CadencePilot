# 01 — Project foundation
Status: Done (local); evidence in context/progress-tracker.md
Dependencies: None
Authoritative references: AGENTS.md and context/. Shared security/configuration rules apply to every feature.

## User outcome and scope
Create the runnable Next.js TypeScript scaffold, validated configuration, layer boundaries, logging, tooling and CI. No hosted resources or later product features.

## Implementation and data contracts
Create src/config, domain, application, infrastructure and presentation organization compatible with Next conventions. Validate required core settings; disabled optional providers do not prevent local startup. Add structured redacted logger, injected clock and standard errors. Health/ready endpoints have explicit minimal public policy. Generate lockfile and document verified Node/package-manager versions.
Design typed input/output schemas, explicit auth policy and database migration before implementation. Reuse existing patterns. Document new configuration in .env.example. Add only data/entities required by this feature.

## Acceptance and verification
Local clean install/build/lint/type-check/unit smoke tests pass; missing core config gives safe actionable errors; optional email disabled works; secret canary never appears in browser bundle or logs. CI runs relevant checks. README contains actual commands.
Record actual checks and results in progress-tracker.md; generated code alone is not completion. Unit-test domain rules, integration-test boundaries, and include critical journey coverage where applicable.

## Edge cases and limits
Empty project; missing env; invalid config; concurrent startup; unavailable dependency readiness. No database schema beyond test fixtures.

## Security and operations gate
Validate inputs and AI output; check approved-account/workspace/brand/owner authorization as appropriate; test forbidden access; keep secrets/private content out of client/logs; apply configurable resource limits and idempotency to mutations/jobs. Trace failures with safe error messages. Describe migration/recovery implications. No automatic external irreversible actions.
