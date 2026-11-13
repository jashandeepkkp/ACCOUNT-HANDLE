# EAGLE TRADES — gated live Master and follower execution

## What this branch implements

- Trade ticket can select PAPER or LIVE. LIVE submits only a confirmed Angel One Master LIMIT order through `POST /api/broker/orders`; it never creates a fake fill.
- Master order placement remains protected by app login, same-origin validation, Master session, instrument-master token/tick validation, idempotency, global emergency stop, configured quantity/notional/order-count/daily-loss limits and Angel One static-IP/session configuration.
- Master login and each follower login must explicitly record copy authorization.
- `POST /api/broker/copy/sync` polls the authenticated Master order book and sends newly observed supported NSE/BSE cash-equity MARKET or LIMIT orders to eligible followers using `COPY_FIXED_QUANTITY`.
- First successful sync records a baseline and deliberately does not copy existing Master orders.
- Per-follower idempotency and broker order IDs are persisted. Uncertain submissions are not automatically retried.
- Emergency stop blocks further Master and copy submissions. It requests cancellation of tracked EAGLE TRADES broker orders.

## Render environment variables

Keep live execution disabled until broker approval and test evidence are complete:

```env
ANGELONE_LIVE_TRADING_ENABLED=false
ANGELONE_LIVE_COPY_ENABLED=false
ANGELONE_ACCOUNT_AUTHORIZED=false
ANGELONE_STATIC_IP_REGISTERED=false
ANGELONE_STATIC_IP=
ANGELONE_SESSION_ENCRYPTION_KEY=
LIVE_MAX_ORDER_QTY=0
LIVE_MAX_ORDER_NOTIONAL=0
LIVE_MAX_ORDERS_PER_DAY=0
LIVE_MAX_DAILY_LOSS=0
COPY_FIXED_QUANTITY=0
CRON_SECRET=
```

Do not copy secrets into GitHub or chat. Set them only in Render's encrypted environment settings. The encryption key must be 64 hex characters. Angel One API key, client local IP and MAC address must also be configured as required by the existing SmartAPI adapter.

## Continuous copy monitoring

The endpoint is a poller, not a permanent websocket. For continuous monitoring, create a Render Cron Job that runs every minute after this branch is deployed:

```sh
curl -fsS -X POST "$EAGLE_TRADES_URL/api/broker/copy/sync" \
  -H "Authorization: Bearer $CRON_SECRET" \
  -H "Content-Type: application/json" \
  --data '{"confirmCopySync":true}'
```

Set `EAGLE_TRADES_URL` to the deployed service URL and `CRON_SECRET` to the same long random secret configured on the web service. Never put the secret in the command text or source repository. First run is baseline-only; subsequent runs process newly seen Master order IDs. Polling means copies are delayed by the cron interval and broker/API latency; this is not exchange co-location or guaranteed tick-by-tick copying.

## Important limitations / release gates

1. This implementation covers NSE/BSE cash equities only. It does not copy F&O, MCX, GTT, bracket, cover, AMO or modify/cancel events as follower actions.
2. Copy uses a configured fixed quantity per follower, not proportional sizing.
3. Only new Master order IDs observed after the baseline are considered. Existing orders are never replayed.
4. Master partial fills are not streamed as incremental follower quantity changes. A newly observed Master order is copied as a new follower order; the source order's later modifications are not mirrored.
5. Follower submissions are independently recorded. A follower failure does not roll back already accepted orders at other brokers/accounts. Review each outcome and reconcile the follower order book.
6. Broker acknowledgement is not a fill. Check each follower's Angel One order book and trade book for final state.
7. The copy endpoint requires an actual broker-approved Angel One environment, valid sessions, static IP registration, explicit account consents, positive risk limits and emergency stop released. These facts cannot be certified by CI.
8. Do not enable the live flags until the paper tests, controlled broker test account, redacted real payload checks, static IP and operational cancellation/recovery procedure have been independently verified.

**Default behavior remains fail-closed. This PR does not authorize or place a live order during development or CI.**


## Render Cron Job (included with this branch)

Deploy `render-copy-cron.yaml` as a separate Render Blueprint/Cron service, or create a Cron Job with the same settings:

- **Schedule:** every minute (`*/1 * * * *`)
- **Build command:** `npm ci`
- **Start command:** `node scripts/copy-sync-cron.mjs`
- **Environment:** `EAGLE_TRADES_URL` = HTTPS URL of the existing EAGLE TRADES web service; `CRON_SECRET` = the same random secret on both the cron service and web service (at least 24 characters).

The runner sends one authenticated copy-sync request and exits. It never prints the secret or full broker response. Failed HTTP calls produce a non-zero job exit. Render cron monitoring is required because the dashboard button performs only a one-time sync.

**This adds the scheduler only. It does not turn on live orders or certify broker behavior.** Keep `ANGELONE_LIVE_TRADING_ENABLED=false` and `ANGELONE_LIVE_COPY_ENABLED=false` until controlled broker tests and the live-safety checks are complete.
