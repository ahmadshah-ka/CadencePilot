# Progress tracker
Planning baseline finalised 2026-10-07. Feature 01 scaffold implemented 2026-10-08; features 02+ have no code. Service accounts, credentials and infrastructure have not been provisioned; only feature 01 local checks have run. Earlier draft superseded.

| ID | Feature | Dependencies | Status | Evidence/blocker |
|---|---|---|---|---|
| 01 | [Project foundation](../feature-specs/01-project-foundation.md) | — | Done (local; CI workflow unexecuted) | Completion entry below |
| 02 | [Authentication and owner approval](../feature-specs/02-authentication-owner-approval.md) | 01 | Not started | — |
| 03 | [Workspaces and brand isolation](../feature-specs/03-workspaces-brand-isolation.md) | 02 | Not started | — |
| 04 | [Public site and navigation](../feature-specs/04-public-site-navigation.md) | 03 | Not started | — |
| 05 | [Onboarding and preferences](../feature-specs/05-onboarding-preferences.md) | 04 | Not started | — |
| 06 | [Content and publication records](../feature-specs/06-content-publication-records.md) | 05 | Not started | — |
| 07 | [AI adapters and budgets](../feature-specs/07-ai-adapters-budgets.md) | 03,06 | Not started | — |
| 08 | [Brand assistant and memory](../feature-specs/08-brand-assistant-memory.md) | 05,07 | Not started | — |
| 09 | [Durable jobs](../feature-specs/09-durable-jobs.md) | 07 | Not started | — |
| 10 | [Research and content briefs](../feature-specs/10-research-content-briefs.md) | 06,08,09 | Not started | — |
| 11 | [Weekly plans](../feature-specs/11-weekly-plans.md) | 05,06,09,10 | Not started | — |
| 12 | [Calendar and task actions](../feature-specs/12-calendar-task-actions.md) | 11 | Not started | — |
| 13 | [Notifications and reminders](../feature-specs/13-notifications-reminders.md) | 02,09,12 | Not started | — |
| 14 | [Progress statistics](../feature-specs/14-progress-statistics.md) | 06,12 | Not started | — |
| 15 | [Operations and release checks](../feature-specs/15-operations-release-checks.md) | 01,02,03,04,05,06,07,08,09,10,11,12,13,14 | Not started | — |

## Next task
02 Authentication and owner approval (dependency 01 met). Next milestone is 01–03: running local scaffold, secure approved login and isolated workspace. Feature 05 finishes the deterministic form. Feature 08 adds its AI enhancement; there is no circular dependency.

## Completion entries
### 01 Project foundation — 2026-10-08
**Changed files:** package.json, package-lock.json, .nvmrc, .gitignore, .prettier*, tsconfig.json, next.config.ts, postcss.config.mjs, eslint.config.mjs, vitest.config.ts, .github/workflows/ci.yml, .env.example (+READINESS_TIMEOUT_MS), README.md, scripts/ (check-config, check-bundle-secrets), src/config, src/domain/errors, src/application (ports, health), src/infrastructure (composition, logging, clock), src/presentation (api, tokens.css), src/app (layout, page, /api/v1/health, /api/v1/ready), src/instrumentation.ts, tests/.
**Commands run (Node 24.18.0, npm 11.16.0) and outcomes:** `rm -rf node_modules .next; npm ci` ok; `npm run verify` exit 0 = prettier check pass, eslint pass, `tsc --noEmit` pass, vitest 36/36 pass (coverage 100% statements/lines/functions, 96.96% branches over domain+application+config, threshold 90%), `next build` ok, bundle scan "No secret canaries in 10 browser bundle files". `npm run audit:prod`: 0 vulnerabilities.
**Scenarios verified:** valid core config with LLM/research/email disabled starts and is ready; empty env: server starts, /health 200, /ready 503 minimal envelope, log names variables only, `check:config` exits 1 with actionable list; invalid/blank/non-http values rejected without echoing values; enabled-service requirements and workspace<=global cap; hung/throwing/false readiness probe -> not ready; handler error -> generic INTERNAL envelope; concurrent getContainer shares one instance (globalThis singleton, one config log line verified on a live server).
**Security evidence:** canary values set for all six secret variables: absent from `.next/static` and from live server logs (valid and invalid config runs); scanner proven to fail by planting a canary file (exit 1). Logger redacts sensitive field names and scrubs known secret values. Routes declare an explicit `public` policy; health/ready expose no diagnostics; trace IDs are server generated; responses `no-store`.
**Known limitations:** `npm audit` (all deps) reports 5 high findings via `braces` -> fast-glob -> @next/eslint-plugin-next -> eslint-config-next 16.4.0; dev-only lint tooling, not shipped; the suggested fix is a downgrade to Next 14 config, so not applied; CI gates production deps only. Install scripts for esbuild/unrs-resolver are not covered by npm `allowScripts` (warning only; all checks pass). No Playwright/e2e (no user journey yet; add with feature 02/04). CI workflow written but not executed (no remote). No database schema or hosted resource touched. Nothing committed.
**Config/context changes:** READINESS_TIMEOUT_MS added; architecture/code-standards unchanged. Versions verified at scaffold: Next 16.4.0, React 19.3.0, TypeScript 5.9.3 (TS 7 not used; unverified with Next), Vitest 5.0.3, ESLint 10.12.0, Tailwind 4.3.3, Zod 4.6.5.
**Next dependency-ready task:** 02 Authentication and owner approval.

## Status definitions
Not started / In progress / Blocked (state exact dependency) / Implemented-unverified / Done (acceptance and checks documented).

## Completion entry template
Feature ID; date; changed files; tested scenarios; commands and outcomes; security/isolation evidence; known limitations; config/context changes; next dependency-ready task.

## Decisions and implementation assumptions
Product name, precise brand audiences, user timezone/capacity and permanent output targets are configurable inputs. Initial provider choices: Supabase, Groq, Tavily; Vercel at deployment; Resend optional. No accounts created by this pack. First-release team invitations/billing/autopublishing deferred. Performance figures are proposed targets awaiting a documented benchmark. No unsupported best-in-industry research marketing claim.
