# 07 — AI adapters and budgets
Status: Not started
Dependencies: 03,06
Authoritative references: AGENTS.md and context/. Shared security/configuration rules apply to every feature.

## User outcome and scope
Working configurable Groq adapter behind provider-neutral contracts. Establish safe tool/generation boundaries and measurable usage.

## Implementation and data contracts
Capability registry for streaming/tool calls/structured output; versioned prompt files and schemas. Verify current GPT-OSS restrictions and split tool/structured phases as needed. Global and tenant reservations for tokens/requests, configurable daily caps/timeouts/retries/context/output limits; sanitized call metrics. Tests use fake adapters; one controlled real smoke call.
Design typed input/output schemas, explicit auth policy and database migration before implementation. Reuse existing patterns. Document new configuration in .env.example. Add only data/entities required by this feature.

## Acceptance and verification
No key in client/logs; invalid output rejected; budget denied before provider request; concurrent reservations cannot overspend admitted budget; actual use reconciled; 429 respects retry hints; unsupported capability fails clearly; alternate fake adapter passes same contracts. Model settings are config.
Record actual checks and results in progress-tracker.md; generated code alone is not completion. Unit-test domain rules, integration-test boundaries, and include critical journey coverage where applicable.

## Edge cases and limits
Quota exhaustion, context too large, stream disconnect, unknown charged usage on timeout, provider outage. No automatic paid fallback or unlimited retries.

## Security and operations gate
Validate inputs and AI output; check approved-account/workspace/brand/owner authorization as appropriate; test forbidden access; keep secrets/private content out of client/logs; apply configurable resource limits and idempotency to mutations/jobs. Trace failures with safe error messages. Describe migration/recovery implications. No automatic external irreversible actions.
