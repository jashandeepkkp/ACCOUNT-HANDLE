import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/server/session";
import { ensureTradingStateTable } from "@/lib/server/neon";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const columns = ["positions", "order_events", "follower_accounts"] as const;

export async function GET() {
  if (!await getSession()) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  try {
    const sql = await ensureTradingStateTable();
    const rows = await sql`SELECT positions, order_events, follower_accounts, updated_at FROM eagle_trades_state WHERE id = 'owner' LIMIT 1`;
    const row = rows[0] as Record<string, unknown> | undefined;
    return NextResponse.json({
      positions: row?.positions ?? null,
      order_events: row?.order_events ?? null,
      follower_accounts: row?.follower_accounts ?? null,
      updated_at: row?.updated_at ?? null,
    });
  } catch (error) {
    console.error("Neon state load failed:", error);
    return NextResponse.json({ error: "Cloud database unavailable. Check DATABASE_URL." }, { status: 503 });
  }
}

export async function PUT(request: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  let body: Record<string, unknown>;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid JSON." }, { status: 400 }); }
  const changed = columns.filter(column => Object.prototype.hasOwnProperty.call(body, column));
  if (!changed.length) return NextResponse.json({ error: "No supported state fields supplied." }, { status: 400 });
  for (const column of changed) {
    if (!Array.isArray(body[column])) return NextResponse.json({ error: `${column} must be an array.` }, { status: 400 });
    if ((body[column] as unknown[]).length > 10000) return NextResponse.json({ error: "State payload is too large." }, { status: 413 });
  }

  try {
    const sql = await ensureTradingStateTable();
    for (const column of changed) {
      const value = JSON.stringify(body[column]);
      if (column === "positions") {
        await sql`INSERT INTO eagle_trades_state (id, positions) VALUES ('owner', ${value}::jsonb) ON CONFLICT (id) DO UPDATE SET positions = EXCLUDED.positions, updated_at = now()`;
      } else if (column === "order_events") {
        await sql`INSERT INTO eagle_trades_state (id, order_events) VALUES ('owner', ${value}::jsonb) ON CONFLICT (id) DO UPDATE SET order_events = EXCLUDED.order_events, updated_at = now()`;
      } else {
        await sql`INSERT INTO eagle_trades_state (id, follower_accounts) VALUES ('owner', ${value}::jsonb) ON CONFLICT (id) DO UPDATE SET follower_accounts = EXCLUDED.follower_accounts, updated_at = now()`;
      }
    }
    for (const column of changedScalars) {
      await sql`INSERT INTO eagle_trades_state (id, pre_data_starting_balance) VALUES ('owner', ${body[column] as number}) ON CONFLICT (id) DO UPDATE SET pre_data_starting_balance = EXCLUDED.pre_data_starting_balance, updated_at = now()`;
    }
    return NextResponse.json({ ok: true, saved: [...changed, ...changedScalars] });
  } catch (error) {
    console.error("Neon state save failed:", error);
    return NextResponse.json({ error: "Could not save cloud data. Check Neon DATABASE_URL." }, { status: 503 });
  }
}
