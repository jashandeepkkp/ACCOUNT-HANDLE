import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/server/session";
import { smartApiHeaders, smartApiRequest } from "@/lib/angel-one/smartapi";
import { sealSession, openSession, sessionExpiry } from "@/lib/angel-one/session";
import { accountSession, deleteBrokerAccount, getBrokerAccount, saveBrokerAccount } from "@/lib/angel-one/account-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ id: string }> };
const validId = (id: string) => /^[a-f0-9]{32}$/.test(id);
function sameOrigin(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  try { const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host"); return Boolean(host && new URL(origin).host === host); } catch { return false; }
}
export async function GET(_request: NextRequest, context: Context) {
  if (!await getSession()) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  const { id } = await context.params;
  if (!validId(id)) return NextResponse.json({ error: "Invalid account ID." }, { status: 400 });
  try {
    const account = await getBrokerAccount(id);
    if (!account || account.role !== "FOLLOWER") return NextResponse.json({ connected: false });
    const session = accountSession(account, openSession);
    if (!session) { await deleteBrokerAccount(id); return NextResponse.json({ connected: false }); }
    await smartApiRequest("/rest/secure/angelbroking/user/v1/getProfile", "GET", session);
    return NextResponse.json({ connected: true, clientCodeMasked: account.client_code_masked, authorizedForCopy: account.authorized_for_copy });
  } catch { return NextResponse.json({ connected: false, error: "Follower session expired or unavailable." }, { status: 401 }); }
}
export async function POST(request: NextRequest, context: Context) {
  if (!await getSession()) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  if (!sameOrigin(request)) return NextResponse.json({ error: "Cross-origin request blocked." }, { status: 403 });
  const { id } = await context.params;
  if (!validId(id)) return NextResponse.json({ error: "Invalid account ID." }, { status: 400 });
  let body: { clientCode?: string; pin?: string; totp?: string; authorizedForCopy?: boolean };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid JSON." }, { status: 400 }); }
  const clientCode = body.clientCode?.trim().toUpperCase() ?? "";
  if (!/^[A-Z0-9]{4,20}$/.test(clientCode) || !body.pin || !/^\d{4,6}$/.test(body.pin) || !body.totp || !/^\d{6}$/.test(body.totp)) return NextResponse.json({ error: "Enter a valid client code, PIN and six-digit TOTP." }, { status: 400 });
  if (!process.env.ANGELONE_API_KEY || !process.env.ANGELONE_STATIC_IP || !process.env.ANGELONE_SESSION_ENCRYPTION_KEY) return NextResponse.json({ error: "Angel One server configuration is incomplete." }, { status: 503 });
  try {
    const response = await fetch("https://apiconnect.angelone.in/rest/auth/angelbroking/user/v1/loginByPassword", {
      method: "POST", headers: smartApiHeaders(undefined, clientCode),
      body: JSON.stringify({ clientcode: clientCode, password: body.pin, totp: body.totp }),
      cache: "no-store", signal: AbortSignal.timeout(12000),
    });
    const payload = await response.json().catch(() => null) as { status?: boolean; message?: string; errorcode?: string; data?: { jwtToken?: string; refreshToken?: string; feedToken?: string } } | null;
    if (!response.ok || !payload?.status || !payload.data?.jwtToken || !payload.data.refreshToken || !payload.data.feedToken) return NextResponse.json({ error: payload?.message || "Angel One follower authentication failed.", code: payload?.errorcode || "AUTH_FAILED" }, { status: 401 });
    const expiresAt = sessionExpiry();
    const session = { jwtToken: payload.data.jwtToken, refreshToken: payload.data.refreshToken, feedToken: payload.data.feedToken, clientCode, expiresAt };
    const profile = await smartApiRequest<Record<string, unknown>>("/rest/secure/angelbroking/user/v1/getProfile", "GET", session);
    const brokerApproved = process.env.ANGELONE_ACCOUNT_AUTHORIZED === "true";
    await saveBrokerAccount({ id, role: "FOLLOWER", label: "Follower " + id.slice(0, 6), clientCode, encryptedSession: sealSession(session), expiresAt, authorizedForCopy: Boolean(body.authorizedForCopy && brokerApproved) });
    return NextResponse.json({ connected: true, clientCodeMasked: clientCode.length > 4 ? "•".repeat(clientCode.length - 4) + clientCode.slice(-4) : "••••", profile, authorizedForCopy: Boolean(body.authorizedForCopy && brokerApproved), authorizationPending: !brokerApproved });
  } catch (error) { return NextResponse.json({ error: (error instanceof Error ? error.message : "Follower authentication unavailable.").slice(0, 180) }, { status: 503 }); }
}
export async function DELETE(_request: NextRequest, context: Context) {
  if (!await getSession()) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  const { id } = await context.params;
  if (!validId(id)) return NextResponse.json({ error: "Invalid account ID." }, { status: 400 });
  const account = await getBrokerAccount(id);
  if (account?.role === "FOLLOWER") {
    const session = accountSession(account, openSession);
    if (session) await smartApiRequest("/rest/secure/angelbroking/user/v1/logout", "POST", session, { clientcode: session.clientCode }).catch(() => undefined);
  }
  await deleteBrokerAccount(id);
  return NextResponse.json({ connected: false, loggedOut: true });
}
