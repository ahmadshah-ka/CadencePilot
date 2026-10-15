# Progress tracker
Planning baseline finalised 2026-10-07. Features 01–04 are present; feature 05 restored in place on 2026-10-15 without Git operations. Local checks have run for implemented features; no hosted integration has been verified (see User-reported setup). Earlier draft superseded.

| ID | Feature | Dependencies | Status | Evidence/blocker |
|---|---|---|---|---|
| 01 | [Project foundation](../feature-specs/01-project-foundation.md) | — | Done (local; CI workflow unexecuted) | Completion entry below |
| 02 | [Authentication and owner approval](../feature-specs/02-authentication-owner-approval.md) | 01 | Implemented-unverified | Local checks pass; hosted login/database not verified (see entry) |
| 03 | [Workspaces and brand isolation](../feature-specs/03-workspaces-brand-isolation.md) | 02 | Implemented-unverified | Local checks pass; RLS verified on local PGlite only (see entry) |
| 04 | [Public site and navigation](../feature-specs/04-public-site-navigation.md) | 03 | Implemented-unverified | Local + browser checks pass against a fake Supabase; hosted not verified (see entry) |
| 05 | [Onboarding and preferences](../feature-specs/05-onboarding-preferences.md) | 04 | Implemented; locally verified | 178 tests + 6 browser checks pass; migration already applied, user confirmed |
| 06 | [Content and publication records](../feature-specs/06-content-publication-records.md) | 05 | Implemented; locally verified | New additive migration pending manual application |
| 07 | [AI adapters and budgets](../feature-specs/07-ai-adapters-budgets.md) | 03,06 | Implemented; locally verified | New additive migration and controlled live check remain manual |
| 08 | [Brand assistant and memory](../feature-specs/08-brand-assistant-memory.md) | 05,07 | Implemented; locally verified | 303 tests + 6 browser checks pass; new additive migration pending manual application |
| 09 | [Durable jobs](../feature-specs/09-durable-jobs.md) | 07 | Not started | — |
| 10 | [Research and content briefs](../feature-specs/10-research-content-briefs.md) | 06,08,09 | Not started | — |
| 11 | [Weekly plans](../feature-specs/11-weekly-plans.md) | 05,06,09,10 | Not started | — |
| 12 | [Calendar and task actions](../feature-specs/12-calendar-task-actions.md) | 11 | Not started | — |
| 13 | [Notifications and reminders](../feature-specs/13-notifications-reminders.md) | 02,09,12 | Not started | — |
| 14 | [Progress statistics](../feature-specs/14-progress-statistics.md) | 06,12 | Not started | — |
| 15 | [Operations and release checks](../feature-specs/15-operations-release-checks.md) | 01,02,03,04,05,06,07,08,09,10,11,12,13,14 | Not started | — |

## Next task
Features 07 and 08 are locally verified. Apply any pending additive migrations
for 06, 07 and 08 in filename order, skipping each one already applied. Feature 07's
controlled live check is in docs/feature07-manual-step.md; Feature 08 activation is
in docs/feature08-manual-step.md. Do not implement feature 09 or extra workflows
without the user's request. No Git operations, hosted verification, or reapplication
of the already-applied feature-05 migration.

