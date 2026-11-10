"use client";

import { useEffect, useState } from "react";

type BrokerStatus = {
  connected?: boolean;
  profile?: Record<string, unknown>;
  error?: string;
};

export default function AngelOneMasterLogin() {
  const [connected, setConnected] = useState(false);
  const [checking, setChecking] = useState(true);
  const [showLogin, setShowLogin] = useState(false);
  const [clientCode, setClientCode] = useState("");
  const [pin, setPin] = useState("");
  const [authorizedForCopy, setAuthorizedForCopy] = useState(false);
  const [totp, setTotp] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function refreshSession() {
    setChecking(true);
    try {
      const response = await fetch("/api/broker/session", {
        cache: "no-store",
        credentials: "same-origin",
      });
      const data = await response.json() as BrokerStatus;
      setConnected(Boolean(response.ok && data.connected));
      if (!response.ok) setShowLogin(false);
    } catch {
      setConnected(false);
    } finally {
      setChecking(false);
    }
  }

  useEffect(() => {
    void refreshSession();
  }, []);

  async function login(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/broker/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ clientCode, pin, totp, authorizedForCopy }),
      });
      const data = await response.json() as BrokerStatus;
      if (!response.ok) throw new Error(data.error || "Angel One login failed.");
      setClientCode("");
      setPin("");
      setTotp("");
      setShowLogin(false);
      await refreshSession();
      setMessage("Angel One Master account connected.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to connect Angel One.");
    } finally {
      setBusy(false);
    }
  }

  async function logout() {
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/broker/session", {
        method: "DELETE",
        credentials: "same-origin",
      });
      if (!response.ok) throw new Error("Unable to log out from Angel One.");
      setConnected(false);
      setShowLogin(false);
      setPin("");
      setTotp("");
      setMessage("Master account disconnected.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Logout failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="master-login-widget" aria-label="Angel One Master account">
      <div className="master-login-bar">
        <div className="master-login-state">
          <span className={`master-status-dot ${connected ? "is-connected" : checking ? "is-checking" : "is-disconnected"}`} />
          <div>
            <strong>MASTER ACCOUNT</strong>
            <span className={connected ? "master-status-text connected" : "master-status-text"}>
              {checking ? "CHECKING CONNECTION…" : connected ? "CONNECTED · ANGEL ONE" : "NOT CONNECTED"}
            </span>
          </div>
        </div>
        {connected ? (
          <button type="button" className="master-login-button master-logout-button" onClick={() => void logout()} disabled={busy || checking}>
            {busy ? "PLEASE WAIT…" : "LOG OUT"}
          </button>
        ) : (
          <button type="button" className="master-login-button" onClick={() => setShowLogin(value => !value)} disabled={busy || checking}>
            {showLogin ? "CANCEL LOGIN" : "LOGIN ANGEL ONE"}
          </button>
        )}
      </div>

      {showLogin && !connected && (
        <form className="master-login-form" onSubmit={login}>
          <label>
            <span>ANGEL ONE CLIENT CODE</span>
            <input value={clientCode} onChange={event => setClientCode(event.target.value.toUpperCase())} autoComplete="off" required placeholder="Enter client code" />
          </label>
          <label>
            <span>ANGEL ONE PIN</span>
            <input type="password" inputMode="numeric" autoComplete="off" maxLength={6}
              value={pin} onChange={event => setPin(event.target.value.replace(/\\D/g, ""))}
              required placeholder="Enter PIN" />
          </label>
          <label>
            <span>AUTHENTICATOR TOTP</span>
            <input type="password" inputMode="numeric" autoComplete="one-time-code" maxLength={6}
              value={totp} onChange={event => setTotp(event.target.value.replace(/\\D/g, ""))}
              required placeholder="6-digit code" />
          </label>
          <label className="broker-consent"><input type="checkbox" checked={authorizedForCopy} onChange={event => setAuthorizedForCopy(event.target.checked)} /> I own/control this Master account and authorize it to act as the source account for trade-copying, subject to broker approval.</label>
          <button className="master-login-button" type="submit" disabled={busy || !clientCode.trim() || pin.length < 4 || totp.length !== 6}>
            {busy ? "CONNECTING…" : "CONNECT MASTER"}
          </button>
          <p>PIN and TOTP are sent to the secure server login endpoint and are not stored in browser storage.</p>
        </form>
      )}

      {message && <p className="master-login-message" role="status">{message}</p>}
      <p className="master-login-note">Master authentication is separate from copy authorization. Live order execution remains disabled.</p>
    </section>
  );
}
