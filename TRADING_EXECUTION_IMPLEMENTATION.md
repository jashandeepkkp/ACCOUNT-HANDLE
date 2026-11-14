# EAGLE TRADES — trading safety completion

## Current behavior in this branch

### Trade ticket and instrument validation
- The Trade ticket searches the official Angel One instrument master and requires the user to select an exact returned NSE/BSE cash-equity symbol/token pair.
- The server re-checks the symbol/token against the instrument master before accepting a paper or live order.
- Market paper orders use the authenticated Master account's Angel One LTP endpoint as a reference price. Limit orders require a valid price and the instrument tick size.
- The paper endpoint persists idempotent paper-order records in Neon and clearly returns `paper: true`, `live: false`. It never calls placeOrder.

### Paper tests
- Run `npm test` to execute the Node built-in tests for instrument filtering, symbol/token matching, product mapping, risk boundaries, follower consent/session eligibility, order states, broker response normalization, and stable copy tags.
- GitHub Actions runs `npm test` and `npm run build` for pull requests.
- These tests are deterministic unit tests. They do not authenticate against a real Angel One account or place a broker order.

### Live Master order gate
- `POST /api/broker/orders` accepts only an explicit confirmed NSE/BSE cash-equity LIMIT order.
- It revalidates the instrument token and tick size, requires app login, same-origin request, a connected Master session, broker authorization and registered static IP, AES session key, positive risk limits, a unique idempotency key, and a released emergency stop.
- A database intent is reserved before the broker call. Unknown outcomes are marked `SUBMISSION_UNCERTAIN`; no automatic retry occurs.
- Angel One acknowledgement is not represented as a fill. The order book must be reconciled.

### Emergency stop
- `POST /api/broker/emergency-stop` first activates the persistent global stop, then requests cancellation of tracked EAGLE TRADES orders with broker order IDs across connected broker accounts.
- A cancel response is only a request acknowledgement; it is not proof of cancellation. Reconciliation must confirm a terminal broker status.
- `POST /api/broker/emergency-stop/recover` requires explicit confirmation, all live config gates, valid sessions for tracked orders, and a broker order-book check. The stop remains active if any tracked order is open, uncertain, missing, or unreconciled.
- The stop only cancels orders recorded in the EAGLE TRADES ledger. It deliberately does not cancel unrelated manual orders placed outside this app.

### Follower-copy preflight
- `POST /api/broker/copy/preview` verifies that the source order exists in the authenticated Master order book, validates the source instrument, and checks each follower's explicit copy consent, session expiry, fixed quantity, daily order count, daily realized P&L and risk limits.
- Configure `COPY_FIXED_QUANTITY` in Render to a positive integer to use the preview.
- This endpoint is preflight only. It does not send follower orders. A production follower dispatcher still requires its own idempotent per-account order ledger, partial-success recovery, broker response reconciliation and independent review.

## Default-disabled Render values

Keep these values until the release is independently approved:

```env
ANGELONE_LIVE_TRADING_ENABLED=false
ANGELONE_LIVE_COPY_ENABLED=false
LIVE_MAX_ORDER_QTY=0
LIVE_MAX_ORDER_NOTIONAL=0
LIVE_MAX_ORDERS_PER_DAY=0
LIVE_MAX_DAILY_LOSS=0
COPY_FIXED_QUANTITY=0
```

Do not turn these on just to clear a dashboard warning. The application cannot confirm account-specific broker permissions, the hosting provider's actual static outbound IP, or actual SmartAPI field semantics from configuration alone. Validate them with Angel One and a controlled paper environment first.

## Remaining release blockers

1. Run the GitHub Actions build and unit tests successfully.
2. Verify actual Angel One RMS and position P&L payloads with redacted test responses; risk checks fail closed when the required realized P&L field is missing.
3. Verify market-data endpoint availability and returned quote structure on the actual Render deployment.
4. Complete a broker-approved paper/test environment exercise covering place, reject, partial fill, cancel, timeout and reconciliation.
5. The follower-order dispatcher is implemented behind the separate live-copy flag, but still requires controlled Angel One test-account validation, including partial fills, broker rejects, timeouts and follower reconciliation. A Render Cron Job must be created to poll it every minute.
6. Add account-specific risk limits and concurrency-safe daily order reservation before enabling production live orders.
7. Complete a security and compliance review and confirm the registered static IP.

**No live order or follower copy order is enabled by this branch's default configuration.**
