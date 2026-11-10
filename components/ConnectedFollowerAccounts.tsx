"use client";

import { useEffect, useState } from "react";
import { useCloudState } from "@/lib/neon/use-cloud-state";

type Follower = { id: string; name: string; connected: boolean; masked?: string; busy?: boolean; showLogin?: boolean; message?: string; authorizedForCopy?: boolean };

function newId() {
  return Array.from(crypto.getRandomValues(new Uint8Array(16)), value => value.toString(16).padStart(2, "0")).join("");
}

export default function ConnectedFollowerAccounts() {
  const { value: accounts, setValue: setAccounts, ready: loaded } = useCloudState<Follower[]>("follower_accounts", []);
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [credentials, setCredentials] = useState<Record<string, { clientCode: string; pin: string; totp: string }>>({});
  const [consents, setConsents] = useState<Record<string, boolean>>({});
  const [safety, setSafety] = useState<{checks: Array<{key:string;label:string;passed:boolean}>;liveExecutionEnabled:boolean} | null>(null);

  useEffect(() => {
    fetch("/api/broker/live-safety", { cache: "no-store" }).then(r => r.ok ? r.json() : null).then(data => { if (data) setSafety(data); }).catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!loaded) return;
    accounts.forEach(async account => {
      try {
        const response = await fetch(`/api/broker/followers/${account.id}`, { cache: "no-store", credentials: "same-origin" });
        const data = await response.json() as { connected?: boolean; clientCodeMasked?: string };
        setAccounts(current => current.map(item => item.id === account.id
          ? { ...item, connected: Boolean(response.ok && data.connected), masked: data.clientCodeMasked }
          : item));
      } catch {
        setAccounts(current => current.map(item => item.id === account.id ? { ...item, connected: false } : item));
      }
    });
  // Only restore sessions once, after local account IDs load.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded]);

  function addAccount() {
    const id = newId();
    const name = newName.trim() || `Follower Account ${accounts.length + 1}`;
    setAccounts(current => [...current, { id, name, connected: false, showLogin: true }]);
    setNewName("");
    setAdding(false);
  }

  function updateCredentials(id: string, key: "clientCode" | "pin" | "totp", value: string) {
    setCredentials(current => ({ ...current, [id]: { ...current[id], [key]: value } }));
  }

  async function login(account: Follower) {
    const values = credentials[account.id];
    if (!values) return;
    setAccounts(current => current.map(item => item.id === account.id ? { ...item, busy: true, message: "" } : item));
    try {
      const response = await fetch(`/api/broker/followers/${account.id}`, {
        method: "POST", headers: { "Content-Type": "application/json" }, credentials: "same-origin",
        body: JSON.stringify({ ...values, authorizedForCopy: Boolean(consents[account.id]) }),
      });
      const data = await response.json() as { connected?: boolean; error?: string; clientCodeMasked?: string; profile?: Record<string, unknown>; authorizedForCopy?: boolean; authorizationPending?: boolean };
      if (!response.ok || !data.connected) throw new Error(data.error || "Angel One login failed.");
      setAccounts(current => current.map(item => item.id === account.id
        ? { ...item, connected: true, masked: data.clientCodeMasked, authorizedForCopy: Boolean(data.authorizedForCopy), showLogin: false, busy: false, message: data.authorizationPending ? "Authenticated; copy authorization awaits broker approval." : "Angel One follower authenticated." }
        : item));
      setCredentials(current => { const next = { ...current }; delete next[account.id]; return next; });
    } catch (error) {
      setAccounts(current => current.map(item => item.id === account.id
        ? { ...item, busy: false, message: error instanceof Error ? error.message : "Login failed." }
        : item));
    }
  }

  async function logout(account: Follower) {
    setAccounts(current => current.map(item => item.id === account.id ? { ...item, busy: true } : item));
    try {
      await fetch(`/api/broker/followers/${account.id}`, { method: "DELETE", credentials: "same-origin" });
      setAccounts(current => current.map(item => item.id === account.id
        ? { ...item, connected: false, masked: undefined, busy: false, showLogin: false, message: "Follower account logged out." }
        : item));
    } catch {
      setAccounts(current => current.map(item => item.id === account.id ? { ...item, busy: false, message: "Logout failed." } : item));
    }
  }

  async function remove(account: Follower) {
    if (account.connected) await fetch(`/api/broker/followers/${account.id}`, { method: "DELETE", credentials: "same-origin" });
    setAccounts(current => current.filter(item => item.id !== account.id));
    setCredentials(current => { const next = { ...current }; delete next[account.id]; return next; });
  }

  return (
    <section className="connected-dashboard">
      <div className="connected-title">
        <div><div className="eyebrow">BROKER CONNECTION CENTRE</div><h2>Connected Accounts</h2>
          <p>Add real Angel One accounts. Each follower must authenticate with its own client code, PIN and current TOTP.</p></div>
        <button className="account-login" onClick={() => setAdding(value => !value)}>{adding ? "CANCEL" : "+ ADD ANGEL ONE ACCOUNT"}</button>
      </div>
      {adding && <div className="follower-add-form">
        <label>Account label<input value={newName} onChange={event => setNewName(event.target.value)} placeholder="e.g. Follower 1"/></label>
        <button className="account-login" onClick={addAccount}>ADD ACCOUNT</button>
      </div>}
      {!accounts.length && <div className="empty">No follower accounts added yet. Select “Add Angel One Account” to connect a real account.</div>}
      <div className="account-cards">
        {accounts.map((account, index) => <article className="account-card" key={account.id}>
          <div className="account-card-top">
            <div className="broker-mark">A</div>
            <div className="account-name"><b>{account.name}</b><small>ANGEL ONE · FOLLOWER {index + 1}{account.masked ? ` · ${account.masked}` : ""}</small></div>
            <span className={account.connected ? "connection-badge online" : "connection-badge offline"}>{account.connected ? "CONNECTED" : "NOT CONNECTED"}</span>
          </div>
          {!account.connected && account.showLogin && <div className="follower-login-form">
            <label>Angel One Client Code<input autoComplete="off" value={credentials[account.id]?.clientCode || ""} onChange={event => updateCredentials(account.id, "clientCode", event.target.value.trim())}/></label>
            <label>PIN<input type="password" inputMode="numeric" autoComplete="off" maxLength={6} value={credentials[account.id]?.pin || ""} onChange={event => updateCredentials(account.id, "pin", event.target.value.replace(/\D/g, ""))}/></label>
            <label>Current TOTP<input type="password" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={credentials[account.id]?.totp || ""} onChange={event => updateCredentials(account.id, "totp", event.target.value.replace(/\D/g, ""))}/></label>
            <button className="account-login" disabled={account.busy || !credentials[account.id]?.clientCode || (credentials[account.id]?.pin || "").length < 4 || (credentials[account.id]?.totp || "").length !== 6} onClick={() => void login(account)}>{account.busy ? "CONNECTING…" : "CONNECT ANGEL ONE"}</button>
          </div>}
          {!account.connected && account.showLogin && <label className="broker-consent"><input type="checkbox" checked={Boolean(consents[account.id])} onChange={event => setConsents(current => ({ ...current, [account.id]: event.target.checked }))}/> I own/control this follower account and authorize it to receive copied orders, subject to broker approval.</label>}
          <div className="account-controls">
            {account.connected
              ? <><span className="ai-state"><i/> AUTHENTICATED · {account.authorizedForCopy ? "COPY CONSENT RECORDED" : "COPY NOT AUTHORIZED"}</span><button className="account-logout" disabled={account.busy} onClick={() => void logout(account)}>{account.busy ? "PLEASE WAIT…" : "LOG OUT"}</button></>
              : <button className="account-login" onClick={() => setAccounts(current => current.map(item => item.id === account.id ? { ...item, showLogin: !item.showLogin } : item))}>{account.showLogin ? "HIDE LOGIN" : "LOGIN ANGEL ONE"}</button>}
            <button className="ai-toggle" onClick={() => void remove(account)}>REMOVE</button>
          </div>
          {account.message && <p className="master-login-message" role="status">{account.message}</p>}
        </article>)}
      </div>
      <section className="broker-safety-panel"><div><b>LIVE TRADING SAFETY CHECKS</b><span>Live order execution is hard-disabled in this release.</span></div><div className="broker-safety-list">{(safety?.checks || []).map(check => <span key={check.key} className={check.passed ? "passed" : "pending"}>{check.passed ? "✓" : "○"} {check.label}</span>)}</div><strong>LIVE EXECUTION: DISABLED</strong></section>
      <div className="account-dashboard-foot"><span>Verified connection state comes from each account's own Angel One profile session.</span><span>Real copy-order execution is not enabled.</span></div>
    </section>
  );
}
