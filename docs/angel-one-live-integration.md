# Angel One live integration — staged rollout

## Current release: secure foundation only

This release adds a read-only server readiness endpoint:

- `GET /api/broker/status`
- Reports whether required server-side configuration flags exist.
- Never returns API keys, client codes, tokens, PINs, TOTP values, or the configured IP.
- Does not create a SmartAPI session and cannot place, modify, or cancel an order.
- Live manual execution and copy trading are hard-disabled in source code.

## Initial account model

The first account is a single Angel One master account. A single account can support manual trading once the broker connection is implemented and verified. Copy trading cannot actually distribute orders with only one account; it needs at least one separately authorized follower account and the account holder's explicit consent.

## Hosting and secrets

Configure secrets only in the production host's private environment-variable settings. Never commit real values to GitHub and never use `NEXT_PUBLIC_` variables for broker credentials.

Required readiness values:

- `ANGELONE_API_KEY`
- `ANGELONE_CLIENT_CODE`
- `ANGELONE_STATIC_IP`
- `ANGELONE_STATIC_IP_REGISTERED=true` only after Angel One confirms the exact egress IP is registered
- `ANGELONE_ACCOUNT_AUTHORIZED=true` only after account ownership and API permissions are verified

Do not add the account PIN or TOTP seed to this repository or ask the user to paste them into chat. The authentication flow must collect time-based authentication securely and must not persist a TOTP code. Broker session tokens must be stored encrypted server-side with expiry and logout handling; this repository does not yet have a database/session vault.

## Static outbound IP

Angel One's current SmartAPI requirements state that API order requests must originate from the account's registered static IP. Confirm the hosting plan provides a fixed outbound IP, register that exact IP in the SmartAPI portal, and verify it from the deployed service before any order endpoint is implemented. A normal dynamic outbound address is not sufficient.

## Required next implementation gates

1. Confirm the production host's static outbound IP and register it with Angel One.
2. Confirm the account's SmartAPI app/API key and permitted segments.
3. Implement broker login/session lifecycle on the server, with encrypted token storage, expiry, logout, CSRF protection and rate limits.
4. Add read-only profile, funds, positions, holdings, order book and trade book endpoints.
5. Reconcile live order status using Angel One postback/order updates; never treat a successful place-order response as a fill.
6. Add manual order preview, risk checks, explicit confirmation, idempotency, rate limiting, audit trail and kill switch.
7. Test in a broker-approved safe environment and complete broker/exchange compliance checks before enabling live manual execution.
8. Implement copy trading only after manual trading is stable, with separately authorized follower accounts, per-account limits and independent kill switches.

## Compliance note

API and automated/copy trading may be subject to Angel One's terms and SEBI/exchange retail-algo requirements. Confirm the applicable category, static-IP rules, hosting requirements, algo registration/approval and account permissions with Angel One before launching automation.

## Safety invariant

Do not change `ANGELONE_LIVE_EXECUTION_ENABLED` or `ANGELONE_COPY_TRADING_ENABLED` to true until the reviewed implementation gates above are complete. The current release deliberately contains no order-placement route.
