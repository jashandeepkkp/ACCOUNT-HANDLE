# EAGLE TRADES — Angel One trade-copy dashboard (paper mode)

This repository contains a Next.js frontend prototype for a multi-account trade-copying product. It starts with Angel One as the planned broker adapter and deliberately runs entirely in local paper/simulation mode.

## Run locally

Requires Node.js 20.9+ and npm.

```bash
npm install
npm run dev
```

Open http://localhost:3000.

## Important

This is a frontend-only paper-trading prototype. It does not authenticate with Angel One SmartAPI, send live orders, fetch live market prices, validate real funds/margin, or implement server-side risk checks, idempotency, audit trails, or reconciliation. All accounts, statuses, and fills are demo data.

Do not enable live trading until broker integration, server-side controls, security review, and applicable SEBI/exchange/broker requirements have been addressed.


## Supabase permanent cloud state

This branch adds Supabase Auth and a user-scoped `user_app_state` table for durable positions, order-event history, and follower-account metadata.

1. Create a Supabase project.
2. In Supabase SQL Editor, run `supabase/migrations/20261109000100_user_app_state.sql`.
3. In Render environment variables, set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` from the Supabase project's API settings.
4. Redeploy after merging this PR.
5. Open Summary in EAGLE TRADES, create an app account or sign in, and keep the session active for cloud sync.

Row Level Security restricts each user to their own row. The browser uses only the Supabase publishable/anon key; never put a service-role key in a `NEXT_PUBLIC_` variable.

### Persistence scope and limitations

- Positions, order-event history, and follower account labels/IDs are saved to the signed-in user's Supabase row.
- Master/follower broker sessions, PINs, TOTP codes and access tokens are not stored in this app-state table. Broker sessions still follow Angel One expiry and re-authentication rules.
- Current paper/demo data is used as the initial state for a new cloud account; existing anonymous browser data is not automatically imported from another device.
- The database migration must be applied manually in Supabase before the feature can save data. Without Supabase environment variables and a signed-in app user, cloud sync is unavailable.
- This is user-state persistence, not broker-ledger reconciliation or real order execution. Live trading remains disabled.
