# Supabase Foundation

This folder holds the initial schema and setup notes for the MyoRep Supabase foundation.

## What to do
- Set `VITE_ENABLE_SUPABASE=true` only in builds that should actually bootstrap auth.
- Create one Supabase project for dev and one for prod.
- Enable email magic links only.
- Use the environment variables listed in `docs/phase-0-supabase-foundation.md`.
- Apply the migration in `supabase/migrations/0001_phase0_foundation.sql`.
- Apply `supabase/migrations/0002_phase6_billing_foundation.sql`, then `supabase/migrations/0003_phase6_paddle_billing.sql`, before enabling Paddle-backed billing in any environment.

## Notes
- This repo intentionally stays local-first for the timer engine.
- The schema is designed to support later sync without rewriting the workout FSM.
- Phase 6 billing keeps Supabase `entitlements` as the client-visible source of truth while Paddle acts as the upstream billing system.
- Phase 7 may use a private test-only Plus override path for validation; keep it service-role-backed and do not treat it as a general admin dashboard.
- Paddle customer/subscription linkage now lives in `public.billing_accounts`, while the app still reads `public.entitlements` at bootstrap.
- Keep the migration and schema notes in sync with `docs/phase-6-billing-handoff.md` when the billing contract changes.
