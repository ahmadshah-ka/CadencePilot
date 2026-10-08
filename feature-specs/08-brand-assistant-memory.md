# 08 — Brand assistant and memory
Status: Not started
Dependencies: 05,07
Authoritative references: AGENTS.md and context/. Shared security/configuration rules apply to every feature.

## User outcome and scope
Scoped chat that answers brand questions from records, remembers confirmed preferences and lets users inspect/edit/forget them. Add adaptive AI onboarding over the confirmed-setting flow established in 05.

## Implementation and data contracts
Conversations/messages, confirmed memories and summary provenance. Server builds token-budgeted context and exposes allowlisted exact-stat/history/settings tools. Full-text search for historical relevance. Personal preferences separated from brand facts. Proposals persist only through confirmation or explicit save instruction. Memory changes invalidate affected summaries/caches.
Design typed input/output schemas, explicit auth policy and database migration before implementation. Reuse existing patterns. Document new configuration in .env.example. Add only data/entities required by this feature.

## Acceptance and verification
Exact counts from DB, no invented totals; another brand excluded unless explicit workspace comparison; forged tool IDs denied; forgotten/superseded facts not reintroduced by summaries; brainstorming not treated as policy; stream errors preserve conversation consistency; tenant cache isolation proved. AI onboarding asks missing questions, proposes validated fields for confirmation, and falls back to the form if unavailable.
Record actual checks and results in progress-tracker.md; generated code alone is not completion. Unit-test domain rules, integration-test boundaries, and include critical journey coverage where applicable.

## Edge cases and limits
Long history, contradictory facts, deleted source message, zero activity, revoked access during stream. No raw chain-of-thought storage; user export/forget pathway and retention documented.

## Security and operations gate
Validate inputs and AI output; check approved-account/workspace/brand/owner authorization as appropriate; test forbidden access; keep secrets/private content out of client/logs; apply configurable resource limits and idempotency to mutations/jobs. Trace failures with safe error messages. Describe migration/recovery implications. No automatic external irreversible actions.
