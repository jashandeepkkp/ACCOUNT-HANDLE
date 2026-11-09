"use client";

import { useEffect, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

export default function SupabaseAccount() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [signedInEmail, setSignedInEmail] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [configured, setConfigured] = useState(false);

  useEffect(() => {
    const client = getSupabaseBrowserClient();
    setConfigured(Boolean(client));
    if (!client) return;
    void client.auth.getUser().then(({ data }) => setSignedInEmail(data.user?.email ?? null));
    const { data } = client.auth.onAuthStateChange((_event, session) => {
      setSignedInEmail(session?.user.email ?? null);
    });
    return () => data.subscription.unsubscribe();
  }, []);

  async function submit(mode: "signin" | "signup") {
    const client = getSupabaseBrowserClient();
    if (!client) return;
    setBusy(true); setMessage("");
    try {
      const result = mode === "signin"
        ? await client.auth.signInWithPassword({ email: email.trim(), password })
        : await client.auth.signUp({ email: email.trim(), password });
      if (result.error) throw result.error;
      if (mode === "signup" && !result.data.session) {
        setMessage("Account created. Check your email to confirm, then sign in.");
      } else {
        setMessage(mode === "signin" ? "Cloud account connected. Data sync is active." : "Cloud account created.");
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Cloud account authentication failed.");
    } finally { setBusy(false); }
  }

  async function logout() {
    const client = getSupabaseBrowserClient();
    if (!client) return;
    setBusy(true);
    const { error } = await client.auth.signOut();
    setMessage(error?.message ?? "Signed out. Your saved cloud data remains in Supabase.");
    setBusy(false);
  }

  return <section className="cloud-account" aria-label="EAGLE TRADES cloud storage">
    <div className="cloud-account-copy">
      <b>ONLINE DATA BACKUP</b>
      <span>{!configured ? "SUPABASE NOT CONFIGURED" : signedInEmail ? `SYNCING · ${signedInEmail}` : "SIGN IN TO SAVE DATA ONLINE"}</span>
    </div>
    {!configured ? <p className="cloud-help">Add the Supabase project URL and anon key to Render to enable cloud storage.</p>
      : signedInEmail ? <button type="button" className="cloud-button" disabled={busy} onClick={() => void logout()}>{busy ? "PLEASE WAIT…" : "SIGN OUT"}</button>
      : <form className="cloud-auth-form" onSubmit={event => { event.preventDefault(); void submit("signin"); }}>
          <input type="email" autoComplete="email" placeholder="Email address" value={email} onChange={event => setEmail(event.target.value)} required />
          <input type="password" autoComplete="current-password" placeholder="Password (8+ characters)" value={password} onChange={event => setPassword(event.target.value)} minLength={8} required />
          <button className="cloud-button" type="submit" disabled={busy}>{busy ? "PLEASE WAIT…" : "SIGN IN"}</button>
          <button className="cloud-button secondary" type="button" disabled={busy || !email.includes("@") || password.length < 8} onClick={() => void submit("signup")}>CREATE ACCOUNT</button>
        </form>}
    {message && <small className="cloud-message" role="status">{message}</small>}
    <small className="cloud-help">Broker PINs, TOTP codes and session tokens are never saved in this app-state table.</small>
  </section>;
}
