const base = process.env.EAGLE_TRADES_URL?.trim().replace(/\\/+$/, "");
const secret = process.env.CRON_SECRET ?? "";

if (!base || !/^https:\/\//i.test(base)) {
  console.error("EAGLE_TRADES_URL must be the HTTPS URL of the deployed EAGLE TRADES web service.");
  process.exit(1);
}
if (secret.length < 24) {
  console.error("CRON_SECRET must be at least 24 characters and match the web service secret.");
  process.exit(1);
}

const controller = new AbortController();
const timeout = setTimeout(() => controller.abort(), 50_000);
try {
  const response = await fetch(`${base}/api/broker/copy/sync`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${secret}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ confirmCopySync: true }),
    cache: "no-store",
    signal: controller.signal,
  });
  const result = await response.json().catch(() => null);
  if (!response.ok) {
    console.error(`Copy sync failed with HTTP ${response.status}. Check the EAGLE TRADES live-safety panel and Render logs.`);
    process.exitCode = 1;
  } else {
    console.log(JSON.stringify({
      ok: true,
      baseline: Boolean(result?.baseline),
      processed: Number(result?.processed ?? 0),
      liveCopyEnabled: Boolean(result?.liveCopyEnabled),
      message: String(result?.message ?? "Copy sync completed."),
    }));
  }
} catch (error) {
  console.error(error instanceof Error && error.name === "AbortError"
    ? "Copy sync timed out."
    : "Could not reach the EAGLE TRADES copy-sync endpoint.");
  process.exitCode = 1;
} finally {
  clearTimeout(timeout);
}
