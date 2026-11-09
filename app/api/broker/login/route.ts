import { NextRequest, NextResponse } from "next/server";
import { smartApiHeaders } from "@/lib/angel-one/smartapi";
import { sealSession, sessionCookie, sessionExpiry } from "@/lib/angel-one/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const attempts = new Map<string, { count: number; resetAt: number }>();

function sameOrigin(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  try {
    const originHost = new URL(origin).host;
    const expectedHost = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
    return Boolean(expectedHost && originHost === expectedHost);
  } catch {
    return false;
  }
}

function clientAddress(request: NextRequest) {
  return (request.headers.get("x-forwarded-for") ?? "unknown").split(",")[0].trim();
}

export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) return NextResponse.json({ error: "Cross-origin request blocked" }, { status: 403 });
  if (!request.headers.get("content-type")?.includes("application/json")) {
    return NextResponse.json({ error: "JSON request required" }, { status: 415 });
  }

  const address = clientAddress(request);
  const now = Date.now();
  const current = attempts.get(address);
  if (current && current.resetAt > now && current.count >= 5) {
    return NextResponse.json({ error: "Too many login attempts. Try again in 15 minutes." }, { status: 429 });
  }
  if (!process.env.ANGELONE_API_KEY || !process.env.ANGELONE_CLIENT_CODE ||
      !process.env.ANGELONE_SESSION_ENCRYPTION_KEY ||
      process.env.ANGELONE_ACCOUNT_AUTHORIZED !== "true") {
    return NextResponse.json({ error: "Broker configuration or account authorization is not ready." }, { status: 503 });
  }

  let body: { pin?: string; totp?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (!body.pin || !/^\d{4,6}$/.test(body.pin) || !body.totp || !/^\d{6}$/.test(body.totp)) {
    return NextResponse.json({ error: "A valid PIN and current six-digit TOTP are required." }, { status: 400 });
  }

  attempts.set(address, { count: (current?.resetAt ?? 0) > now ? (current?.count ?? 0) + 1 : 1, resetAt: now + 15 * 60 * 1000 });
  try {
    const response = await fetch("https://apiconnect.angelone.in/rest/auth/angelbroking/user/v1/loginByPassword", {
      method: "POST",
      headers: smartApiHeaders(),
      body: JSON.stringify({
        clientcode: process.env.ANGELONE_CLIENT_CODE,
        password: body.pin,
        totp: body.totp,
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(12_000),
    });
    const payload = await response.json().catch(() => null) as {
      status?: boolean; message?: string; errorcode?: string;
      data?: { jwtToken?: string; refreshToken?: string; feedToken?: string };
    } | null;
    if (!response.ok || !payload?.status || !payload.data?.jwtToken || !payload.data.refreshToken || !payload.data.feedToken) {
      return NextResponse.json({ error: payload?.message || "Angel One authentication failed.", code: payload?.errorcode ?? "AUTH_FAILED" }, { status: 401 });
    }

    const encrypted = sealSession({
      jwtToken: payload.data.jwtToken,
      refreshToken: payload.data.refreshToken,
      feedToken: payload.data.feedToken,
      clientCode: process.env.ANGELONE_CLIENT_CODE,
      expiresAt: sessionExpiry(),
    });
    const result = NextResponse.json({ connected: true, broker: "ANGEL_ONE", account: "MASTER", message: "Angel One session established. Live order execution remains disabled." });
    result.cookies.set(sessionCookie(encrypted));
    attempts.delete(address);
    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Broker authentication unavailable";
    return NextResponse.json({ error: message.slice(0, 180) }, { status: 503 });
  }
}
