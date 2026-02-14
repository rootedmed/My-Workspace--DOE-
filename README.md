# Commitment Match

Commitment-oriented dating platform with:
- Supabase SSR Auth (App Router cookies)
- Supabase Postgres persistence
- adaptive onboarding (fast + deep)
- explainable matching
- 14-day decision track

## Core Guardrails
- No diagnosis labels or therapy claims.
- Derived signals first; raw questionnaire storage minimized.
- Match explanations always include fit + potential friction + prompts.
- No infinite swipe loop behavior.

## Stack
- Next.js App Router + TypeScript
- Supabase PostgREST (anon key + RLS for user runtime traffic)
- Zod validation
- Vitest + Testing Library
- ESLint + Prettier

## Environment
Copy `.env.example` to `.env.local` and set:
- `APP_ENCRYPTION_KEY`
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `APP_PREVIEW_READ_ONLY` (optional, default `false`)
- `OBSERVABILITY_WEBHOOK_URL` (optional, error event sink)
- Optional local dev fallback toggle:
  - `ALLOW_LOCAL_FALLBACK=true`

## Supabase-Only Mode Behavior
- In `NODE_ENV=production`: app requires `SUPABASE_URL` + `SUPABASE_ANON_KEY`.
- In Vercel preview (`VERCEL_ENV=preview`): app also requires both Supabase vars.
- In local development and test, encrypted local fallback is available.
- In non-strict environments, if Supabase queries fail, runtime falls back to local encrypted store.
- If vars are missing in strict mode, DB client creation throws immediately.

## Supabase Setup (Free Tier)
1. Create a Supabase project.
2. Open SQL Editor and run `supabase/migrations/001_init.sql`.
   - Optional with Supabase CLI: `supabase db push` (from repo root with linked project).
