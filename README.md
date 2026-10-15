# CadencePilot
A multi-user content planning assistant known as CadencePilot - that turns brand goals, available time and evidence-backed ideas into an achievable weekly creation schedule. It helps creators understand topics, prepare material and track actual creation/publication without spending their week maintaining a planner.

## Local setup
Verified with Node 24.18.0 and npm 11.16.0 (see `.nvmrc`, `engines` in package.json). Dependencies are pinned to exact versions in package.json and package-lock.json.

```bash
npm ci                      # clean install from the lockfile
cp .env.example .env.local  # then fill the required values (Windows: copy .env.example .env.local)
npm run check:config        # prints missing/invalid variable names (never values)
npm run dev                 # http://localhost:3000
```

Required to start: `APP_NAME`, `APP_URL`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`. LLM, research and email are disabled by default and need no credentials. No hosted resources are contacted by the foundation; Supabase values only need to be well-formed URLs/strings until feature 02. Every variable is documented in `.env.example`.

With invalid configuration the server still starts: `GET /api/v1/health` returns 200, `GET /api/v1/ready` returns 503, and the problem variable names are logged once.

## Commands
| Command | Purpose |
|---|---|
| `npm run dev` / `build` / `start` | Next.js development, production build, production server |
| `npm run format:check` / `format` | Prettier check / write |
| `npm run lint` | ESLint (includes layer-boundary import rules) |
| `npm run typecheck` | TypeScript strict, no emit |
| `npm test` / `test:coverage` | Vitest; coverage enforces 90% on `src/domain`, `src/application`, `src/config` |
| `npm run check:bundle-secrets` | After a build with canary secrets set, fails if any appear in `.next/static` |
| `npm run audit:prod` | `npm audit` for production dependencies (high+) |
| `npm run test:e2e` | Browser tests (Playwright) against a production build and a local fake of the Supabase API; run `npm run build` first. Set `PLAYWRIGHT_CHANNEL=msedge` (or `chrome`) to use an installed browser, otherwise run `npx playwright install chromium`. Screenshots land in `test-results/screens/` |
| `npm run verify` | format, lint, typecheck, coverage, build and bundle scan in order |

For `verify`/`check:bundle-secrets`, set the core variables plus canary strings in the secret variables (see `.github/workflows/ci.yml` for an example set).

## Database and sign-in setup
Migrations are in `supabase/migrations/`. Applying them, bootstrapping the owner, Supabase dashboard settings and the hosted verification checklist are in [docs/auth-and-database-setup.md](docs/auth-and-database-setup.md). Local SQL/RLS tests use an in-process Postgres (`tests/db`) and do not need any hosted resource.

## Routes
Public: `/`, `/how-it-works`, `/research`, `/request-access`, `/sign-in`. Signed-in: `/account-status` (pending, rejected, suspended), `/app/*` (approved only), `/admin/*` (owner only). API under `/api/v1` (see `src/app/api`). Every route declares an access policy.

## Endpoints: health (public, unauthenticated, minimal)
- `GET /api/v1/health` → `{"status":"ok"}` (liveness; does not touch config or dependencies)
- `GET /api/v1/ready` → `{"status":"ready"}` or 503 `{"error":{"code":"DEPENDENCY_UNAVAILABLE","message":"Service is not ready."}}`

## Layout
`src/domain` (pure rules, errors) → `src/application` (use cases, ports) → `src/infrastructure` (adapters, composition root) → `src/presentation` + `src/app` (thin Next handlers/pages). `src/config` holds validated settings. See `AGENTS.md` and `context/`.


## Feature 05: restored onboarding and preferences

Personal timezone and availability: `/app/settings`. Open a brand's name under
`/app/brands` to edit its topic, audience, tone, platforms and goals. Drafts save
explicitly and can be resumed. Permanent goals are separate from Monday-scoped
weekly overrides. Empty availability means no capacity, not assumed free time.
AI onboarding remains feature 08. No new API keys or environment variables.

Non-secret settings are versioned in `src/config/onboarding-policy.json`:

| Key | Type | Default | Purpose |
|---|---|---|---|
| version | integer | 1 | Policy document version |
| textMaxLength | integer | 2000 | Maximum descriptive field length |
| weeklyTargetMax | integer | 100 | Maximum target per format |
| maxWeeklyOverrides | integer | 26 | Saved week override limit |
| maxAvailabilityWindows | integer | 28 | Windows per schedule |
| maxSettingsBytes | integer | 8192 | Maximum serialized personal settings |
| minutesPerDay | integer | 1440 | Wall-clock minute boundary |
| daysPerWeek | integer | 7 | Monday-first schedule boundary |
| platforms | string array | See JSON | Editable supported-platform catalog |
| formats | string array | videos, shorts, posts | Output target catalog |
| weekdays | string array | Monday through Sunday | Day-index labels |

API: GET/PUT `/api/v1/preferences` uses the approved session's user ID.
PUT `/api/v1/workspaces/{workspaceId}/brands/{brandId}/preferences` additionally
requires workspace membership and brand scope. Writes take
`{expectedRevision, settings}`; personal revision zero means create-only, brand
writes require the brand's current revision. Stale writes return 409, invalid
input 400, missing session 401, disallowed access 403 or non-enumerable brand 404.
Do not automatically retry a stale save with an invented revision. Existing
Origin and body-size checks apply; release-wide admission rate limiting remains
part of hardening. Week-scoped overrides do not carry into another week.

### Already-applied database baseline

The user confirms `20261015000100_creator_preferences.sql` has already been run
in Supabase. Its local file is the historical record of that exact schema,
not a request to run it again. Do not recreate the table, policies or trigger.
Future schema changes must use additive, later migrations and state their manual
application steps. No hosted verification is required from this coding agent.

### Working arrangement

The coding agent must not run Git/GitHub commands or alter repository settings
or branches. Work directly in the current folder and implement only the feature
the user requests. Manual operations are reported briefly and handled by the user.


## Feature 06 — manual content and publication records

Open `/app/content`, choose a brand and add an original. Open the record to save
source links, an optional pasted source transcript and separate notes/draft text.
Create derivatives from the original's detail page. Formats and parent/series
links are fixed at creation so existing production history cannot be silently
reinterpreted. Series can be named, renamed, archived and restored.

Videos and shorts have recorded -> edited -> ready steps; written posts have
edited -> ready. Completing steps enforces prerequisite order. Reopening an
earlier step reopens dependent steps transactionally, without erasing publication
history. A source transcript is not a derivative draft and no clip timestamps
are inferred. Archived originals remain linked to existing derivatives and
cannot receive new derivatives until restored. No hard deletion is exposed.

Publication records are manual facts, not automatic social uploads. Each content
item has at most one record per platform. Record a real publication date/link,
or uncheck published and save to correct it. Future dates are rejected. A video
on three platforms remains one original and three actual publications; its
derivatives are separate content items. Progress analytics remain feature 14.

### Configuration

No new environment variables. Non-secret settings in
`src/config/content-policy.json` are validated at module load:

| Key | Type | Default | Purpose |
|---|---|---|---|
| titleMaxLength | integer | 200 | Content and series title limit |
| transcriptMaxLength | integer | 12000 | Optional source transcript character limit |
| notesMaxLength | integer | 4000 | Separate notes/draft character limit |
| urlMaxLength | integer | 2048 | Reference/publication URL character limit |
| listPageSize | integer | 25 | Bounded cursor page size, maximum 100 |

The platform catalog comes from the existing onboarding policy. Schema ceilings
and format/task enums are persisted contracts; changing them needs an additive
migration and matching application changes. Existing request-body byte limits
still apply (including to multi-byte transcripts); oversize submissions fail
without truncation. The database bounds per-item platform records to 100.

### API and persistence

Under `/api/v1/workspaces/{workspaceId}/brands/{brandId}`:
- GET `/content` supports cursor, includeArchived and optional parentId.
- GET `/content/{contentId}` returns detail/tasks/publications and series title.
- GET `/series` supports cursor and includeArchived.
- POST `/content-commands` takes `{action,id,input}`. Actions: create, edit,
  archive, task, publication, create-series, edit-series. Create inputs include a
  stable UUID requestId reused on retries. Conflicting reuse returns 409 instead
  of overwriting an existing record. Metadata/tasks/archive use the content
  revision; publications use the platform record revision (zero=create-only);
  series editing uses its own revision.

Every route requires approved membership in the workspace and explicit brand
scope. Reads run as the signed-in user with RLS; RPCs independently reauthorize,
lock and write transactionally. Direct client table writes are not granted.
Private idempotency payloads are not exposed through read grants. Compound
foreign keys and RPC validation prevent cross-brand parents/series and
derivative-of-derivative links. Lists omit transcript and notes bodies, details
load them separately. No unbounded collection is rendered at once.

Responses: 400 invalid input, 401 unauthenticated, 403 unapproved/origin failure,
404 unknown/foreign scope or record, 409 stale revision or invalid transition,
503 unavailable database. No automatic stale-save retries; preserve/copy draft
input before reloading. Platform-wide admission throttling remains a release
hardening item; schema/body/page bounds apply now.

### Manual step

Apply only the new feature-06 migration once using
[the manual instructions](docs/feature06-manual-step.md). The existing feature-05
migration is already applied and unchanged. No Git or hosted operations are
performed by the coding agent. Browser verification uses isolated local services.