## Completion entries
### 01 Project foundation — 2026-10-08
**Changed files:** package.json, package-lock.json, .nvmrc, .gitignore, .prettier*, tsconfig.json, next.config.ts, postcss.config.mjs, eslint.config.mjs, vitest.config.ts, .github/workflows/ci.yml, .env.example (+READINESS_TIMEOUT_MS), README.md, scripts/ (check-config, check-bundle-secrets), src/config, src/domain/errors, src/application (ports, health), src/infrastructure (composition, logging, clock), src/presentation (api, tokens.css), src/app (layout, page, /api/v1/health, /api/v1/ready), src/instrumentation.ts, tests/.
**Commands run (Node 24.18.0, npm 11.16.0) and outcomes:** `rm -rf node_modules .next; npm ci` ok; `npm run verify` exit 0 = prettier check pass, eslint pass, `tsc --noEmit` pass, vitest 36/36 pass (coverage 100% statements/lines/functions, 96.96% branches over domain+application+config, threshold 90%), `next build` ok, bundle scan "No secret canaries in 10 browser bundle files". `npm run audit:prod`: 0 vulnerabilities.
**Scenarios verified:** valid core config with LLM/research/email disabled starts and is ready; empty env: server starts, /health 200, /ready 503 minimal envelope, log names variables only, `check:config` exits 1 with actionable list; invalid/blank/non-http values rejected without echoing values; enabled-service requirements and workspace<=global cap; hung/throwing/false readiness probe -> not ready; handler error -> generic INTERNAL envelope; concurrent getContainer shares one instance (globalThis singleton, one config log line verified on a live server).
**Security evidence:** canary values set for all six secret variables: absent from `.next/static` and from live server logs (valid and invalid config runs); scanner proven to fail by planting a canary file (exit 1). Logger redacts sensitive field names and scrubs known secret values. Routes declare an explicit `public` policy; health/ready expose no diagnostics; trace IDs are server generated; responses `no-store`.
**Known limitations:** `npm audit` (all deps) reports 5 high findings via `braces` -> fast-glob -> @next/eslint-plugin-next -> eslint-config-next 16.4.0; dev-only lint tooling, not shipped; the suggested fix is a downgrade to Next 14 config, so not applied; CI gates production deps only. Install scripts for esbuild/unrs-resolver are not covered by npm `allowScripts` (warning only; all checks pass). No Playwright/e2e (no user journey yet; add with feature 02/04). CI workflow written but not executed (no remote). No database schema or hosted resource touched. Nothing committed.
**Config/context changes:** READINESS_TIMEOUT_MS added; architecture/code-standards unchanged. Versions verified at scaffold: Next 16.4.0, React 19.3.0, TypeScript 5.9.3 (TS 7 not used; unverified with Next), Vitest 5.0.3, ESLint 10.12.0, Tailwind 4.3.3, Zod 4.6.5.
**Next dependency-ready task:** 02 Authentication and owner approval.

