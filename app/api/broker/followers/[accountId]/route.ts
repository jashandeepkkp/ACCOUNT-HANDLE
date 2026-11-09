import { NextRequest, NextResponse } from "next/server";
import { sealSession, openSession, sessionExpiry } from "@/lib/angel-one/session";
import { smartApiHeaders, smartApiRequest } from "@/lib/angel-one/smartapi";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ accountId: string }> };
const accountCookie = (id: string) => `angelone_follower_${id}`;
function validId(id: string) { return /^[a-f0-9]{32}$/.test(id); }
function cookie(name: string, value: string, maxAge: number) {
  return { name, value, httpOnly: true, secure: process.env.NODE_ENV === "production",
    sameSite: "strict" as const, path: "/api/broker/followers", maxAge };
}
function originAllowed(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  try {
    const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
    return Boolean(host && new URL(origin).host === host);
  } catch { return false; }
}

export async function POST(request: NextRequest, context: RouteContext) {
  const { accountId } = await context.params;
  if (!validId(accountId)) return NextResponse.json({ error: "Invalid follower account ID." }, { status: 400 });
  if (!originAllowed(request)) return NextResponse.json({ error: "Cross-origin request blocked." }, { status: 403 });
  if (!process.env.ANGELONE_API_KEY || !process.env.ANGELONE_SESSION_ENCRYPTION_KEY ||
      process.env.ANGELONE_ACCOUNT_AUTHORIZED !== "true") {
    return NextResponse.json({ error: "Angel One API configuration and account authorization are required." }, { status: 503 });
  }
  let body: { clientCode?: string; pin?: string; totp?: string };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 }); }
  const clientCode = body.clientCode?.trim() ?? "";
  if (!/^[A-Za-z0-9]{3,20}$/.test(clientCode) || !body.pin || !/^\d{4,6}$/.test(body.pin) ||
      !body.totp || !/^\d{6}$/.test(body.totp)) {
    return NextResponse.json({ error: "Enter a valid Angel One client code, PIN and six-digit TOTP." }, { status: 400 });
  }
  try {
    const response = await fetch("https://apiconnect.angelone.in/rest/auth/angelbroking/user/v1/loginByPassword", {
      method: "POST", headers: smartApiHeaders(undefined, clientCode),
      body: JSON.stringify({ clientcode: clientCode, password: body.pin, totp: body.totp }),
      cache: "no-store", signal: AbortSignal.timeout(12000),
    });
    const payload = await response.json().catch(() => null) as {
      status?: boolean; message?: string; data?: { jwtToken?: string; refreshToken?: string; feedToken?: string };
    } | null;
    if (!response.ok || !payload?.status || !payload.data?.jwtToken || !payload.data.refreshToken || !payload.data.feedToken) {
      return NextResponse.json({ error: payload?.message || "Follower Angel One login failed." }, { status: 401 });
    }
    const session = { jwtToken: payload.data.jwtToken, refreshToken: payload.data.refreshToken,
      feedToken: payload.data.feedToken, clientCode, expiresAt: sessionExpiry() };
    const profile = await smartApiRequest<Record<string, unknown>>(
      "/rest/secure/angelbroking/user/v1/getProfile", "GET", session);
    const encrypted = sealSession(session);
    const result = NextResponse.json({ connected: true, broker: "ANGEL_ONE", profile,
      clientCodeMasked: `${clientCode.slice(0,2)}••••${clientCode.slice(-2)}` });
    result.cookies.set(cookie(accountCookie(accountId), encrypted, 10 * 60 * 60));
    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Follower broker authentication unavailable.";
    return NextResponse.json({ error: message.slice(0, 180) }, { status: 503 });
  }
}

export async function GET(request: NextRequest, context: RouteContext) {
  const { accountId } = await context.params;
  if (!validId(accountId)) return NextResponse.json({ connected: false }, { status: 400 });
  const encrypted = request.cookies.get(accountCookie(accountId))?.value;
  const session = encrypted ? openSession(encrypted) : null;
  if (!session) {
    const result = NextResponse.json({ connected: false }, { status: 401 });
    result.cookies.set(cookie(accountCookie(accountId), "", 0));
    return result;
  }
  try {
    const profile = await smartApiRequest<Record<string, unknown>>(
      "/rest/secure/angelbroking/user/v1/getProfile", "GET", session);
    return NextResponse.json({ connected: true, broker: "ANGEL_ONE", profile,
      clientCodeMasked: `${session.clientCode.slice(0,2)}••••${session.clientCode.slice(-2)}` },
      { headers: { "Cache-Control": "no-store, max-age=0" } });
  } catch {
    const result = NextResponse.json({ connected: false, error: "Follower session expired or unavailable." }, { status: 401 });
    result.cookies.set(cookie(accountCookie(accountId), "", 0));
    return result;
  }
}

export async function DELETE(_request: NextRequest, context: RouteContext) {
  const { accountId } = await context.params;
  if (!validId(accountId)) return NextResponse.json({ error: "Invalid follower account ID." }, { status: 400 });
  const result = NextResponse.json({ connected: false, loggedOut: true });
  result.cookies.set(cookie(accountCookie(accountId), "", 0));
  return result;
}
