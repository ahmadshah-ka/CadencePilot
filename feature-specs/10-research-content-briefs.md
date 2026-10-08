# 10 — Research and content briefs
Status: Not started
Dependencies: 06,08,09
Authoritative references: AGENTS.md and context/. Shared security/configuration rules apply to every feature.

## User outcome and scope
Essential evidence-backed research per topic, clickable from schedule, stored/versioned and expandable by user request.

## Implementation and data contracts
Implement architecture research stages through Tavily search/extract adapter and bounded LLM synthesis/review. Define current/historical/custom focus, scope/depth/cutoff, query trail, selected sources, claims/evidence links, chronology/gaps and talking outline. Safe URL extraction boundary and prompt-injection handling. Citation existence and support checks plus substantive evaluation. Save permitted excerpts, not arbitrary full copyrighted pages.
Design typed input/output schemas, explicit auth policy and database migration before implementation. Reuse existing patterns. Document new configuration in .env.example. Add only data/entities required by this feature.

## Acceptance and verification
Current brief distinguishes event/publication/retrieval dates; historical brief exposes predecessors/interpretations/disputes; syndicated sources counted once by origin; nonexistent or non-supporting citations flagged; insufficient evidence cannot become Ready; click opens saved brief; Research more creates version without overwriting notes. Evaluate representative fixtures plus documented manual spot checks.
Record actual checks and results in progress-tracker.md; generated code alone is not completion. Unit-test domain rules, integration-test boundaries, and include critical journey coverage where applicable.

## Edge cases and limits
Blocked/paywalled page, no evidence, contradictory reports, malicious source, unsafe redirected URL, research quota, obsolete brief. Direct fetching must defend SSRF; failure shows coverage limits. Completion checkbox never certifies factual accuracy.

## Security and operations gate
Validate inputs and AI output; check approved-account/workspace/brand/owner authorization as appropriate; test forbidden access; keep secrets/private content out of client/logs; apply configurable resource limits and idempotency to mutations/jobs. Trace failures with safe error messages. Describe migration/recovery implications. No automatic external irreversible actions.
