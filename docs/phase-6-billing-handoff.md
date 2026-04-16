# Phase 6 Billing Handoff

## Current State
- The client already distinguishes `free` and `plus` users.
- Supabase `entitlements` is the client-visible source of truth for plan state.
- The app now gates both cloud sync and session builder on an active Plus entitlement.
- Paddle billing is implemented in this repo through web-based checkout and customer-portal flows.
- Session builder lock states, account upgrade CTAs, and post-checkout entitlement refresh are wired in the shared app.
- Phase 7 now has a private test-only Plus override path for validation, but live Paddle validation remains deferred and no admin dashboard exists yet.

## Phase 6 Decision Lock
- Billing provider: Paddle.
- Upgrade and manage flows: web-based for v1.
- Native App Store / Play billing: deferred.
- Subscription lifecycle in the client: minimal active/inactive only.
- Missing entitlement rows continue to resolve to free behavior.

## Implemented Shape
### Backend
- Repo-hosted endpoints now exist at:
  - `POST /api/paddle/checkout`
  - `POST /api/paddle/portal`
  - `POST /api/paddle/webhook`
- The backend:
  - verifies the signed-in Supabase user before starting a billing session
  - creates a Paddle checkout transaction for the Plus subscription
  - creates a Paddle customer-portal session for existing subscribers
  - receives Paddle webhook events
  - projects active/inactive subscription state into Supabase `entitlements`
- Paddle is the billing source of truth.
- Supabase remains the read model that the app loads at bootstrap.

### Client
- The account surface shows:
  - `Upgrade to Plus` for signed-in free users
  - `Manage subscription` for signed-in Plus users
- The session builder surface shows a calm Plus lock state with an upgrade CTA.
- Guests stay on the local timer path and are prompted to sign in before upgrading.
- The app refreshes entitlement state after `?billing=success` return flows.

### Feature Gating
- Cloud sync stays Plus-only.
- Session builder stays Plus-only.
- Locked states should stay calm and explanatory, with a web purchase/manage link instead of a native store purchase flow.

## Supabase Contract
- Continue using `profiles` for identity metadata.
- Continue using `entitlements` for plan state.
- `public.billing_accounts` now stores Paddle linkage and reconciliation metadata:
  - `paddle_customer_id`
  - `paddle_subscription_id`
  - `paddle_price_id`
  - `subscription_status`
  - `current_period_end`
  - `last_event_id`
  - `last_event_occurred_at`
- Keep client-visible plan values limited to:
  - `free`
  - `plus`

## Environment / Config
- The repo now expects:
  - `APP_URL`
  - `PADDLE_API_KEY`
  - `PADDLE_NOTIFICATION_SECRET_KEY`
  - `PADDLE_PLUS_PRICE_ID`
  - `SUPABASE_SERVICE_ROLE_KEY`
- The frontend checkout handoff expects:
  - `VITE_PADDLE_CLIENT_TOKEN`
  - `VITE_PADDLE_ENV`
- Server-side `SUPABASE_URL` and `SUPABASE_ANON_KEY` can be provided directly, or the backend can fall back to `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.
- The backend appends `?billing=success`, `?billing=cancel`, or `?billing=portal` to `APP_URL` automatically.

## Test Expectations
- Missing entitlement rows still resolve to free.
- Active Paddle-backed Plus entitlement resolves to `signed-in-plus`.
- Inactive/canceled entitlement resolves to free behavior.
- Checkout and portal actions require an authenticated user.
- Webhook handling is idempotent.
- A successful billing update is reflected after the next entitlement refresh/bootstrap cycle.

## Remaining Validation
- Run the new Paddle endpoints against live Paddle sandbox and a real Supabase project.
- Verify checkout success, cancellation, portal access, and webhook delivery with production-like env vars.
- Validate the same web-based upgrade flow inside Android and iOS shells once device/emulator runtime validation resumes.
- Use the private Plus override path for test-only Plus validation until live Paddle is ready.

## Operator Runbook
- This remaining work is mostly operator/deployment setup, not a missing product-code slice.
- Default owner: the developer with access to Paddle, Supabase, and the deployment target.
- Suggested sequence:
  - create the Paddle Plus product and recurring price in sandbox
  - copy the resulting `price_id` into `PADDLE_PLUS_PRICE_ID`
  - apply the billing migration to the target Supabase project
  - set all required env vars for the deployed or local backend:
    - `APP_URL`
    - `PADDLE_API_KEY`
    - `PADDLE_NOTIFICATION_SECRET_KEY`
    - `PADDLE_PLUS_PRICE_ID`
    - `SUPABASE_SERVICE_ROLE_KEY`
  - set all required frontend vars for the checkout handoff:
    - `VITE_PADDLE_CLIENT_TOKEN`
    - `VITE_PADDLE_ENV`
  - ensure `SUPABASE_URL` and `SUPABASE_ANON_KEY` are available on the server, either directly or through the `VITE_*` fallback vars
  - deploy the API surface or run it locally in a way that Paddle can reach the webhook endpoint
  - register the webhook and subscribe to:
    - `subscription.created`
    - `subscription.updated`
    - `subscription.activated`
    - `subscription.trialing`
    - `subscription.canceled`
    - `subscription.paused`
    - `subscription.resumed`
    - `subscription.past_due`

## Live Acceptance Checklist
- Checkout:
  - user is signed in through Supabase before starting checkout
  - `POST /api/paddle/checkout` returns an app billing URL with `_ptxn`
  - Paddle checkout opens and completes in sandbox
- Success return:
  - app returns to `APP_URL?billing=success`
  - the app refreshes entitlement state
  - account resolves to `signed-in-plus`
  - cloud sync and session builder both unlock
- Portal:
  - `POST /api/paddle/portal` returns a Paddle customer-portal URL for an existing Paddle customer
  - customer-portal access does not break account state
- Data projection:
  - `public.billing_accounts` contains the Paddle linkage and latest event id
  - `public.entitlements` resolves to active Plus when the subscription is active
  - repeated webhook deliveries do not duplicate or corrupt the projection
- Deactivation:
  - canceling or deactivating the subscription in Paddle projects back to free behavior
  - account resolves to `signed-in-free`
  - cloud sync and session builder relock

## Do Not Re-Decide Later
- Keep the client lifecycle minimal: active Plus or not.
- Do not introduce trial/grace-period client states during this validation pass.
- Do not switch to native store billing during this validation pass.
- Do not broaden Plus scope beyond cloud sync and session builder during this validation pass.

## Out Of Scope For Phase 6
- Native App Store billing.
- Play Store billing.
- Trials, grace periods, or billing-issue UX in the client.
- Multi-plan subscriptions.
- Promotional billing or advanced proration flows.

## Handoff Note
- This phase should end with a Paddle-backed billing path that is usable on web and webview shells, while keeping the core timer local-first and leaving native-store monetization for later phases.
- This handoff does not include a general admin dashboard; test-only Plus overrides stay private and service-role driven.
