import { NextRequest, NextResponse } from "next/server";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { ensureTradingStateTable } from "@/lib/server/neon";
import { saveBrokerAccount } from "@/lib/angel-one/account-store";
import { sealSession, sessionExpiry } from "@/lib/angel-one/session";
import { smartApiHeaders, smartApiRequest } from "@/lib/angel-one/smartapi";
import { createFollowerSession, setFollowerCookie } from "@/lib/server/follower-session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const hash = (value: string) => createHash("sha256").update(value).digest("hex");
function sameOrigin(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  try { const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host"); return Boolean(host && new URL(origin).host === host); } catch { return false; }
}
async function validInvite(token: string) {
  const sql = await ensureTradingStateTable();
  await sql`CREATE TABLE IF NOT EXISTS eagle_trades_follower_invites (id text PRIMARY KEY, token_hash text NOT NULL, expires_at timestamptz NOT NULL, revoked_at timestamptz, updated_at timestamptz NOT NULL DEFAULT now())`;
  const rows = await sql`SELECT token_hash, expires_at, revoked_at FROM eagle_trades_follower_invites WHERE id = 'shared' LIMIT 1`;
  const row = rows[0];
  if (!row || row.revoked_at || new Date(String(row.expires_at)).getTime() <= Date.now()) return false;
  const expected = Buffer.from(String(row.token_hash));
  const actual = Buffer.from(hash(token));
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) return NextResponse.json({ error: "Cross-origin request blocked." }, { status: 403 });
  let body: { invite?: string; clientCode?: string; pin?: string; totp?: string; consent?: boolean };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid request." }, { status: 400 }); }
  const invite = typeof body.invite === "string" ? body.invite : "";
  const clientCode = body.clientCode?.trim().toUpperCase() ?? "";
  if (!/^[A-Za-z0-9_-]{40,60}$/.test(invite) || !await validInvite(invite)) return NextResponse.json({ error: "This shared invitation link is invalid, expired or revoked. Ask the EAGLE TRADES Admin for a new link." }, { status: 403 });
  if (body.consent !== true) return NextResponse.json({ error: "You must confirm that this is your own Angel One account and authorize follower status." }, { status: 400 });
  if (!/^[A-Z0-9]{4,20}$/.test(clientCode) || !body.pin || !/^\d{4,6}$/.test(body.pin) || !body.totp || !/^\d{6}$/.test(body.totp)) return NextResponse.json({ error: "Enter a valid client code, PIN and six-digit TOTP." }, { status: 400 });
  if (!process.env.ANGELONE_API_KEY || !process.env.ANGELONE_STATIC_IP || !process.env.ANGELONE_SESSION_ENCRYPTION_KEY) return NextResponse.json({ error: "Angel One server configuration is incomplete." }, { status: 503 });
  try {
    const response = await fetch("https://apiconnect.angelone.in/rest/auth/angelbroking/user/v1/loginByPassword", {
      method: "POST", headers: smartApiHeaders(undefined, clientCode),
      body: JSON.stringify({ clientcode: clientCode, password: body.pin, totp: body.totp }),
      cache: "no-store", signal: AbortSignal.timeout(12000)
    });
    const payload = await response.json().catch(() => null) as { status?: boolean; message?: string; errorcode?: string; data?: { jwtToken?: string; refreshToken?: string; feedToken?: string } } | null;
    if (!response.ok || !payload?.status || !payload.data?.jwtToken || !payload.data.refreshToken || !payload.data.feedToken) return NextResponse.json({ error: payload?.message || "Angel One authentication failed.", code: payload?.errorcode || "AUTH_FAILED" }, { status: 401 });
    const expiresAt = sessionExpiry();
    const session = { jwtToken: payload.data.jwtToken, refreshToken: payload.data.refreshToken, feedToken: payload.data.feedToken, clientCode, expiresAt };
    const profile = await smartApiRequest<Record<string, unknown>>("/rest/secure/angelbroking/user/v1/getProfile", "GET", session);
    const followerId = randomBytes(16).toString("hex");
    const brokerApproved = process.env.ANGELONE_ACCOUNT_AUTHORIZED === "true";
    await saveBrokerAccount({ id: followerId, role: "FOLLOWER", label: "Follower " + followerId.slice(0, 6), clientCode, encryptedSession: sealSession(session), expiresAt, authorizedForCopy: brokerApproved });
    const token = await createFollowerSession(followerId);
    const result = NextResponse.json({ connected: true, clientCodeMasked: clientCode.length > 4 ? "•".repeat(clientCode.length - 4) + clientCode.slice(-4) : "••••", authorizationPending: !brokerApproved });
    setFollowerCookie(result, token);
    result.headers.set("Cache-Control", "no-store");
    return result;
  } catch (error) {
    return NextResponse.json({ error: (error instanceof Error ? error.message : "Angel One authentication unavailable.").slice(0, 180) }, { status: 503 });
  }
}
