import { NextResponse } from "next/server";
import { getSession } from "@/lib/server/session";
import { accountSession, deleteBrokerAccount, getBrokerAccount } from "@/lib/angel-one/account-store";
import { openSession } from "@/lib/angel-one/session";
import { smartApiRequest } from "@/lib/angel-one/smartapi";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET() {
  if (!await getSession()) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  try {
    const account = await getBrokerAccount("master");
    if (!account) return NextResponse.json({ connected: false });
    const brokerSession = accountSession(account, openSession);
    if (!brokerSession) { await deleteBrokerAccount("master"); return NextResponse.json({ connected: false, error: "Angel One session expired. Reconnect." }); }
    const profile = await smartApiRequest<Record<string, unknown>>("/rest/secure/angelbroking/user/v1/getProfile", "GET", brokerSession);
    return NextResponse.json({ connected: true, broker: "ANGEL_ONE", account: "MASTER", clientCodeMasked: account.client_code_masked, authorizedForCopy: account.authorized_for_copy, profile });
  } catch { return NextResponse.json({ connected: false, error: "Broker session expired or unavailable." }, { status: 401 }); }
}
export async function DELETE() {
  if (!await getSession()) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  try {
    const account = await getBrokerAccount("master");
    if (account) {
      const brokerSession = accountSession(account, openSession);
      if (brokerSession) await smartApiRequest("/rest/secure/angelbroking/user/v1/logout", "POST", brokerSession, { clientcode: brokerSession.clientCode }).catch(() => undefined);
    }
  } finally { await deleteBrokerAccount("master"); }
  return NextResponse.json({ connected: false, loggedOut: true });
}
