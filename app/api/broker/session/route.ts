import { NextRequest, NextResponse } from "next/server";
import { smartApiRequest } from "@/lib/angel-one/smartapi";
import { expiredSessionCookie, getSessionCookieName, openSession } from "@/lib/angel-one/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const encrypted = request.cookies.get(getSessionCookieName())?.value;
  const session = encrypted ? openSession(encrypted) : null;
  if (!session) {
    const response = NextResponse.json({ connected: false }, { status: 401 });
    response.cookies.set(expiredSessionCookie());
    return response;
  }
  try {
    const profile = await smartApiRequest<Record<string, unknown>>(
      "/rest/secure/angelbroking/user/v1/getProfile", "GET", session,
    );
    return NextResponse.json({ connected: true, broker: "ANGEL_ONE", account: "MASTER", profile });
  } catch {
    const response = NextResponse.json({ connected: false, error: "Broker session expired or unavailable." }, { status: 401 });
    response.cookies.set(expiredSessionCookie());
    return response;
  }
}

export async function DELETE() {
  const response = NextResponse.json({ connected: false, loggedOut: true });
  response.cookies.set(expiredSessionCookie());
  return response;
}
