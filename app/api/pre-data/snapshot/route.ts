import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/server/session";
import { ensureTradingStateTable } from "@/lib/server/neon";
import { listBrokerAccountsWithSessions, accountSession } from "@/lib/angel-one/account-store";
import { openSession } from "@/lib/angel-one/session";
import { smartApiRequest } from "@/lib/angel-one/smartapi";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Row = Record<string, unknown>;
function numeric(row: Row, keys: string[]) {
  for (const key of keys) {
    const value = row[key];
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) return Number(value);
  }
  return null;
}
function rowsFrom(value: unknown): Row[] {
  return Array.isArray(value) ? value.filter((x): x is Row => Boolean(x) && typeof x === "object") : [];
}
function fundsValue(data: unknown) {
  if (!data || typeof data !== "object") return null;
  return numeric(data as Row, ["net", "netAmount", "availablecash", "availableCash", "available_balance"]);
}
function positionPnl(data: unknown) {
  return rowsFrom(data).reduce((sum, row) => sum + (numeric(row, ["pnl", "netpnl", "netPnl", "realised", "realized"]) ?? 0), 0);
}
function tradingDate() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}
async function capture() {
  const accounts = await listBrokerAccountsWithSessions();
  const connected = accounts.map(account => ({ account, session: accountSession(account, openSession) })).filter((item): item is { account: (typeof accounts)[number]; session: NonNullable<ReturnType<typeof accountSession>> } => Boolean(item.session));
  if (!connected.length) throw new Error("No authenticated Angel One Master or Follower accounts are connected.");
  let openingBalance = 0, dailyPnl = 0, count = 0;
  for (const { session } of connected) {
    const [rms, positions] = await Promise.all([
      smartApiRequest<unknown>("/rest/secure/angelbroking/user/v1/getRMS", "GET", session),
      smartApiRequest<unknown>("/rest/secure/angelbroking/order/v1/getPosition", "GET", session),
    ]);
    const balance = fundsValue(rms);
    if (balance === null) throw new Error("Angel One returned an unrecognized funds response; no snapshot was saved.");
    openingBalance += balance;
    dailyPnl += positionPnl(positions);
    count += 1;
  }
  const currentBalance = openingBalance + dailyPnl;
  const sql = await ensureTradingStateTable();
  const date = tradingDate();
  await sql`INSERT INTO eagle_trades_daily_snapshots (trading_date, opening_balance, current_balance, daily_pnl, accounts_count)
    VALUES (${date}::date, ${openingBalance}, ${currentBalance}, ${dailyPnl}, ${count})
    ON CONFLICT (trading_date) DO UPDATE SET current_balance = EXCLUDED.current_balance,
    daily_pnl = EXCLUDED.daily_pnl, accounts_count = EXCLUDED.accounts_count, captured_at = now()`;
  return { date, openingBalance, currentBalance, dailyPnl, accountsCount: count };
}
export async function POST(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  try { return NextResponse.json({ ok: true, snapshot: await capture() }); }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Snapshot failed." }, { status: 503 }); }
}
export async function GET() {
  if (!await getSession()) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  try {
    const sql = await ensureTradingStateTable();
    const rows = await sql`SELECT trading_date, opening_balance, current_balance, daily_pnl, accounts_count, captured_at FROM eagle_trades_daily_snapshots ORDER BY trading_date DESC LIMIT 370`;
    return NextResponse.json({ rows: rows.map((row: Row) => ({ date: String(row.trading_date), openingBalance: Number(row.opening_balance), currentBalance: Number(row.current_balance), dailyPnl: Number(row.daily_pnl), accountsCount: Number(row.accounts_count), capturedAt: row.captured_at })) });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Could not load PRE DATA." }, { status: 503 }); }
}
