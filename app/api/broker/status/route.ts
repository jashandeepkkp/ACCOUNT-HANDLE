import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Read-only readiness endpoint.
 * It intentionally never returns credentials, tokens, static IP values, or
 * enables order execution. Live trading is hard-locked in this foundation PR.
 */
export async function GET() {
  const checks = {
    apiKeyConfigured: Boolean(process.env.ANGELONE_API_KEY),
    clientCodeConfigured: Boolean(process.env.ANGELONE_CLIENT_CODE),
    staticIpConfigured: Boolean(process.env.ANGELONE_STATIC_IP),
    staticIpRegistered: process.env.ANGELONE_STATIC_IP_REGISTERED === "true",
    accountAuthorizationVerified:
      process.env.ANGELONE_ACCOUNT_AUTHORIZED === "true",
  };

  const missing: string[] = [];
  if (!checks.apiKeyConfigured) missing.push("Angel One API key is not configured");
  if (!checks.clientCodeConfigured) missing.push("Angel One client code is not configured");
  if (!checks.staticIpConfigured) missing.push("A fixed outbound IP is not configured");
  if (!checks.staticIpRegistered) missing.push("The outbound IP is not confirmed as registered with Angel One");
  if (!checks.accountAuthorizationVerified) missing.push("Broker account authorization has not been verified");

  return NextResponse.json(
    {
      broker: "ANGEL_ONE",
      environment: "NOT_CONNECTED",
      accountMode: "SINGLE_MASTER_ACCOUNT",
      checks,
      readyForAuthentication: missing.length === 0,
      liveExecutionEnabled: false,
      manualLiveOrdersEnabled: false,
      copyTradingEnabled: false,
      orderExecutionLock: "ENGAGED",
      blockers: missing,
      message:
        "Readiness only. This endpoint does not authenticate, create a broker session, or place orders. Live execution is disabled in code.",
    },
    {
      status: 200,
      headers: {
        "Cache-Control": "no-store, max-age=0",
        "X-Content-Type-Options": "nosniff",
      },
    },
  );
}
