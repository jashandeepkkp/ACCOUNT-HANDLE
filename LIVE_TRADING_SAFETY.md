# EAGLE TRADES live order safety foundation

This draft adds a server-side Angel One Master LIMIT-order path, persistent idempotency records, quantity/notional/daily-count/daily-loss checks, order-book reconciliation, and a fail-closed emergency stop.

## Live execution stays disabled
Keep ANGELONE_LIVE_TRADING_ENABLED=false. The database kill-switch initializes active. No live order is sent by deployment unless all explicit gates are enabled and the emergency stop is manually cleared in a separately reviewed procedure.

## Render configuration
Add ANGELONE_LIVE_TRADING_ENABLED=false, LIVE_MAX_ORDER_QTY=0, LIVE_MAX_ORDER_NOTIONAL=0, LIVE_MAX_ORDERS_PER_DAY=0, and LIVE_MAX_DAILY_LOSS=0. Limits must be positive before endpoint config validation passes.

## Supported scope and gaps
Only Master-account NSE/BSE LIMIT orders are accepted. Market orders, derivatives, follower fan-out, dashboard ticket integration, and verified instrument-token lookup are not included. POST /api/broker/orders requires confirmLiveOrder: true and a unique idempotency key. Uncertain broker submissions are never automatically retried. GET /api/broker/orders reconciles local records against Angel One's order book. POST /api/broker/emergency-stop activates a persistent stop; this endpoint cannot deactivate it.

The stop blocks new submissions only; it does not cancel already accepted/open broker orders. Daily loss uses current position P&L and requires validation against actual SmartAPI payload semantics. Do not enable live execution until CI/build, paper tests, broker permissions, registered static IP, instrument master validation, UI integration, and independent review are complete.
