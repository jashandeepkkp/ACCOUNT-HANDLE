"use client";

import { useCallback, useEffect, useState } from "react";

type Snapshot = {
  balance: number | null;
  equity: number | null;
  runningPnl: number | null;
  updatedAt: string;
  error: string;
};

function numeric(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value))) return Number(value);
  return null;
}

function records(value: unknown): Record<string, unknown>[] {
  if (!value || typeof value !== "object") return [];
  const root = value as Record<string, unknown>;
  const data = root.data;
  if (Array.isArray(data)) return data.filter((row): row is Record<string, unknown> => !!row && typeof row === "object");
  if (data && typeof data === "object") return [data as Record<string, unknown>];
  return [root];
}

function firstNumber(source: Record<string, unknown>, keys: string[]): number | null {
  for (const key of keys) {
    const value = numeric(source[key]);
    if (value !== null) return value;
  }
  return null;
}

function readRunningPnl(rows: Record<string, unknown>[]): number | null {
  if (rows.length === 0) return 0;
  let total = 0;
  let found = false;
  for (const row of rows) {
    const direct = firstNumber(row, ["netpnl", "netPnl", "pnl", "totalpnl", "totalPnl"]);
    if (direct !== null) {
      total += direct;
      found = true;
      continue;
    }
    const realised = firstNumber(row, ["realised", "realized", "realisedpnl", "realizedPnl"]);
    const unrealised = firstNumber(row, ["unrealised", "unrealized", "unrealisedpnl", "unrealizedPnl"]);
    if (realised !== null || unrealised !== null) {
      total += (realised ?? 0) + (unrealised ?? 0);
      found = true;
    }
  }
  return found ? total : null;
}

const money = (value: number | null) => value === null
  ? "—"
  : "₹" + new Intl.NumberFormat("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);

export default function MasterAccountFunds() {
  const [snapshot, setSnapshot] = useState<Snapshot>({
    balance: null, equity: null, runningPnl: null, updatedAt: "", error: "",
  });
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const [fundsResponse, positionsResponse] = await Promise.all([
        fetch("/api/broker/account?resource=funds", { cache: "no-store", credentials: "same-origin" }),
        fetch("/api/broker/account?resource=positions", { cache: "no-store", credentials: "same-origin" }),
      ]);
      const [fundsResult, positionsResult] = await Promise.all([fundsResponse.json(), positionsResponse.json()]);
      if (!fundsResponse.ok) throw new Error(fundsResult.error || "Could not load Master account funds.");
      if (!positionsResponse.ok) throw new Error(positionsResult.error || "Could not load Master running P&L.");
      const rms = records(fundsResult.data)[0] ?? {};
      const positionRows = records(positionsResult.data);
      const balance = firstNumber(rms, [
        "availablecash", "availableCash", "available_cash", "availablelimit", "availableLimit",
        "available_balance", "availableBalance",
      ]);
      const equity = firstNumber(rms, [
        "net", "networth", "netWorth", "equity", "total_equity", "totalEquity",
      ]);
      setSnapshot({
        balance,
        equity,
        runningPnl: readRunningPnl(positionRows),
        updatedAt: new Date().toLocaleTimeString("en-IN"),
        error: "",
      });
    } catch (error) {
      setSnapshot(current => ({
        ...current,
        error: error instanceof Error ? error.message : "Master account data unavailable.",
      }));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => void refresh(), 30_000);
    return () => window.clearInterval(timer);
  }, [refresh]);

  return (
    <section className="master-funds-panel" aria-label="Angel One Master balance, equity and running P&L">
      <div className="master-funds-heading">
        <div><span className="eyebrow">ANGEL ONE MASTER</span><b>ACCOUNT OVERVIEW</b></div>
        <button type="button" onClick={() => void refresh()} disabled={loading} aria-label="Refresh Master account overview">↻</button>
      </div>
      <div className="master-funds-metrics">
        <div><small>AVAILABLE BALANCE</small><strong>{loading && snapshot.balance === null ? "Loading…" : money(snapshot.balance)}</strong></div>
        <div><small>NET EQUITY</small><strong>{loading && snapshot.equity === null ? "Loading…" : money(snapshot.equity)}</strong></div>
        <div><small>RUNNING P&amp;L</small><strong className={snapshot.runningPnl === null ? "" : snapshot.runningPnl >= 0 ? "positive" : "negative"}>{loading && snapshot.runningPnl === null ? "Loading…" : money(snapshot.runningPnl)}</strong></div>
      </div>
      {snapshot.error && <p className="master-funds-error" role="status">{snapshot.error} Confirm that the Master account is connected.</p>}
      <p className="master-funds-updated">{snapshot.updatedAt ? "Updated " + snapshot.updatedAt : "Values are read from the authenticated Angel One account."} · Auto-refresh every 30 seconds</p>
    </section>
  );
}
