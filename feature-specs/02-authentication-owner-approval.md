# 02 — Authentication and owner approval
Status: Not started
Dependencies: 01
Authoritative references: AGENTS.md and context/. Shared security/configuration rules apply to every feature.

## User outcome and scope
Google sign-in through Supabase; applicants authenticated but blocked until owner approval. Secure owner bootstrap and audited access review.

## Implementation and data contracts
Migrations for account_access/platform_admins/profiles. Pending on first verified signin via trusted server/DB path. Central access policy; owner bootstrap is explicit one-time controlled provisioning by stable verified user ID, no first-user-wins. Owner approval uses transaction/version check and emits notification intent. Require MFA assurance for privileged production actions; enrollment/recovery documented.
Design typed input/output schemas, explicit auth policy and database migration before implementation. Reuse existing patterns. Document new configuration in .env.example. Add only data/entities required by this feature.

## Acceptance and verification
Pending cannot call product APIs or start AI/jobs; forged metadata cannot grant owner; non-owner admin request denied; owner approves once under concurrent requests; suspension revokes product operations; invalid OAuth/state/session rejected. Verify with two applicants and owner in controlled auth environment.
Record actual checks and results in progress-tracker.md; generated code alone is not completion. Unit-test domain rules, integration-test boundaries, and include critical journey coverage where applicable.

## Edge cases and limits
OAuth cancel, duplicate signin, expired session, rejected user return, owner lockout recovery, two owners reviewing same request. Notification intent consumed in 13; no sending yet.

## Security and operations gate
Validate inputs and AI output; check approved-account/workspace/brand/owner authorization as appropriate; test forbidden access; keep secrets/private content out of client/logs; apply configurable resource limits and idempotency to mutations/jobs. Trace failures with safe error messages. Describe migration/recovery implications. No automatic external irreversible actions.