### 02 Authentication and owner approval — 2026-10-08 (Implemented-unverified)
**Branch:** feat/02-auth-owner-approval (stacked on feat/01-project-foundation).
**Changed files:** supabase/migrations/20261008000100_account_access.sql; src/domain/access/*; src/application/access/*, src/application/ports/{identity,access-repository,auth-session}.ts; src/infrastructure/supabase/*; src/infrastructure/composition.ts; src/presentation/api/{route-handler,body,account-routes}.ts; src/presentation/auth/page-guards.ts; src/proxy.ts; src/app/{sign-in,account-status,app,admin,auth/callback,actions}; /api/v1/{me,admin/accounts,admin/accounts/[userId]/review}; src/config (new limits + production rules); .env.example; docs/auth-and-database-setup.md; tests/*.
**Design:** Google OAuth with PKCE via @supabase/ssr; sign-in starts in a server action (Next checks the Origin), the post-login path travels in a short-lived HttpOnly cookie so the redirect URL has no query string; /auth/callback exchanges the code, builds redirects from APP_URL and sanitises the path against an allow-list. A DB trigger on auth.users creates every account as pending; ensure_account_access repairs missing rows. The owner is provisioned only by `bootstrap_platform_owner(<verified user id>)` run by hand as the database owner; it is one-time, closed to anon/authenticated/service_role, and ignores metadata. The principal (status, owner flag, aal) is rebuilt from the database on every request, so suspension applies immediately. Review runs through `review_account_access` (service role only; re-verifies the actor is an owner, row lock + expected-revision check, audit event, notification intent in one transaction). Owner actions require aal2 when OWNER_MFA_REQUIRED (must be true in production); /admin/mfa provides TOTP enrollment and verification. Every route declares a policy (public / authenticated / approved / owner); cookie mutations require the configured Origin.
**Commands and results (Node 24.18.0):** `npm run verify` exit 0: prettier, eslint (0 warnings after cleanup), tsc, vitest 123 passed (coverage 98.8% statements / 97.3% branches / 100% functions over domain+application+config, threshold 90%), next build, bundle scan "No secret canaries in 14 browser bundle files"; `npm run audit:prod` 0 vulnerabilities.
**Tested locally:** (a) SQL + RLS against PGlite with a stub of Supabase's auth schema/roles/default grants (tests/db/account-access.test.ts, 12 tests): new users pending; forged metadata cannot create an owner; bootstrap one-time/verified-only/closed to API roles; applicants cannot write their own status or insert platform_admins; non-owners and anon denied review, audit and intents; approve once then stale; parallel reviews → exactly one wins; transition rules; self-review forbidden; reject/suspend/reinstate audited; owner can list applicants; profile writes need approval. Mutation check: disabling RLS or granting execute to anon makes these tests fail. (b) Route tests with fakes: anonymous 401; pending/rejected/suspended blocked from approved routes with handler never invoked; suspension takes effect next request; wrong/missing Origin 403; non-owner and no-MFA owner denied; header forgery (x-user-id etc.) ignored; competing reviews 200+409; body validation/size/content-type; invalid config → 503. (c) Live smoke test of the built app with no session: /app and /admin redirect to /sign-in; hostile `next=https://evil.example` neutralised; APIs 401/403; callback with no code / provider error / bogus code → sign-in?error=...; no canary secrets in logs.
**NOT verified:** anything against the hosted Supabase/Google/Vercel: migrations are not applied; real Google sign-in, the PKCE callback with real cookies, session refresh in the proxy, the trigger on the hosted auth.users, TOTP enrollment, and true multi-connection concurrency (PGlite is single-connection; the FOR UPDATE + revision logic is verified logically, not under real contention). Page components and server actions (admin console, MFA form) are covered by typecheck/build and manual smoke only. Rate limiting of sign-in relies on Supabase Auth defaults. Notification intents are written but nothing consumes or sends them (feature 13).
**Known limitations / decisions to confirm:** accounts whose Google email is unverified are refused; ban/revoke of existing JWTs after suspension relies on per-request status checks (tokens stay valid but unusable); direct SQL changes to platform_admins are not audited; MAX_BRANDS enforcement is application-level (feature 03).
**Config/context changes:** SUPABASE_SECRET_KEY now required unless APP_ENV=development; OWNER_MFA_REQUIRED must be true in production; new limits documented in .env.example.

### 03 Workspaces and brand isolation — 2026-10-08 (Implemented-unverified)
**Branch:** feat/03-workspaces-brand-isolation (stacked on feat/02-auth-owner-approval).
**Changed files:** supabase/migrations/20261008000200_workspaces_brands.sql; src/domain/brands/brand-rules.ts; src/application/ports/workspace-repository.ts; src/application/workspaces/workspace-use-cases.ts; src/infrastructure/supabase/supabase-workspace-repository.ts; src/infrastructure/composition.ts; src/presentation/api/workspace-routes.ts; src/presentation/workspaces/workspace-context.ts; /api/v1/workspaces (current, create), /api/v1/workspaces/{workspaceId}/brands[/{brandId}]; interim /app page + server actions; tests/db/workspaces.test.ts, tests/workspace-routes.test.ts, tests/support/fakes.ts.
**Design:** one private workspace per customer (unique owner_user_id), memberships carry role and revoked_at. Access in RLS requires an approved account AND an unrevoked membership (security-definer helper), so suspension and revocation cut database access at once. brands has unique(workspace_id,id) as the compound target for future descendants, an immutability trigger on workspace_id, a revision bump trigger, column-level grants (no DELETE; archive via archived_at), and a unique active-name index. create_initial_workspace is a single transactional, advisory-locked, idempotent function. The application never trusts a client workspace id: it must match the caller's unrevoked membership or the response is 404; brand lookups always filter by workspace; platform-owner rights confer nothing. Limits (name lengths, JSON bytes, brands per workspace) come from configuration.
**Commands and results:** `npm run verify` exit 0: prettier, eslint, tsc, vitest 154 passed in 16 files (coverage 97.5% statements / 96.0% branches / 100% functions over domain+application+config, threshold 90%), next build, bundle scan clean (14 files); `npm run audit:prod` 0 vulnerabilities.
**Tested locally:** PGlite SQL/RLS (tests/db/workspaces.test.ts): unapproved/anon cannot create; exactly one workspace + owner membership under repeated and parallel calls; invalid input rolls back with no orphans; customer A cannot read, update, insert into or relink customer B's brands (RLS, column grants and immutability trigger each exercised); platform owner sees no customer data; anon denied; no DELETE; revision bumps; duplicate active names rejected; revoked membership and suspension block reads and writes immediately and reinstatement restores. API/use-case tests with fakes: forged workspace ids and foreign brand ids → 404 on list/create/read/update, body-supplied workspace ids ignored, malformed ids 404, owner role gives nothing, revoked/suspended blocked, anonymous 401, cross-origin 403, validation/limits/archive/restore/stale-revision flows. Mutation checks: removing the membership check or the RLS enablement makes tests fail.
**NOT verified:** the migration on the hosted database; real multi-connection concurrency; the interim /app UI beyond typecheck/build; that PostgREST column-grant and RLS behaviour on hosted Supabase matches PGlite (same Postgres semantics, but Supabase's role setup is stubbed). Brand-count cap is app-level and can overshoot by one under simultaneous creates. Workspace archival/deletion and team invitations are deliberately absent.
**Next:** feature 04 (public site and navigation).

### 04 Public site and navigation — 2026-10-08 (Implemented-unverified)
**Branch:** feat/04-public-site-navigation (stacked on feat/03-workspaces-brand-isolation).
**Changed files:** src/presentation/styles/tokens.css (versioned tokens v1), src/app/globals.css (Tailwind theme mapping), src/presentation/components/{ui,site,shell}/*, src/presentation/site/*, public pages under src/app/(public) (/, /how-it-works, /research, /request-access), restyled /sign-in, /account-status and /admin/*, owner layout, app shell under src/app/app (This week, Brands, Content, Calendar, Progress, Settings, Assistant), brand scope cookie + switcher, loading/error/not-found states, playwright.config.ts, tests/e2e/*, CI e2e step, README.
**Design:** follows ui-context.md: calm editorial type (system serif display + sans body, no external fonts), restrained single accent, light/dark by system setting, reduced-motion honoured, 44px touch targets, skip links, aria-current navigation, text-first layouts instead of card walls. Public site has the specified top nav, an interactive eight-step workflow demo (keyboard operable, every panel labelled illustrative, no metrics/testimonials/free-forever claims), research-method transparency and an honest "where things stand" note. App shell: workspace label, visible brand switcher (cookie is only a hint, re-validated against the user's authorized brands every render), sidebar (desktop) / disclosure menu (mobile), assistant side panel on wide screens and a dedicated route on phones, both honest "not available yet". Later-feature pages are explicit unavailable states, nothing is simulated. Owner area has its own layout; non-owners get a 404. Private pages are `no-store`; sign-out revalidates the layout cache and redirects.
**Bug found by browser tests and fixed:** the container is a process-wide singleton created in a different Next.js module graph than routes/server actions, so `error instanceof AppError` was false for adapter-thrown errors (a DB conflict would have become a generic 500 / "error"). Replaced with structural `isAppError` everywhere, with a regression unit test.
**Commands and results (Node 24.18.0, Edge via PLAYWRIGHT_CHANNEL=msedge):** `npm run verify` exit 0: prettier, eslint (0 warnings), tsc, vitest 160 passed in 17 files (coverage 97.6% statements / 96.2% branches / 100% functions; threshold 90%), next build, bundle scan clean (17 files); `npm run audit:prod` 0 vulnerabilities. `npm run test:e2e`: 99 passed, 3 skipped (viewport-specific) across desktop 1280x800, tablet 820x1180, phone 390x844.
**Browser-verified:** every public page and every shell page passes axe WCAG 2.0/2.1 A+AA (includes colour contrast) at all three viewports, in dark mode and with reduced motion; no horizontal overflow; skip link first in tab order; demo operable by keyboard; mobile menus reach every destination; screenshots inspected for desktop and phone (home, brands, owner console). Access flows against the real app code with a local fake of Supabase's HTTP API (NOT the real service; its RLS emulation is approximate): signed-out redirect keeps intended path; hostile `next` neutralised; OAuth cancel/forged code messages; pending/rejected/suspended see only the status page and get 403 from the API; approved non-owner gets 404 for /admin; workspace creation idempotent; brand add/duplicate/switch/archive/restore; customer A cannot list, read or patch customer B's brands by forged workspace or brand id; forged brand-scope cookie ignored; sign-out then Back shows no private content; revoked membership and suspension apply on the next request; owner approve, confirmed reject/suspend, audit trail, and a stale second tab is told the request changed.
**NOT verified:** anything on the hosted stack (real Google sign-in and the post-login deep-link round trip, real Supabase responses, Vercel); the fake server shares my assumptions about PostgREST request/response shapes, so adapter behaviour against real PostgREST is unconfirmed until the runbook checklist is run; TOTP enrolment UI; screen-reader testing with real assistive technology (only automated axe plus keyboard checks); cross-browser (Edge/Chromium only); Lighthouse/performance budgets; dark-mode screenshots were not individually inspected.
**Known gaps:** privacy policy and terms pages do not exist yet and must be published before public signup (feature 15 gate); the brand switcher shows the first page of brands only; the public footer has no legal links; the demo content is intentionally fictional and fixed. CI e2e step is untested remotely (no CI run yet).
**Next:** hosted verification of 02–04 by the user (docs/auth-and-database-setup.md), then feature 05 (onboarding and preferences).

## Status definitions
Not started / In progress / Blocked (state exact dependency) / Implemented-unverified / Done (acceptance and checks documented).

## Completion entry template
Feature ID; date; changed files; tested scenarios; commands and outcomes; security/isolation evidence; known limitations; config/context changes; next dependency-ready task.

## User-reported setup (not verified by the agent)
Reported by the user on 2026-10-08, treated as unverified until tested: GitHub repository; hosted Supabase project; Vercel project with application and Supabase environment variables; Google OAuth configured in Supabase; Groq and Tavily credentials and budgets configured in Vercel. The agent has no access to these services from the development machine (no Supabase CLI, no database client, no `.env.local`), historically hosted application was not verified by the agent. Superseding user update: the feature-05 creator_preferences migration is already applied. Do not infer pending migration status from these historical notes. Manual steps and the hosted verification checklist: [docs/auth-and-database-setup.md](../docs/auth-and-database-setup.md). Earlier notes saying accounts and credentials do not exist are superseded by this section.

## Decisions and implementation assumptions
Product name, precise brand audiences, user timezone/capacity and permanent output targets are configurable inputs. Initial provider choices: Supabase, Groq, Tavily; Vercel at deployment; Resend optional. Accounts were created by the user outside this pack (see User-reported setup). First-release team invitations/billing/autopublishing deferred. Performance figures are proposed targets awaiting a documented benchmark. No unsupported best-in-industry research marketing claim.


## Current user instructions and migration baseline — 2026-10-15

- No Git/GitHub commands, metadata changes, branch operations or repository configuration edits.
- Restore feature 05 only in the current folder. Future requests are feature-scoped.
- creator_preferences SQL pasted by the user is already applied to Supabase.
- Keep the local migration under its original filename as history. Never reapply,
  replace or duplicate it. All future migrations are additive and later.
- New manual SQL or configuration work is reported to the user; do not spend
  time trying to verify inaccessible hosted services. User confirmation and
  local automated test evidence remain distinct.
- No manual action is needed for this restoration; no SQL was executed remotely.
- No new credentials or environment variables required.

Local canonical migration SHA256: `5cf65bbc3d45311deb16a852929d29d1389fe1776a3c80bcd541a45fd1521bc0`.
Scope: creator_preferences table, own-user approved-account RLS, explicit column
grants, immutable owner, and revision/updated_at update trigger, matching the
user's already-applied SQL. Existing feature 02/03 migrations remain intact.


### Feature 05 restored in place — verification complete

- Restored timezone/availability drafts, week-only overrides, brand questionnaire,
  platform selection and permanent/weekly content targets, protected APIs and tests.
- 178 tests passed across 20 files; coverage: 98.74% statements, 97.66% branches,
  100% functions, 99.26% lines.
- TypeScript, ESLint (zero warnings), and scoped Prettier checks passed.
- Existing broad formatting differences in 110 unrelated source/test files were
  not reformatted; only feature-related files were formatted.
- Production build passed using `next build --webpack`; no attempt was made to
  repeat the previously failing default compiler path during this restoration.
- Browser tests: 6/6 passed on desktop, tablet and mobile, including accessibility,
  save/resume and week-only overrides, against local fake services only.
- Browser bundle scan: no configured test secret in 56 bundle files.
- Backup comparison confirms no pre-existing working files removed, no dependency
  changes and no modifications to feature-02/03 migrations.
- No Git/GitHub commands, metadata/configuration edits, commits, branch operations,
  pushes, merges, deployment or hosted SQL execution were performed.
- The user-supplied feature-05 SQL is already applied; its local historical file
  was restored without creating a new migration. No manual action is required.
- Instructions updated in AGENTS.md and CLAUDE.md: user manages Git; future work
  is limited to the requested feature, with precise new manual steps only.
- Next feature: 06, only when explicitly requested. No hosted verification task
  blocks or repeats the user's already-confirmed migration work.

### Feature 06 — implemented and locally verified — 2026-10-15

- Implemented manual originals, derivatives, series, separate source transcripts and
  derivative drafts, ordered format-specific production tasks, archive/restore,
  and per-platform actual publication records with corrections.
- Added typed domain contracts, application use cases, session-scoped Supabase
  adapter, approved-account APIs and Content list/detail forms with cursor paging.
- New additive migration: supabase/migrations/20261015000200_content_publication_records.sql.
  Adds series/content_items/tasks/publications, scoped foreign keys, indexes, RLS,
  restricted column grants, idempotent creates and revision-checked mutation RPCs.
- Tests: 202 passed across 23 files. Coverage: 98.8% statements, 97.85% branches,
  100% functions and 99.45% lines. Real migration SQL exercised locally in PGlite.
- Verified one original across three platforms remains one original/three
  publications; derivatives count separately; replay does not duplicate records;
  publication correction and prerequisite reopening preserve source/history;
  posts omit recording; foreign links, stale revisions, suspended/revoked access,
  direct writes and unauthorized scope access are rejected.
- Six browser checks passed across desktop, tablet and mobile using local test
  services backed by the migration SQL. Includes original-to-derivative workflow,
  transcript preservation on return, publication correction, cursor boundaries,
  accessibility and horizontal-overflow checks. Desktop/mobile screenshots inspected.
- Scoped Prettier and ESLint (zero warnings), TypeScript and production webpack
  build passed. Bundle scan found no secret canaries in 63 browser files.
- Browser regression fixes: production checkbox updates immediately and rolls
  back on failure; prefilled transcript assertions use accessible textbox names.
- New configurable limits documented in README and src/config/content-policy.json;
  no new environment variables, accounts, credentials or dependencies.
- Existing feature-05 migration hash remains exactly
  5cf65bbc3d45311deb16a852929d29d1389fe1776a3c80bcd541a45fd1521bc0.
- Manual step: follow docs/feature06-manual-step.md to run ONLY the new migration
  once in the existing Supabase project. Existing migrations are not reapplied.
  Hosted application, migration execution and real PostgREST integration were
  not verified or operated by this agent. Hosted Content requires the new SQL.
- No Git/GitHub commands, metadata changes, branch operations, deployment or
  hosted SQL execution. No feature 07, AI, scheduling, analytics or media pipeline.
- Next: user applies the new migration; further implementation requires a new request.

### Feature 07 � implemented; local checks complete � 2026-10-15

**Scope/files:** AiProvider/AiBudget ports; domain/ai input/capability rules;
application/ai/run-ai; infrastructure/ai Groq HTTP/SSE adapter, dependency factory
and prompt loader; supabase-ai-budget adapter; owner/MFA-protected scoped probe
API; validated ai-capabilities registry and versioned connection schema/prompt;
env schema/example, README, architecture and the two feature07 runbooks.
No new dependencies or product UI; no feature 08/09/10 functionality added.

**New SQL:** supabase/migrations/20261015000300_ai_budgets.sql, pending manual
application. Private RLS tables ai_budget_windows/ai_reservations; service-only
fixed admission and settlement RPCs. Four indexed global/tenant day/minute
counters, short shared advisory transaction lock, one-use request IDs,
immutable/idempotent settlement, full unknown-charge reservation retention.
Provider calls happen after successful admission and outside the transaction.

**Checks/results:** 259/259 tests passed in 27 files, including 57 new AI tests.
Full coverage: 99.08% statements, 98.51% branches, 100% functions, 99.58% lines.
Command: vitest run --coverage --maxWorkers=1 --hookTimeout=30000 with local
.test-temp. A prior concurrent build caused PGlite setup timeouts; the final
suite was rerun successfully without that competing build. No tests skipped.
Scoped Prettier and ESLint zero-warning checks passed. TypeScript and final
production next build --webpack passed. npm audit --omit=dev --audit-level=high:
0 vulnerabilities. Browser secret scan: clean in 64 files. Deployment trace
explicitly includes prompts/connection-check-v1.txt. No default-compiler retry
or TypeScript suppression was introduced.

**Security/acceptance:** unauthorized/suspended/foreign/archived/revoked scopes
denied; owner does not bypass membership; probe requires owner/MFA + Origin +
strict body. Quota denied before HTTP, duplicate admission denied, global and
tenant counters enforce token/request limits, actual usage reconciles once,
unknown/timeouts/disconnects remain charged, retries honor Retry-After and have
new reservations and hard caps. No automatic retry after provisional stream
output or uncertain failures. UTF-8/schema context and response byte bounds;
malformed/empty/truncated/schema-invalid completions rejected; unknown or invalid
tool proposals rejected and tools never executed. Alternate fake provider passes
normal phase/metering contracts. Raw provider errors and private inputs never
enter logs; no secrets reach client bundles. HTTPS-only operator endpoints,
redirect denial, explicit model allowlist including prototype-key rejection.

**Evidence limits:** SQL exercised in local PGlite, including simultaneous
promise admission. Independent multi-process PostgreSQL connections and hosted
PostgREST were not exercised. HTTP/stream fixtures are simulated, not real Groq.
No live provider request or hosted SQL/deployment performed; controlled live smoke
and manual migration remain outstanding, so this is not a hosted Done claim.
No new UI was added, so existing browser suites were not rerun for this feature.

**Manual steps:** docs/feature07-manual-step.md gives the new SQL, existing Vercel
settings to retain, and one fixed-prompt owner-session smoke request. Optional
new settings have defaults; no new account/key is required. No .env.local exists
in this local folder; no secrets were copied or requested.

**Deployment interruption:** user's Vercel error points to missing
 tests/e2e/content-store.ts. The file exists locally, but existing .gitignore
excludes tests/. User must include that exact helper in the deployed checkout.
No Git commands, ignore edits or production type-check exclusions were used to
hide the missing-module error. Local builds cannot verify repository upload.

**Preserved baseline:** SHA256 of feature02/03/05 migrations still matches the
recorded baseline; no earlier migrations were modified or reapplied remotely.
No Git/GitHub commands, branch changes, repository metadata/configuration edits,
commits, pushes, deployment or hosted mutation. Further features need a new request.

### Feature 08 — implemented and locally verified — 2026-10-15

**Scope/files:** assistant domain rules and typed repository contract; two-phase
application orchestration; Supabase repository and fixed RPC adapter; server prompt
loader; state/chat/command/source/export APIs; full assistant workspace and compact
desktop panel; two versioned prompt files; assistant policy configuration; additive
SQL migration; unit, adapter, SQL/RLS and browser tests; README, architecture, AI/UI
context and Feature 08 runbooks. No Feature 09 queue, research, planning, publishing,
media processing or external autonomous action was added.

**Data/security design:** migration `20261015000400_brand_assistant_memory.sql`
adds scoped conversations, paired messages, confirmed personal/brand memories and
source-provenance summaries. RLS permits approved own-user/member reads; direct
client and broad service table writes are denied. Fixed service RPC operations
reauthorize and serialize idempotent begin/final/fail/confirm/forget/memory/summary
changes. Compound scope checks, context revisions and source validation prevent
cross-brand records, stale proposal resurrection and forgotten/superseded sources
from returning through summaries. History/export are cursor-bounded; FTS and scoped
stats indexes serve relevant records. Retention redaction occurs on authorized
access; confirmed memory remains until explicitly forgotten.

**AI behavior:** the first bounded phase may select only exact stats, selected-brand
content history, current settings or validated proposals. The second phase receives
current database facts/settings, confirmed scoped memories and only the history and
summary blocks that fit the configured context budget. The selected brand and every
explicit comparison are reauthorized during streaming and before commit. Numerical
references resolve from fresh DB strings; literal, unknown or malformed numeric
references are rejected. Provisional output is never stored. Failed/disconnected or
revoked streams atomically leave a failed pair and no partial assistant answer.
Memory/settings proposals persist only after explicit confirmation and current-policy
revalidation. Operational logs exclude messages, prompts, raw provider responses,
reasoning and secrets.

**Checks/results:** TypeScript strict check passed. Scoped Prettier and ESLint passed
with zero warnings. Vitest: 303/303 tests in 30 files; coverage 98.59% statements,
96.38% branches, 100% functions and 99.28% lines. Tests cover exact stats, forged
tools, explicit authorized comparisons, comparison revocation during streaming,
personal/brand isolation, stale/oversize proposals, confirmation and forgetting,
summary invalidation, expiry, admission, stale leases, RLS/direct-write denial,
foreign scope, source/export paging, API/SSE failures and adapter contracts.

Production `next build --webpack` passed after the sandbox-only folder-creation
restriction was removed; this was not an application error. The browser secret scan
found no canaries in 70 files. The deployment trace contains both Feature 08 prompt
files. Edge/Playwright: 6/6 critical journeys passed at desktop, tablet and mobile,
including private memory/source/edit/forget, brand switching, foreign-scope denial,
AI-disabled fallback, accessibility and no horizontal overflow, plus streamed-error
draft preservation. Desktop and mobile screenshots were inspected. The Playwright
server commands now invoke pinned local binaries directly rather than `npx`.

**Configuration/docs:** no dependency or new environment key. Existing
`AI_RETENTION_DAYS` controls effective history retention. Non-secret message,
answer, memory, pagination, retrieval, proposal/comparison, lease/stream and
admission limits are validated from `src/config/assistant-policy.json`. The UI uses
the effective server retention value. See docs/feature08-brand-assistant.md and
docs/feature08-manual-step.md.

**Evidence limits/manual step:** hosted Supabase/PostgREST, Vercel deployment, a
live Groq response and independent multi-process PostgreSQL contention were not
tested. SQL/RLS ran in local PGlite; browser journeys used the real application with
a local SQL-backed Supabase HTTP fake and an intercepted failure stream. Apply only
the new Feature 08 migration once in the existing Supabase project, after any
earlier pending additive migration. Do not rerun the already-applied Feature 05 SQL.
No hosted operation or Git/GitHub command was performed.

**Preserved baseline:** account-access, workspace/brand and creator-preferences
migration hashes remain `3f2470fca8f7e3d2773033abe85f140a9caaa872c4685af0c6237542ceaa4d66`,
`3b6e92ab03c4fcb2f8a5eea5f7e14690be620cbea9db0ba564983c0b6a35934e` and
`5cf65bbc3d45311deb16a852929d29d1389fe1776a3c80bcd541a45fd1521bc0`.
Next implementation requires an explicit new request.
