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
