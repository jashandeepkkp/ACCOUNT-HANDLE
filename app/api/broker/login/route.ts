import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/server/session";
import { smartApiHeaders, smartApiRequest } from "@/lib/angel-one/smartapi";
import { sealSession, sessionExpiry } from "@/lib/angel-one/session";
import { saveBrokerAccount } from "@/lib/angel-one/account-store";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const attempts = new Map<string, { count: number; resetAt: number }>();
function sameOrigin(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  try { const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host"); return Boolean(host && new URL(origin).host === host); } catch { return false; }
}
export async function POST(request: NextRequest) {
  if (!await getSession()) return NextResponse.json({ error: "Application login required." }, { status: 401 });
  if (!sameOrigin(request)) return NextResponse.json({ error: "Cross-origin request blocked." }, { status: 403 });
  if (!request.headers.get("content-type")?.includes("application/json")) return NextResponse.json({ error: "JSON request required." }, { status: 415 });
  const address = (request.headers.get("x-forwarded-for") ?? "unknown").split(",")[0].trim();
  const now = Date.now(), current = attempts.get(address);
  if (current && current.resetAt > now && current.count >= 5) return NextResponse.json({ error: "Too many login attempts. Try again in 15 minutes." }, { status: 429 });
  let body: { clientCode?: string; pin?: string; totp?: string; authorizedForCopy?: boolean };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 }); }
  const clientCode = body.clientCode?.trim().toUpperCase() ?? "";
  if (!/^[A-Z0-9]{4,20}$/.test(clientCode) || !body.pin || !/^\d{4,6}$/.test(body.pin) || !body.totp || !/^\d{6}$/.test(body.totp)) return NextResponse.json({ error: "Enter valid client code, PIN and current six-digit TOTP." }, { status: 400 });
  if (!process.env.ANGELONE_API_KEY || !process.env.ANGELONE_STATIC_IP || !process.env.ANGELONE_SESSION_ENCRYPTION_KEY) return NextResponse.json({ error: "Set Angel One API key, static IP and 64-character session encryption key in Render." }, { status: 503 });
  attempts.set(address, { count: current && current.resetAt > now ? current.count + 1 : 1, resetAt: now + 15 * 60 * 1000 });
  try {
    const response = await fetch("https://apiconnect.angelone.in/rest/auth/angelbroking/user/v1/loginByPassword", {
      method: "POST", headers: smartApiHeaders(undefined, clientCode),
      body: JSON.stringify({ clientcode: clientCode, password: body.pin, totp: body.totp }),
      cache: "no-store", signal: AbortSignal.timeout(12000),
    });
    const payload = await response.json().catch(() => null) as { status?: boolean; message?: string; errorcode?: string; data?: { jwtToken?: string; refreshToken?: string; feedToken?: string } } | null;
    if (!response.ok || !payload?.status || !payload.data?.jwtToken || !payload.data.refreshToken || !payload.data.feedToken) return NextResponse.json({ error: payload?.message || "Angel One authentication failed.", code: payload?.errorcode || "AUTH_FAILED" }, { status: 401 });
    const expiresAt = sessionExpiry();
    const brokerSession = { jwtToken: payload.data.jwtToken, refreshToken: payload.data.refreshToken, feedToken: payload.data.feedToken, clientCode, expiresAt };
    const profile = await smartApiRequest<Record<string, unknown>>("/rest/secure/angelbroking/user/v1/getProfile", "GET", brokerSession);
    const approved = process.env.ANGELONE_ACCOUNT_AUTHORIZED === "true";
    await saveBrokerAccount({ id: "master", role: "MASTER", label: "Master Account", clientCode, encryptedSession: sealSession(brokerSession), expiresAt, authorizedForCopy: Boolean(body.authorizedForCopy && approved) });
    attempts.delete(address);
    return NextResponse.json({ connected: true, broker: "ANGEL_ONE", account: "MASTER", clientCodeMasked: "•".repeat(Math.max(4, clientCode.length - 4)) + clientCode.slice(-4), profile, authorizedForCopy: Boolean(body.authorizedForCopy && approved), authorizationPending: !approved, message: "Angel One Master authenticated. Live orders remain disabled." });
  } catch (error) { return NextResponse.json({ error: (error instanceof Error ? error.message : "Broker authentication unavailable.").slice(0, 180) }, { status: 503 }); }
}
