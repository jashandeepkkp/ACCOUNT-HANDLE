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

The endpoint is a poller, not a permanent websocket. This branch adds `scripts/copy-sync-cron.mjs` for a Render Cron Job. Create the job only after broker/static-IP approval and controlled test-account verification. Use the same repository and `main` branch, command `node scripts/copy-sync-cron.mjs`, and schedule `* * * * *` (every minute, UTC). Set `EAGLE_TRADES_URL` to the deployed HTTPS web-service URL and set `CRON_SECRET` to the same random secret (at least 24 characters) configured on the web service. Do not put secrets in source control. The cron runner calls the authenticated sync endpoint and exits non-zero if copy sync is disabled or fails. Render cron jobs run periodically and have a single-run guarantee; this polling design is delayed by up to the schedule interval plus broker/API latency.

The endpoint can also be called manually for controlled verification. The cron runner command is:

```sh
curl -fsS -X POST "$EAGLE_TRADES_URL/api/broker/copy/sync" \
  -H "Authorization: Bearer $CRON_SECRET" \
  -H "Content-Type: application/json" \
  --data '{"confirmCopySync":true}'
```

Set `EAGLE_TRADES_URL` to the deployed service URL and `CRON_SECRET` to the same long random secret configured on the web service. Never put the secret in the command text or source repository. First run is baseline-only; subsequent runs process newly seen Master order IDs. Polling means copies are delayed by the cron interval and broker/API latency; this is not exchange co-location or guaranteed tick-by-tick copying.

## Important limitations / release gates

1. This implementation covers NSE/BSE cash equities only. It does not copy F&O, MCX, GTT, bracket, cover, AMO or modify/cancel events as follower actions.
2. Copy uses a configured fixed quantity per follower, not proportional sizing. Set `COPY_FIXED_QUANTITY` to a small test value first.
3. Delayed MARKET-order copies require `COPY_MAX_PRICE_DEVIATION_BPS` (positive integer, maximum 5000). The follower's current LTP is compared with the Master's actual `averageprice`; if the difference exceeds the configured basis-point limit, the follower order is blocked. The value `0` disables MARKET-order copying. This does not eliminate execution slippage.
4. Only new Master order IDs observed after the baseline are considered. Existing orders are never replayed.
5. Master partial fills are not streamed as incremental follower quantity changes. A newly observed Master order is copied as a new follower order; the source order's later modifications are not mirrored.
6. Follower submissions are independently recorded. A follower failure does not roll back already accepted orders at other brokers/accounts. Review each outcome and reconcile the follower order book. Failed or uncertain follower orders are not automatically resubmitted; investigate and reconcile before any manual recovery.
7. Broker acknowledgement is not a fill. Check each follower's Angel One order book and trade book for final state.
8. The copy endpoint requires an actual broker-approved Angel One environment, valid sessions, static IP registration, explicit account consents, positive risk limits and emergency stop released. These facts cannot be certified by CI.
9. Do not enable the live flags until the paper tests, controlled broker test account, redacted real payload checks, static IP and operational cancellation/recovery procedure have been independently verified.

**Default behavior remains fail-closed. This PR does not authorize or place a live order during development or CI.**
