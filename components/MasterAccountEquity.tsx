"use client";

import { useCallback, useEffect, useState } from "react";

type Snapshot = { balance: number | null; equity: number | null; updatedAt: string; error: string };

const amount = (value: unknown): number | null => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) return Number(value);
  return null;
};

function findNumber(source: unknown, keys: string[]): number | null {
  if (!source || typeof source !== "object") return null;
  const object = source as Record<string, unknown>;
  for (const key of keys) {
    const value = amount(object[key]);
    if (value !== null) return value;
  }
  return null;
}

function unwrap(value: unknown): unknown[] {
  if (!value || typeof value !== "object") return [];
  const root = value as Record<string, unknown>;
  const data = root.data;
  if (Array.isArray(data)) return data;
  if (data && typeof data === "object") return [data];
  return [root];
}

const format = (value: number | null) => value === null
  ? "—"
  : "₹" + new Intl.NumberFormat("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);

export default function MasterAccountEquity() {
  const [snapshot, setSnapshot] = useState<Snapshot>({ balance: null, equity: null, updatedAt: "", error: "" });
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const response = await fetch("/api/broker/account?resource=funds", {
        cache: "no-store",
        credentials: "same-origin",
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not load Master account funds.");
      const records = unwrap(result.data);
      const rms = records[0];
      const balance = findNumber(rms, [
        "availablecash", "availableCash", "available_cash", "availablelimit", "availableLimit",
        "net", "available_balance", "availableBalance",
      ]);
      const equity = findNumber(rms, [
        "net", "networth", "netWorth", "equity", "total_equity", "totalEquity",
      ]);
      setSnapshot({ balance, equity, updatedAt: new Date().toLocaleTimeString("en-IN"), error: "" });
    } catch (error) {
      setSnapshot(current => ({
        ...current,
        error: error instanceof Error ? error.message : "Master account funds unavailable.",
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
    <section className="master-equity-panel" aria-label="Master account balance and equity">
      <div className="master-equity-heading">
        <div><span className="eyebrow">ANGEL ONE MASTER</span><b>ACCOUNT FUNDS</b></div>
        <button type="button" onClick={() => void refresh()} disabled={loading} aria-label="Refresh Master account funds">↻</button>
      </div>
      <div className="master-equity-metrics">
        <div><small>AVAILABLE BALANCE</small><strong>{loading && snapshot.balance === null ? "Loading…" : format(snapshot.balance)}</strong></div>
        <div><small>NET EQUITY</small><strong>{loading && snapshot.equity === null ? "Loading…" : format(snapshot.equity)}</strong></div>
      </div>
      {snapshot.error && <p className="master-equity-error" role="status">{snapshot.error} Check that the Master account is connected.</p>}
      <p className="master-equity-updated">{snapshot.updatedAt ? "Updated " + snapshot.updatedAt : "Values are fetched from Angel One RMS; unavailable fields are shown as —."} · Auto-refresh 30 sec</p>
    </section>
  );
}
