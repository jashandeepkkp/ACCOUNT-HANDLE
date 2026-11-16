import { NextRequest, NextResponse } from "next/server";
import { createHash, randomBytes } from "node:crypto";
import { getSession } from "@/lib/server/session";
import { ensureTradingStateTable } from "@/lib/server/neon";
import { listBrokerAccounts } from "@/lib/angel-one/account-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const hash = (value: string) => createHash("sha256").update(value).digest("hex");
function sameOrigin(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  try { const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host"); return Boolean(host && new URL(origin).host === host); } catch { return false; }
}
async function inviteStore() {
  const sql = await ensureTradingStateTable();
  await sql`CREATE TABLE IF NOT EXISTS eagle_trades_follower_invites (id text PRIMARY KEY, token_hash text NOT NULL, expires_at timestamptz NOT NULL, revoked_at timestamptz, updated_at timestamptz NOT NULL DEFAULT now())`;
  return sql;
}
export async function GET() {
  if (!await getSession()) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  try {
    const sql = await inviteStore();
    const rows = await sql`SELECT expires_at, revoked_at FROM eagle_trades_follower_invites WHERE id = 'shared' LIMIT 1`;
    const followers = (await listBrokerAccounts()).filter(account => account.role === "FOLLOWER").map(account => ({
      id: account.id, label: account.label, clientCodeMasked: account.client_code_masked,
      connected: new Date(account.session_expires_at).getTime() > Date.now(),
      authorizedForCopy: account.authorized_for_copy, expiresAt: account.session_expires_at
    }));
    const invite = rows[0];
    return NextResponse.json({ inviteActive: Boolean(invite && !invite.revoked_at && new Date(String(invite.expires_at)).getTime() > Date.now()), inviteExpiresAt: invite?.expires_at ?? null, followers });
  } catch { return NextResponse.json({ error: "Could not load follower management." }, { status: 503 }); }
}
export async function POST(request: NextRequest) {
  if (!await getSession()) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  if (!sameOrigin(request)) return NextResponse.json({ error: "Cross-origin request blocked." }, { status: 403 });
  try {
    const sql = await inviteStore();
    const token = randomBytes(32).toString("base64url");
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    await sql`INSERT INTO eagle_trades_follower_invites (id, token_hash, expires_at, revoked_at, updated_at) VALUES ('shared', ${hash(token)}, ${expiresAt.toISOString()}, NULL, now()) ON CONFLICT (id) DO UPDATE SET token_hash = EXCLUDED.token_hash, expires_at = EXCLUDED.expires_at, revoked_at = NULL, updated_at = now()`;
    return NextResponse.json({ link: `/follower-connect?invite=${token}`, expiresAt: expiresAt.toISOString() });
  } catch { return NextResponse.json({ error: "Could not generate invitation link." }, { status: 503 }); }
}
export async function DELETE(request: NextRequest) {
  if (!await getSession()) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  if (!sameOrigin(request)) return NextResponse.json({ error: "Cross-origin request blocked." }, { status: 403 });
  try {
    const sql = await inviteStore();
    await sql`UPDATE eagle_trades_follower_invites SET revoked_at = now(), updated_at = now() WHERE id = 'shared'`;
    return NextResponse.json({ revoked: true });
  } catch { return NextResponse.json({ error: "Could not revoke invitation link." }, { status: 503 }); }
}
