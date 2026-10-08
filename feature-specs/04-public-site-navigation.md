# 04 — Public site and navigation
Status: Not started
Dependencies: 03
Authoritative references: AGENTS.md and context/. Shared security/configuration rules apply to every feature.

## User outcome and scope
Premium responsive public explanation/demo and accessible private application shell, with correct access states.

## Implementation and data contracts
Implement public hero/workflow/demo/access CTA; labelled mock data. Shell routes for weekly home, brands, content, calendar, progress and settings plus isolated owner area. Scoped navigation and authenticated cache handling. Establish versioned design tokens and reusable states from ui-context.
Design typed input/output schemas, explicit auth policy and database migration before implementation. Reuse existing patterns. Document new configuration in .env.example. Add only data/entities required by this feature.

## Acceptance and verification
Desktop/mobile layouts inspected; keyboard flow and contrast checked; demo is clearly illustrative; pending routes remain blocked on server; logout/workspace switch shows no old private content. Deep links preserve safe intended location after authorized signin.
Record actual checks and results in progress-tracker.md; generated code alone is not completion. Unit-test domain rules, integration-test boundaries, and include critical journey coverage where applicable.

## Edge cases and limits
Loading/error/empty states, slow network, reduced motion, forbidden deep link. Later feature routes use honest unavailable/empty states rather than simulated live functionality.

## Security and operations gate
Validate inputs and AI output; check approved-account/workspace/brand/owner authorization as appropriate; test forbidden access; keep secrets/private content out of client/logs; apply configurable resource limits and idempotency to mutations/jobs. Trace failures with safe error messages. Describe migration/recovery implications. No automatic external irreversible actions.
