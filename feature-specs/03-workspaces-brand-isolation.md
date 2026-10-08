# 03 — Workspaces and brand isolation
Status: Not started
Dependencies: 02
Authoritative references: AGENTS.md and context/. Shared security/configuration rules apply to every feature.

## User outcome and scope
Approved customer gets a private workspace. Build membership and brand-scoped authorization foundation before any product records.

## Implementation and data contracts
Workspaces/workspace_members/brands with transactional idempotent initial workspace creation. Compound keys prevent foreign-parent linkage. RLS enabled with default deny; central application policy used by API/repositories. Team invitation UI deferred. Brand CRUD accepts arbitrary names and scoped configuration.
Design typed input/output schemas, explicit auth policy and database migration before implementation. Reuse existing patterns. Document new configuration in .env.example. Add only data/entities required by this feature.

## Acceptance and verification
Customer A cannot read/update/link Customer B records through API or RLS; forged workspace/brand IDs denied; revoked membership stops access; repeated onboarding creates one workspace; rollback produces no orphan membership. Owner approval rights do not imply conversation access.
Record actual checks and results in progress-tracker.md; generated code alone is not completion. Unit-test domain rules, integration-test boundaries, and include critical journey coverage where applicable.

## Edge cases and limits
No brands, deleted/archived brand, concurrent workspace creation, access revoked midrequest. Explicit archive policy; no unapproved destructive deletion.

## Security and operations gate
Validate inputs and AI output; check approved-account/workspace/brand/owner authorization as appropriate; test forbidden access; keep secrets/private content out of client/logs; apply configurable resource limits and idempotency to mutations/jobs. Trace failures with safe error messages. Describe migration/recovery implications. No automatic external irreversible actions.
