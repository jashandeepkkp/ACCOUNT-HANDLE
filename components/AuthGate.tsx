"use client";

import { useEffect, useState } from "react";
import type { FormEvent, ReactNode } from "react";

type AuthStatus = "checking" | "signed-out" | "signed-in";

function AdminLoginBackground() {
  return <>
    <video className="admin-login-background-video" autoPlay muted loop playsInline preload="metadata" aria-hidden="true" tabIndex={-1}>
      <source src="https://media.istockphoto.com/id/2240790890/video/moving-financial-chart-investing-chart-investment-in-crypto-data-lines-indicating-a-point-of.mp4?s=mp4-640x640-is&k=20&c=pDK06y_5Ex2RauI4ZT_4CygO2XzjkRE0mFkBU6hGv_c=" type="video/mp4" />
    </video>
    <div className="admin-login-video-overlay" aria-hidden="true" />
  </>;
}

export default function AuthGate({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>("checking");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [activeUser, setActiveUser] = useState("");
  const [isFollowerPage, setIsFollowerPage] = useState(false);

  useEffect(() => {
    if (window.location.pathname === "/follower-connect") { setIsFollowerPage(true); return; }
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

  if (isFollowerPage) return <>{children}</>;

  if (status === "checking") return <main className="login-screen"><AdminLoginBackground /><div className="login-card"><div className="login-brand">EAGLE <span>TRADES</span></div><p>Checking secure session…</p></div></main>;

  if (status === "signed-out") return (
    <main className="login-screen">
      <AdminLoginBackground />
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