3. Add env vars to `.env.local`:
   - `SUPABASE_URL=https://<project-id>.supabase.co`
   - `SUPABASE_ANON_KEY=<anon-key>`
   - `NEXT_PUBLIC_SUPABASE_URL=https://<project-id>.supabase.co`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon-key>`
   - `SUPABASE_SERVICE_ROLE_KEY=<service-role-key>` (seed/admin scripts only)
4. Seed demo data:
   - `npm run seed:supabase`

## Local Run
1. `npm install`
2. `cp .env.example .env.local`
3. Fill `.env.local` values
4. `npm run check`
5. `npm run dev`

## Demo Seed
- `npm run seed:supabase` seeds demo users, profiles, and one demo match.
- `npm run seed:demo` seeds local encrypted fallback store (offline/test mode).

## Deploy to Vercel (with Supabase)
1. Push repo to Git provider.
2. Create project in Vercel and import repo.
3. Add environment variables in Vercel Project Settings using environment scopes:
   - `Preview`: use **staging Supabase** credentials.
   - `Production`: use **production Supabase** credentials.
4. Required variables for both Preview/Production:
   - `APP_ENCRYPTION_KEY`
   - `SUPABASE_URL`
   - `SUPABASE_ANON_KEY`
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
5. Optional variable for seed/admin jobs only:
   - `SUPABASE_SERVICE_ROLE_KEY`
6. Optional safety mode for Preview:
   - set `APP_PREVIEW_READ_ONLY=true` to block write endpoints (`503`) and avoid preview-side data mutation.
7. Ensure Supabase migrations have already run in the target Supabase project.
8. Deploy.

## Common Failure Modes
- Error: `Supabase-only mode: SUPABASE_URL and SUPABASE_ANON_KEY are required...`
  - Cause: production/preview deployment missing Supabase env vars.
  - Fix: set both vars in Vercel project env settings.
- Error: `Invalid server environment: missing ...`
  - Cause: strict runtime (production/preview) missing required server env vars.
  - Fix: set the missing vars in the matching Vercel environment scope.
- Preview returns `503 Preview is read-only.`
  - Cause: `APP_PREVIEW_READ_ONLY=true` for preview.
  - Fix: expected behavior for read-only previews; disable only if preview writes are intended.

## Routes
- `/` landing
- `/register` account creation
- `/login` sign in
- `/app` protected onboarding, matches, decision track

## APIs
- `GET /api/auth/csrf`
- `POST /api/auth/register`
- `POST /api/auth/login`
- `POST /api/auth/logout`
- `POST /api/onboarding/complete`
- `GET /api/matches/preview`
- `POST /api/matches/calibration`
- `POST /api/decision-track/start`
- `POST /api/decision-track/advance`
- `GET /api/health`

## Security
- Session model:
  - Auth uses Supabase SSR cookie-based sessions via `@supabase/ssr`.
  - Session refresh/cookie sync runs in `middleware.ts`.
  - No custom access-token cookie handling for app auth flow.
- Data access model:
  - User-facing runtime requests use `SUPABASE_ANON_KEY` + RLS.
  - `SUPABASE_SERVICE_ROLE_KEY` is restricted to seed/admin scripts only.
- CSRF protection:
  - Double-submit cookie pattern is enforced for state-changing routes.
  - Server issues `cm_csrf` via `GET /api/auth/csrf`.
  - Client must send `x-csrf-token` header matching the `cm_csrf` cookie.
  - Requests missing/invalid token receive `403`.
- Rate limits:
  - `POST /api/auth/login`: 5 attempts / 10 min per `ip + email`.
  - `POST /api/auth/register`: 5 attempts / 10 min per `ip + email`.
  - `POST /api/onboarding/complete`: 12 submits / 10 min per `ip + user`.
  - `GET /api/matches/preview`: 20 refreshes / 5 min per `ip + user`.
  - Current implementation is in-memory (good for single-instance dev/test). For production scale, move this to Redis/Upstash.
- Secret handling:
  - `SUPABASE_SERVICE_ROLE_KEY` is not used in app runtime (`app/` + `lib/`).
  - It is only used in scripts such as `scripts/seed-supabase.mjs`.
  - Runtime validation errors and Supabase request errors never include secret values.

## Observability
- Error tracking (Sentry equivalent):
  - Uses Next.js App Router instrumentation (`instrumentation.ts`) to capture server/edge request errors.
  - Errors are logged as structured JSON and can be forwarded to `OBSERVABILITY_WEBHOOK_URL`.
- Structured API logging:
  - `middleware.ts` injects/propagates `x-request-id` for all `/api/*` requests.
  - Protected routes log `user_id` context after session resolution.
  - Logs intentionally exclude secrets, raw tokens, and encrypted payloads.
- Health endpoint:
  - `GET /api/health` checks app boot path + lightweight DB connectivity (`db.ping()`).
  - Returns `200` with `{ status: "ok", app: "ok", db: "ok" }` when healthy.
  - Returns `503` with `{ status: "error", db: "error" }` on DB failure.
  - Always includes `x-request-id` response header.

## Deployment Checklist
1. Environment variables
   - Vercel `Preview` uses staging Supabase vars (or `APP_PREVIEW_READ_ONLY=true`).
   - Vercel `Production` uses production Supabase vars.
   - `APP_ENCRYPTION_KEY`, `SUPABASE_URL`, `SUPABASE_ANON_KEY` are set.
2. Migrations
   - Run `supabase/migrations/001_init.sql` and `supabase/migrations/002_rls.sql` in target Supabase project before deploy.
3. Seeding
   - Run `npm run seed:supabase` in staging only.
   - Do not seed production with demo data.
4. Health verification
   - Verify `GET /api/health` returns `200` in preview and production.
   - Verify auth + onboarding happy path in preview before production promotion.

## Go/No-Go
- `Go`:
  - All required env vars present in correct Vercel scope.
  - Migrations applied to target Supabase project.
  - `npm run check` passes and `/api/health` is healthy.
  - Preview validation complete.
- `No-Go`:
  - Any missing strict env var.
  - Migration not applied.
  - Health endpoint failing or auth/onboarding path broken.

## Health Testing
- Local:
  1. `npm run dev`
  2. `curl -i http://localhost:3000/api/health`
  3. Confirm `HTTP/1.1 200`, JSON `status=ok`, and `x-request-id` header.
- Vercel:
  1. Open `https://<preview-or-prod-domain>/api/health`
  2. Confirm status `200` and `x-request-id` present.
  3. Check Vercel logs for structured `api_request` / `health_check` events.

## Docs
- `AGENT.md` (repository execution and safety rules)
- `docs/psychology-foundation.md`
- `docs/research-log.md`
- `docs/matching-model.md`
- `docs/privacy.md`
- `docs/security.md`
- `docs/decisions.md`
