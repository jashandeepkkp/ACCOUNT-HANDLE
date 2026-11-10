import { NextResponse } from "next/server";
import { getSession } from "@/lib/server/session";
import { ensureBrokerAccountsTable } from "@/lib/angel-one/account-store";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET() {
  if (!await getSession()) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  try {
    const sql = await ensureBrokerAccountsTable();
    const accounts = await sql`SELECT id, role, authorized_for_copy, session_expires_at FROM eagle_trades_broker_accounts`;
    const master = accounts.find((item: {role:string}) => item.role === "MASTER");
    const followers = accounts.filter((item: {role:string}) => item.role === "FOLLOWER");
    const active = (item: {session_expires_at: string}) => new Date(String(item.session_expires_at)).getTime() > Date.now();
    const checks = [
      { key: "master_connected", label: "Master Angel One session connected", passed: Boolean(master && active(master)) },
      { key: "followers_connected", label: "At least one authenticated follower; all sessions valid", passed: followers.length > 0 && followers.every(active) },
      { key: "account_authorization", label: "Master and every follower explicitly authorized for copying", passed: Boolean(master?.authorized_for_copy) && followers.length > 0 && followers.every((item: {authorized_for_copy:boolean}) => item.authorized_for_copy) },
      { key: "broker_approval", label: "Broker API/account approval confirmed in Render", passed: process.env.ANGELONE_ACCOUNT_AUTHORIZED === "true" },
      { key: "static_ip", label: "Static outbound IP registered with Angel One", passed: process.env.ANGELONE_STATIC_IP_REGISTERED === "true" && Boolean(process.env.ANGELONE_STATIC_IP) },
      { key: "encryption", label: "AES-256-GCM broker session encryption key configured", passed: /^[a-fA-F0-9]{64}$/.test(process.env.ANGELONE_SESSION_ENCRYPTION_KEY ?? "") },
    ];
    return NextResponse.json({ checks, liveExecutionEnabled: false, reason: "Live order placement is hard-disabled. Passing checks do not enable trading." });
  } catch { return NextResponse.json({ checks: [], liveExecutionEnabled: false, error: "Safety checks unavailable. Live orders remain disabled." }, { status: 503 }); }
}
