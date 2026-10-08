# 06 — Content and publication records
Status: Not started
Dependencies: 05
Authoritative references: AGENTS.md and context/. Shared security/configuration rules apply to every feature.

## User outcome and scope
Track original content, derivatives, series and platform-specific publications accurately. Manual entry works independently of AI.

## Implementation and data contracts
Scoped tables for series/content_items/publications/tasks with revisions and unique idempotency rules. Separate production stages planned/recorded/edited/ready as applicable to format, plus actual publication records. Derivatives link to original and inherit scope. Store external links and optional pasted transcripts; no binary media pipeline.
Design typed input/output schemas, explicit auth policy and database migration before implementation. Reuse existing patterns. Document new configuration in .env.example. Add only data/entities required by this feature.

## Acceptance and verification
One original on three platforms counts one original/three publications; derivative counts separately; duplicate submission cannot add count; reopening corrects records; foreign parent denied; written post cannot be forced through recording stage; source transcript retained separately from derived suggestions.
Record actual checks and results in progress-tracker.md; generated code alone is not completion. Unit-test domain rules, integration-test boundaries, and include critical journey coverage where applicable.

## Edge cases and limits
Original removed/archive, untimed transcript, incorrect publication date, concurrent completion. Do not infer clips/timestamps or performance analytics from checkbox.

## Security and operations gate
Validate inputs and AI output; check approved-account/workspace/brand/owner authorization as appropriate; test forbidden access; keep secrets/private content out of client/logs; apply configurable resource limits and idempotency to mutations/jobs. Trace failures with safe error messages. Describe migration/recovery implications. No automatic external irreversible actions.
