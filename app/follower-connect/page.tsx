"use client";
import { useEffect, useState } from "react";

export default function FollowerConnectPage() {
  const [invite, setInvite] = useState("");
  const [clientCode, setClientCode] = useState("");
  const [pin, setPin] = useState("");
  const [totp, setTotp] = useState("");
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [connected, setConnected] = useState(false);
  const [masked, setMasked] = useState("");
  const [authorized, setAuthorized] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const value = params.get("invite") || "";
    setInvite(value);
    if (value) window.history.replaceState({}, "", window.location.pathname);
    fetch("/api/follower/status", { cache: "no-store", credentials: "same-origin" })
      .then(async response => { if (!response.ok) return null; return response.json(); })
      .then(data => { if (data?.connected) { setConnected(true); setMasked(data.clientCodeMasked || ""); setAuthorized(Boolean(data.authorizedForCopy)); } })
      .catch(() => undefined);
  }, []);

  async function connect(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true); setMessage("");
    try {
      const response = await fetch("/api/follower/connect", { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "same-origin", body: JSON.stringify({ invite, clientCode, pin, totp, consent }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Connection failed.");
      setConnected(true); setMasked(data.clientCodeMasked || ""); setAuthorized(false);
      setClientCode(""); setPin(""); setTotp("");
      setMessage(data.authorizationPending ? "Account connected. Copy authorization is pending broker approval; no trades will be copied." : "Angel One account connected. Live copying remains disabled until separately verified.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Unable to connect account."); }
    finally { setBusy(false); }
  }
  async function disconnect() {
    setBusy(true);
    try { const response = await fetch("/api/follower/status", { method: "DELETE", credentials: "same-origin" }); if (!response.ok) throw new Error("Logout failed."); setConnected(false); setMasked(""); setAuthorized(false); setMessage("Your follower account has been disconnected."); }
    catch (error) { setMessage(error instanceof Error ? error.message : "Logout failed."); }
    finally { setBusy(false); }
  }

  return <main className="follower-connect-page">
    <video
      className="follower-connect-background-video"
      autoPlay
      muted
      loop
      playsInline
      preload="metadata"
      aria-hidden="true"
      tabIndex={-1}
    >
      <source src="https://media.istockphoto.com/id/2255031452/video/fluctuations-in-revenue-and-expenditure-in-corporate-financial-statements-analysis-of.mp4?s=mp4-640x640-is&k=20&c=vQFriawS51IqlAcqTbckO7yYyZJZpCJ7ipw6iRx97Y8=" type="video/mp4" />
    </video>
    <div className="follower-connect-video-overlay" aria-hidden="true" />
    <section className="follower-connect-card">
      <div className="follower-connect-brand">EAGLE <span>TRADES</span></div>
      <div className="follower-connect-eyebrow">SECURE FOLLOWER ONBOARDING</div>
      <h1>Follower Connect</h1>
      <p className="follower-connect-intro">Connect your own Angel One account to the EAGLE TRADES follower network.</p>
      {connected ? <div className="follower-connected-state">
        <div className="follower-connect-status">● CONNECTED</div>
        <h2>Angel One account linked</h2>
        <p>Account: {masked}</p>
        <p>Copy permission: {authorized ? "Recorded" : "Not enabled / awaiting approval"}</p>
        <p className="follower-connect-safety">You can view only this account's connection status. Trading and copy execution are not enabled from this page.</p>
        <button type="button" onClick={() => void disconnect()} disabled={busy}>{busy ? "PLEASE WAIT…" : "DISCONNECT MY ACCOUNT"}</button>
      </div> : !invite ? <div className="follower-connect-error">Invitation link missing. Ask the EAGLE TRADES Admin for the shared follower link.</div> : <form onSubmit={connect}>
        <label>Angel One Client Code<input value={clientCode} onChange={e => setClientCode(e.target.value.toUpperCase())} autoComplete="off" required /></label>
        <label>Angel One PIN<input type="password" inputMode="numeric" autoComplete="off" maxLength={6} value={pin} onChange={e => setPin(e.target.value.replace(/\D/g, ""))} required /></label>
        <label>Current 6-digit TOTP<input type="password" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={totp} onChange={e => setTotp(e.target.value.replace(/\D/g, ""))} required /></label>
        <label className="follower-connect-consent"><input type="checkbox" checked={consent} onChange={e => setConsent(e.target.checked)} /> I own or control this Angel One account and authorize it to be registered as my EAGLE TRADES follower account. I understand that live copy trading is not enabled by this connection.</label>
        <button type="submit" disabled={busy || !consent || pin.length < 4 || totp.length !== 6}>{busy ? "CONNECTING SECURELY…" : "CONNECT MY ANGEL ONE ACCOUNT"}</button>
      </form>}
      {message && <p className="follower-connect-message" role="status">{message}</p>}
      <footer>Never share your PIN or TOTP with anyone. EAGLE TRADES Admin cannot view these credentials.</footer>
    </section>
    <style jsx>{`
      .follower-connect-page{min-height:100vh;position:relative;isolation:isolate;overflow:hidden;display:grid;place-items:center;padding:28px 16px;background:#080f1c;color:#e8eef8;font-family:Arial,sans-serif}
      .follower-connect-background-video{position:fixed;inset:0;width:100%;height:100%;object-fit:cover;object-position:center;z-index:-2;pointer-events:none}
      .follower-connect-video-overlay{position:fixed;inset:0;z-index:-1;background:linear-gradient(120deg,rgba(4,10,20,.88),rgba(7,17,31,.70) 52%,rgba(3,10,20,.86))}
      .follower-connect-card{position:relative;z-index:1;width:min(100%,480px);padding:32px;border:1px solid #52647b80;border-radius:18px;background:rgba(12,25,42,.88);backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px);box-shadow:0 24px 80px #0009}
      .follower-connect-brand{font-size:19px;font-weight:900;letter-spacing:2px;margin-bottom:28px}.follower-connect-brand span{color:#42c5a5}
      .follower-connect-eyebrow{font-size:10px;letter-spacing:2px;color:#8ca5c2;font-weight:700}
      h1{font-size:30px;margin:8px 0}.follower-connect-intro{color:#c0ccda;line-height:1.55;margin-bottom:26px}
      form{display:grid;gap:16px}label{display:grid;gap:7px;font-size:12px;color:#d0dbea;font-weight:700}
      input:not([type=checkbox]){width:100%;box-sizing:border-box;padding:13px;border:1px solid #52647b;border-radius:9px;background:rgba(5,14,26,.88);color:#fff;font-size:15px}
      .follower-connect-consent{display:flex;align-items:flex-start;gap:9px;line-height:1.5;font-weight:400}.follower-connect-consent input{margin-top:3px}
      button{border:0;border-radius:9px;padding:14px;background:#20a98a;color:#061710;font-weight:900;cursor:pointer}button:disabled{opacity:.5;cursor:not-allowed}
      .follower-connect-status{color:#4ad6ac;font-size:12px;font-weight:900;letter-spacing:1px}.follower-connected-state h2{font-size:20px}
      .follower-connected-state p,.follower-connect-safety{color:#c0ccda;line-height:1.5}.follower-connect-error{padding:14px;border:1px solid #76513b;border-radius:9px;color:#f1c19a;background:rgba(20,20,24,.45)}
      .follower-connect-message{margin-top:16px;color:#b7e6d7;line-height:1.5}.follower-connect-card footer{margin-top:24px;color:#a3b3c7;font-size:11px;line-height:1.5}
      @media(max-width:520px){.follower-connect-card{padding:24px 18px}.follower-connect-background-video{object-position:58% center}}
      @media(prefers-reduced-motion:reduce){.follower-connect-background-video{display:none}}
    `}</style>
  </main>;
}
