const base = String(process.env.EAGLE_TRADES_URL ?? "").trim().replace(/\/+$/, "");
const secret = String(process.env.CRON_SECRET ?? "");

if (!base) throw new Error("EAGLE_TRADES_URL is required.");
if (!secret || secret.length < 24) throw new Error("CRON_SECRET must contain at least 24 characters.");

let target;
try {
  target = new URL("/api/broker/copy/sync", base);
} catch {
  throw new Error("EAGLE_TRADES_URL must be a valid absolute URL.");
}
if (target.protocol !== "https:") throw new Error("Copy-sync cron requires an HTTPS EAGLE_TRADES_URL.");

const response = await fetch(target, {
  method: "POST",
  headers: {
    Authorization: `Bearer ${secret}`,
    "Content-Type": "application/json",
    Accept: "application/json",
  },
  body: JSON.stringify({ confirmCopySync: true }),
  cache: "no-store",
  signal: AbortSignal.timeout(55_000),
});

const payload = await response.json().catch(() => null);
if (!response.ok || !payload || payload.liveCopyEnabled !== true) {
  const message = typeof payload?.error === "string" ? payload.error : `Copy sync failed (HTTP ${response.status}).`;
  throw new Error(message.slice(0, 240));
}

const outcomes = (payload.results ?? []).flatMap(item => item.outcomes ?? []);
const summary = {
  at: new Date().toISOString(),
  baseline: Boolean(payload.baseline),
  processedMasterOrders: Number(payload.processed ?? 0),
  followerAcknowledgements: outcomes.filter(item => item.status === "ACKNOWLEDGED").length,
  blocked: outcomes.filter(item => item.status === "BLOCKED").length,
  uncertain: outcomes.filter(item => item.status === "SUBMISSION_UNCERTAIN").length,
  duplicates: outcomes.filter(item => item.status === "DUPLICATE").length,
};
console.log(JSON.stringify(summary));
