# Security Notes (Threat Model Lite)

## Security Goals (MVP)
- Protect account credentials.
- Encrypt persisted application data at rest.
- Enforce authorization for protected routes.

## Current Controls
- Auth: signed HTTP-only cookie session with server-side authorization checks.
- Passwords: `scrypt` hashing with per-user random salt.
- Primary storage: Supabase Postgres (server-side service role access only).
- Raw-answer strategy: default is derived-score-only persistence. If raw answers are retained, they must be encrypted in `raw_answers_encrypted`.
- Fallback storage for test/offline mode: encrypted file store (`.tmp/secure-db.enc`) using AES-256-GCM.
- Access control: onboarding/matches/decision-track APIs require authenticated session.

## Secrets
- `APP_SESSION_SECRET` for session signing.
- `APP_ENCRYPTION_KEY` for data encryption key material.
- Secrets are expected in `.env.local`; do not commit.

## Known Limitations (MVP)
- Service-role key is powerful and must stay server-only.
- No key-rotation automation yet.
- No multi-factor auth yet.
- No external KMS/HSM integration yet.

## Next Security Milestones
1. Move to managed encrypted DB with strict row-level access.
2. Add key rotation workflow and secret manager integration.
3. Add audit logging for auth and sensitive operations.
