# 05 — Onboarding and preferences
Status: Not started
Dependencies: 04
Authoritative references: AGENTS.md and context/. Shared security/configuration rules apply to every feature.

## User outcome and scope
Collect user availability/timezone and brand audience/tone/platforms/targets. Deterministic form completes this feature before AI integration; adaptive questionnaire is implemented in feature 08.

## Implementation and data contracts
Validated brand profile/targets with permanent settings separate from weekly overrides. Store revisions and confirmed facts. Exact evening durations unknown until entered. Capacity/effort data user-editable. Progressive save and resume. AI enhancement asks missing questions and proposes settings through same validated confirm flow.
Design typed input/output schemas, explicit auth policy and database migration before implementation. Reuse existing patterns. Document new configuration in .env.example. Add only data/entities required by this feature.

## Acceptance and verification
Incomplete form resumes; unknown brand facts never invented; changing permanent video target persists; weekly override expires by week scope; invalid timezone/platform configuration rejected; concurrent edits conflict safely. This feature can be Done when the deterministic form is verified; AI enhancement acceptance belongs to 08.
Record actual checks and results in progress-tracker.md; generated code alone is not completion. Unit-test domain rules, integration-test boundaries, and include critical journey coverage where applicable.

## Edge cases and limits
No availability, shift cancellation, impossible goal, partial questionnaire, AI unavailable. No fixed Ahmad-specific brand rules.

## Security and operations gate
Validate inputs and AI output; check approved-account/workspace/brand/owner authorization as appropriate; test forbidden access; keep secrets/private content out of client/logs; apply configurable resource limits and idempotency to mutations/jobs. Trace failures with safe error messages. Describe migration/recovery implications. No automatic external irreversible actions.
