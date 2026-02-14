# Dependency and Design Decisions

## Auth Approach
- Implemented signed HTTP-only cookie sessions in-repo.
  - Reason: npm registry access unavailable in this environment, which blocked adding Auth.js package.
  - Security controls: HMAC-signed token, expiry window, route-level authorization checks.

## Architecture Decisions
- Keep scoring/matching logic in dedicated modules (`lib/psychology`, `lib/matching`, `lib/decision-track`) for testability.
- Use Supabase Postgres as primary persistence with PostgREST adapter and SQL migrations.
- Keep encrypted local adapter as fallback for offline testability only.
- Prefer explainable score outputs over opaque ranking.
