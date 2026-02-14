# AGENT Rules

This file defines non-negotiable engineering and delivery rules for this repository.

## 1) Server-Only Secrets

- `SUPABASE_SERVICE_ROLE_KEY` must never be used in user-facing runtime code paths.
- Runtime app requests must use `SUPABASE_ANON_KEY` + RLS.
- Service role usage is restricted to seed/admin scripts only.
- Never log secrets, tokens, or encrypted payload contents.

## 2) RLS Requirements

- RLS must be enabled on all user-data tables.
- Policies must be explicit per operation:
  - `FOR SELECT`
  - `FOR INSERT` with `WITH CHECK`
  - `FOR UPDATE` with `USING` and `WITH CHECK`
  - `FOR DELETE` with `USING`
- Do not use `FOR ALL` policies.
- Policies must enforce user ownership/participant scoping (for example `auth.uid()` ownership checks).

## 3) Migration Patterns and Idempotency

- Keep schema and RLS separated:
  - `001_*` schema-only (tables, constraints, indexes, columns)
  - `002_*` RLS/policies-only
- PostgreSQL/Supabase compatibility:
  - Do not use `create policy if not exists` (unsupported)
  - Use:
    - `drop policy if exists ...`
    - `create policy ...`
- `create index if not exists` is allowed.
- Migrations must be rerunnable on an empty database.

## 4) Output Format: Show Evidence

When reporting completion, include:

1. Checklist of implemented items.
2. List of files changed with purpose.
3. Exact verification commands and expected outcomes.
4. File/line references for critical claims.
5. Migration order if SQL changes are included.
6. Breaking changes/migration notes if applicable.

Do not claim completion without evidence.

## 5) Delivery Cadence

- Work in explicit phases.
- Stop after each phase and request review/approval before continuing.
- If blocked by environment or policy mismatch, state blocker clearly and provide the smallest safe next step.
