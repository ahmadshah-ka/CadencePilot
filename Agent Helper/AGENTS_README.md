# Content planning SaaS — development planning pack
Working product name only; final name is configurable. This is a documentation pack, not a runnable application. Extract its contents into a new project directory. No credentials are included.

## Start today
1. Read AGENTS.md and context/project-overview.md.
2. Create service accounts in the order below. Existing accounts can be reused.
3. Ask your coding agent to implement feature 01 only, then verify it before proceeding.
4. Follow the dependency order in context/progress-tracker.md. Replace this README's provisional instructions with actual install/run/test instructions after scaffolding.

## Account setup
Required for early development:
- GitHub: https://github.com/signup — private repository, version control and later CI/deployment. No application secret required.
- Supabase: https://supabase.com/dashboard — development project, PostgreSQL and Auth. Save project URL, publishable key, server secret key and (only if direct SQL tooling needs it) database URL in local secret settings. Select a region near the intended users; record it as deployment configuration. Never expose the secret/service-role key in the browser.
- Google Cloud: https://console.cloud.google.com/ — OAuth web client and consent configuration for Google login through Supabase. Use the exact callback URL Supabase provides; configure authorized app redirects separately in Supabase. Keep OAuth client secret in Supabase provider settings. Google testing mode can restrict who signs in; configure it before real customer access.
- Groq: https://console.groq.com/ — create a project API key. Initial model preference is openai/gpt-oss-120b, configured rather than hardcoded. Confirm current model availability and organization limits.
- Tavily: https://app.tavily.com/ — research search/extraction key. Free plan currently lists 1,000 credits/month; operations consume differing credits. Use bounded search/extract initially, not unrestricted deep-research calls.

Later:
- Vercel: https://vercel.com/signup — repository deployment. Hobby is personal/non-commercial only; choose a suitable commercial plan before customer/commercial launch. Local development needs no hosting account or subscription.
- Resend: https://resend.com/ — optional email. Production sending needs an owned, verified domain and DNS. In-app reminders work first. No paid domain purchase required to begin local development.

Do not paste API keys, passwords, recovery codes or OAuth secrets into chat. Enter them in .env.local, provider consoles and deployment secret settings. .env.example contains names and documentation only. Enable MFA on infrastructure and owner accounts. Separate development and production credentials.

## First milestone
Features 01–03: application runs locally; authenticated applicants remain pending; owner approves an applicant; an approved user enters a private workspace; cross-customer access is rejected. No LLM account is needed to prove this milestone.

## Coding-agent kickoff
Read AGENTS.md, CLAUDE.md, all context files and feature-specs/01-project-foundation.md. Implement feature 01 using the agreed architecture. First inspect the environment and existing files, then state a short implementation plan. Create the application scaffold, validated configuration, logging, lint/type-check/test tooling and CI. Do not implement later features or provision/deploy services. Verify the acceptance criteria and update progress-tracker.md with evidence and the next step.

## Scope and limitations
There is no implemented application, tested performance claim or completed security audit in this pack. Free provider allowances are shared service limits, not guarantees of capacity for all customers. Research quality must be evaluated before making marketing claims. Existing earlier draft files are superseded and should not be merged blindly.

## Verified service references (2026-10-07; recheck before purchase/launch)
- https://vercel.com/docs/plans/hobby
- https://supabase.com/pricing
- https://supabase.com/docs/guides/auth/social-login/auth-google
- https://console.groq.com/docs/models
- https://console.groq.com/docs/rate-limits
- https://console.groq.com/docs/structured-outputs
- https://docs.tavily.com/documentation/api-credits
- https://supabase.com/docs/guides/queues
