"use client";

import { useCallback, useEffect, useState } from "react";
import { getSupabaseBrowserClient } from "./client";

type CloudColumn = "positions" | "order_events" | "follower_accounts";

/**
 * Loads the signed-in user's JSON state from Supabase and saves changes.
 * No broker passwords, PINs, TOTP values, or access tokens belong in these columns.
 */
export function useCloudState<T>(column: CloudColumn, initialValue: T) {
  const [value, setValue] = useState<T>(initialValue);
  const [userId, setUserId] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [cloudAvailable, setCloudAvailable] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  const load = useCallback(async (id: string) => {
    const client = getSupabaseBrowserClient();
    if (!client) { setCloudAvailable(false); setReady(true); return; }
    setCloudAvailable(true);
    setHydrated(false);
    const { data, error } = await client.from("user_app_state")
      .select(column).eq("user_id", id).maybeSingle();
    if (error) {
      console.error("Supabase state load failed:", error.message);
      setHydrated(false);
      setReady(true);
      return;
    }
    const stored = data?.[column];
    if (stored !== null && stored !== undefined) setValue(stored as T);
    setHydrated(true);
    setReady(true);
  }, [column]);

  useEffect(() => {
    const client = getSupabaseBrowserClient();
    if (!client) { setReady(true); return; }
    let active = true;
    void client.auth.getUser().then(({ data }) => {
      if (!active) return;
      const id = data.user?.id ?? null;
      setUserId(id);
      if (id) void load(id);
      else setReady(true);
    });
    const { data: listener } = client.auth.onAuthStateChange((_event, session) => {
      if (!active) return;
      const id = session?.user.id ?? null;
      setUserId(id);
      if (id) { setReady(false); void load(id); }
      else { setHydrated(false); setValue(initialValue); setReady(true); }
    });
    return () => { active = false; listener.subscription.unsubscribe(); };
  }, [load, initialValue]);

  useEffect(() => {
    if (!ready || !userId || !hydrated) return;
    const client = getSupabaseBrowserClient();
    if (!client) return;
    const timer = window.setTimeout(async () => {
      const { error } = await client.from("user_app_state").upsert(
        { user_id: userId, [column]: value, updated_at: new Date().toISOString() },
        { onConflict: "user_id" },
      );
      if (error) console.error("Supabase state save failed:", error.message);
    }, 500);
    return () => window.clearTimeout(timer);
  }, [column, ready, userId, hydrated, value]);

  return { value, setValue, ready, cloudAvailable, signedIn: Boolean(userId) };
}
