"use client";

import { useEffect, useState } from "react";

type CloudColumn = "positions" | "order_events" | "follower_accounts" | "pre_data_starting_balance";

export function useCloudState<T>(column: CloudColumn, initialValue: T) {
  const [value, setValue] = useState<T>(initialValue);
  const [ready, setReady] = useState(false);
  const [loadedFromCloud, setLoadedFromCloud] = useState(false);

  useEffect(() => {
    let active = true;
    fetch("/api/state", { cache: "no-store", credentials: "same-origin" })
      .then(async response => {
        if (!response.ok) throw new Error("Cloud state could not be loaded.");
        return response.json();
      })
      .then(data => {
        if (!active) return;
        if (data[column] !== null && data[column] !== undefined) setValue(data[column] as T);
        setLoadedFromCloud(true);
        setReady(true);
      })
      .catch(error => {
        console.error("Neon state load failed:", error);
        if (active) setReady(true);
      });
    return () => { active = false; };
  // Initial value is only a fallback when this Neon record has no value yet.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [column]);

  useEffect(() => {
    if (!ready || !loadedFromCloud) return;
    const timer = window.setTimeout(async () => {
      const response = await fetch("/api/state", {
        method: "PUT", credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [column]: value }),
      });
      if (!response.ok) console.error("Neon state save failed:", await response.text());
    }, 600);
    return () => window.clearTimeout(timer);
  }, [column, ready, loadedFromCloud, value]);

  return { value, setValue, ready };
}
