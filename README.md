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
