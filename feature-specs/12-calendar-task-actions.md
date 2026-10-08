# 12 — Calendar and task actions
Status: Not started
Dependencies: 11
Authoritative references: AGENTS.md and context/. Shared security/configuration rules apply to every feature.

## User outcome and scope
Work through the week with clear next actions, safe completion and flexible rescheduling. Topic click and checkbox are independent.

## Implementation and data contracts
Bounded calendar range, accessible list alternative, time estimates and domain date helpers. Store UTC instants with timezone/local-week semantics; daylight-saving tested. Optimistic UI reconciled with server version; transactional completion links actual production/publication events. Shift changes propose rearrangement rather than silently move accepted plan.
Design typed input/output schemas, explicit auth policy and database migration before implementation. Reuse existing patterns. Document new configuration in .env.example. Add only data/entities required by this feature.

## Acceptance and verification
Checkbox completes right task once; title opens research; reopening corrects stats; reschedule respects dependencies; keyboard/mobile controls work without dragging; conflicting update safely reconciled; timezone/DST cases pass; AI jobs do not block normal task writes.
Record actual checks and results in progress-tracker.md; generated code alone is not completion. Unit-test domain rules, integration-test boundaries, and include critical journey coverage where applicable.

## Edge cases and limits
Overdue backlog, no reschedule slot, offline write failure, duplicate tab edits, overlapping tasks. Do not turn missed publication into completed content.

## Security and operations gate
Validate inputs and AI output; check approved-account/workspace/brand/owner authorization as appropriate; test forbidden access; keep secrets/private content out of client/logs; apply configurable resource limits and idempotency to mutations/jobs. Trace failures with safe error messages. Describe migration/recovery implications. No automatic external irreversible actions.
