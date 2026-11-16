import { NextRequest, NextResponse } from "next/server";
import { getFollowerSession, clearFollowerCookie } from "@/lib/server/follower-session";
import { getBrokerAccount, deleteBrokerAccount, accountSession } from "@/lib/angel-one/account-store";
import { openSession } from "@/lib/angel-one/session";
import { smartApiRequest } from "@/lib/angel-one/smartapi";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
function sameOrigin(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  try { const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host"); return Boolean(host && new URL(origin).host === host); } catch { return false; }
}
export async function GET() {
  const auth = await getFollowerSession();
  if (!auth) return NextResponse.json({ connected: false }, { status: 401, headers: { "Cache-Control": "no-store" } });
  try {
    const account = await getBrokerAccount(auth.followerId);
    if (!account || account.role !== "FOLLOWER") return NextResponse.json({ connected: false }, { status: 404 });
    const session = accountSession(account, openSession);
    if (!session) { await deleteBrokerAccount(auth.followerId); return NextResponse.json({ connected: false }, { status: 401 }); }
    await smartApiRequest("/rest/secure/angelbroking/user/v1/getProfile", "GET", session);
    return NextResponse.json({ connected: true, clientCodeMasked: account.client_code_masked, authorizedForCopy: account.authorized_for_copy }, { headers: { "Cache-Control": "no-store" } });
  } catch { return NextResponse.json({ connected: false, error: "Your Angel One session has expired or is unavailable." }, { status: 401 }); }
}
export async function DELETE(request: NextRequest) {
  if (!sameOrigin(request)) return NextResponse.json({ error: "Cross-origin request blocked." }, { status: 403 });
  const auth = await getFollowerSession();
  const response = NextResponse.json({ connected: false, loggedOut: true });
  clearFollowerCookie(response);
  if (!auth) return response;
  try {
    const account = await getBrokerAccount(auth.followerId);
    if (account?.role === "FOLLOWER") {
      const session = accountSession(account, openSession);
      if (session) await smartApiRequest("/rest/secure/angelbroking/user/v1/logout", "POST", session, { clientcode: session.clientCode }).catch(() => undefined);
      await deleteBrokerAccount(auth.followerId);
    }
  } catch { return NextResponse.json({ error: "Could not complete follower logout." }, { status: 503 }); }
  return response;
}
