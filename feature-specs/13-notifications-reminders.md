# 13 — Notifications and reminders
Status: Not started
Dependencies: 02,09,12
Authoritative references: AGENTS.md and context/. Shared security/configuration rules apply to every feature.

## User outcome and scope
Owner notified of applicants; customers get planning/overdue/research-ready nudges with configurable quiet hours and dedupe.

## Implementation and data contracts
Durable in-app notifications, timezone-aware reminder preferences and suppression rules. Optional Resend adapter disabled by default. Emails only after verified domain, explicit notification opt-in/authorization and safe templates. Approval/rejection intents deduplicated and account-scoped; do not leak private content in emails. Provider responses tracked.
Design typed input/output schemas, explicit auth policy and database migration before implementation. Reuse existing patterns. Document new configuration in .env.example. Add only data/entities required by this feature.

## Acceptance and verification
One applicant yields one owner notification; retry no duplicate nudge; completed/rescheduled work suppresses old reminder; quiet hours respected; Research more completion notifies correct user; email-disabled core works; unauthorized user cannot view another notification.
Record actual checks and results in progress-tracker.md; generated code alone is not completion. Unit-test domain rules, integration-test boundaries, and include critical journey coverage where applicable.

## Edge cases and limits
Owner offline, bounce, provider outage, timezone change, repeated overdue task, unsubscribed user. No marketing campaigns or unsolicited sends.

## Security and operations gate
Validate inputs and AI output; check approved-account/workspace/brand/owner authorization as appropriate; test forbidden access; keep secrets/private content out of client/logs; apply configurable resource limits and idempotency to mutations/jobs. Trace failures with safe error messages. Describe migration/recovery implications. No automatic external irreversible actions.
