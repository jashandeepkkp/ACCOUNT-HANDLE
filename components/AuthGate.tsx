"use client";

import { FormEvent, ReactNode, useEffect, useState } from "react";

type AuthStatus = "checking" | "signed-out" | "signed-in";

export default function AuthGate({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>("checking");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [activeUser, setActiveUser] = useState("");

  useEffect(() => {
    let active = true;
    fetch("/api/auth/session", { cache: "no-store", credentials: "same-origin" })
      .then(async response => response.ok ? response.json() : null)
      .then(data => {
        if (!active) return;
        if (data?.authenticated) { setActiveUser(data.username || "Admin"); setStatus("signed-in"); }
        else setStatus("signed-out");
      })
      .catch(() => { if (active) setStatus("signed-out"); });
    return () => { active = false; };
  }, []);

  async function login(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true); setMessage("");
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST", credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Login failed.");
      setPassword("");
      setActiveUser(data.username || username);
      setStatus("signed-in");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not sign in.");
    } finally { setBusy(false); }
  }

  async function logout() {
    setBusy(true);
    await fetch("/api/auth/logout", { method: "POST", credentials: "same-origin" });
    setStatus("signed-out");
    setPassword("");
    setMessage("");
    setBusy(false);
  }

  if (status === "checking") return <main className="login-screen"><div className="login-card"><div className="login-brand">EAGLE <span>TRADES</span></div><p>Checking secure session…</p></div></main>;

  if (status === "signed-out") return (
    <main className="login-screen">
      <section className="login-card">
        <div className="login-emblem">E</div>
        <div className="login-brand">EAGLE <span>TRADES</span></div>
        <p className="login-subtitle">SECURE TRADING TERMINAL</p>
        <form className="login-form" onSubmit={login}>
          <label>USERNAME<input value={username} onChange={event => setUsername(event.target.value)} autoComplete="username" placeholder="Enter username" required/></label>
          <label>PASSWORD<input type="password" value={password} onChange={event => setPassword(event.target.value)} autoComplete="current-password" placeholder="Enter password" required/></label>
          <button type="submit" disabled={busy}>{busy ? "SIGNING IN…" : "LOGIN"}</button>
        </form>
        {message && <p className="login-error" role="alert">{message}</p>}
        <p className="login-foot">AUTHORIZED ACCESS ONLY</p>
      </section>
    </main>
  );

  return <><div className="session-bar"><span>SECURE SESSION · {activeUser}</span><button onClick={() => void logout()} disabled={busy}>{busy ? "PLEASE WAIT…" : "LOG OUT"}</button></div>{children}</>;
}
