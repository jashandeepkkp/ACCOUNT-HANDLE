"use client";

import { useEffect, useState } from "react";

type BrokerStatus = { connected?: boolean; broker?: string; account?: string; profile?: Record<string, unknown>; error?: string };

export default function AngelOneMasterLogin() {
  const [connected, setConnected] = useState(false);
  const [checking, setChecking] = useState(true);
  const [showLogin, setShowLogin] = useState(false);
  const [pin, setPin] = useState("");
  const [totp, setTotp] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [profile, setProfile] = useState<Record<string, unknown> | null>(null);
  const [accountData, setAccountData] = useState<Record<string, unknown> | null>(null);
  const [resource, setResource] = useState("funds");

  async function refreshSession() {
    setChecking(true);
    try {
      const response = await fetch("/api/broker/session", { cache: "no-store", credentials: "same-origin" });
      const data = await response.json() as BrokerStatus;
      setConnected(Boolean(response.ok && data.connected));
      setProfile(data.profile ?? null);
    } catch {
      setConnected(false);
    } finally {
      setChecking(false);
    }
  }

  useEffect(() => { void refreshSession(); }, []);

  async function login(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/broker/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ pin, totp }),
      });
      const data = await response.json() as BrokerStatus;
      if (!response.ok) throw new Error(data.error || "Angel One login failed.");
      setPin("");
      setTotp("");
      setShowLogin(false);
      setMessage("Angel One Master account connected. Live order execution is still locked.");
      await refreshSession();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to connect Angel One.");
    } finally {
      setBusy(false);
    }
  }

  async function logout() {
    setBusy(true);
    try {
      await fetch("/api/broker/session", { method: "DELETE", credentials: "same-origin" });
      setConnected(false);
      setProfile(null);
      setAccountData(null);
      setMessage("Angel One Master account logged out.");
    } finally {
      setBusy(false);
    }
  }

  async function loadAccountData() {
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch(`/api/broker/account?resource=${resource}`, { cache: "no-store", credentials: "same-origin" });
      const data = await response.json() as { data?: unknown; error?: string };
      if (!response.ok) throw new Error(data.error || "Unable to fetch broker account data.");
      setAccountData({ [resource]: data.data });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Account data unavailable.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card" style={{ padding: 18, marginBottom: 16 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div>
          <div className="eyebrow">BROKER AUTHENTICATION / MASTER ACCOUNT</div>
          <h2 style={{ margin: "5px 0" }}>Angel One · Master</h2>
          <p style={{ margin: 0, color: "var(--muted, #8b95a5)", fontSize: 13 }}>Connect your own Angel One account securely for manual-trading account data.</p>
        </div>
        <span className={connected ? "connection-badge online" : "connection-badge offline"}>{checking ? "CHECKING…" : connected ? "BROKER CONNECTED" : "NOT CONNECTED"}</span>
      </div>

      {!connected && !showLogin && (
        <button className="action-btn" style={{ marginTop: 14 }} onClick={() => setShowLogin(true)} disabled={checking}>Login to Master Account</button>
      )}

      {showLogin && !connected && (
        <form onSubmit={login} style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10, marginTop: 14 }}>
          <label className="trade-field">Angel One PIN
            <input type="password" inputMode="numeric" autoComplete="off" maxLength={6} value={pin} onChange={e => setPin(e.target.value.replace(/\D/g, ""))} required placeholder="Enter broker PIN" />
          </label>
          <label className="trade-field">Current TOTP
            <input type="password" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={totp} onChange={e => setTotp(e.target.value.replace(/\D/g, ""))} required placeholder="6-digit authenticator code" />
          </label>
          <div style={{ display: "flex", gap: 8, alignItems: "end", flexWrap: "wrap" }}>
            <button className="place-buy" type="submit" disabled={busy || pin.length < 4 || totp.length !== 6}>{busy ? "CONNECTING…" : "CONNECT MASTER"}</button>
            <button className="action-btn" type="button" onClick={() => { setShowLogin(false); setPin(""); setTotp(""); }}>Cancel</button>
          </div>
          <p style={{ gridColumn: "1 / -1", margin: 0, fontSize: 12, color: "var(--muted, #8b95a5)" }}>PIN and TOTP are sent only to this app's server-side login endpoint and are not saved in browser storage or GitHub. Never share them with anyone.</p>
        </form>
      )}

      {connected && (
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", marginTop: 14 }}>
          <span style={{ fontSize: 13 }}>Authenticated Angel One session</span>
          <button className="action-btn" onClick={() => void refreshSession()} disabled={busy}>Refresh session</button>
          <button className="action-btn" onClick={() => void logout()} disabled={busy}>Logout</button>
        </div>
      )}

      {connected && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12, alignItems: "center" }}>
          <select aria-label="Broker account data" value={resource} onChange={e => setResource(e.target.value)} className="trade-field">
            <option value="funds">Funds / balance</option><option value="positions">Positions</option><option value="holdings">Holdings</option><option value="orders">Order book</option><option value="trades">Trade book</option>
          </select>
          <button className="action-btn" onClick={() => void loadAccountData()} disabled={busy}>Load live account data</button>
        </div>
      )}

      {profile && <p style={{ margin: "12px 0 0", fontSize: 12 }}>Broker profile received. Account: {String(profile.clientcode ?? profile.clientCode ?? "Verified")}</p>}
      {accountData && <pre style={{ maxHeight: 240, overflow: "auto", padding: 12, borderRadius: 8, background: "var(--panel, #101722)", color: "var(--text, #dce5ef)", fontSize: 11, whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{JSON.stringify(accountData, null, 2)}</pre>}
      {message && <p role="status" style={{ margin: "12px 0 0", fontSize: 13 }}>{message}</p>}
      <div className="trade-warning" style={{ marginTop: 12 }}>Broker login enables authenticated account access only. Real order placement remains disabled until static-IP registration, broker permissions, risk controls and execution safeguards are verified.</div>
    </section>
  );
}
