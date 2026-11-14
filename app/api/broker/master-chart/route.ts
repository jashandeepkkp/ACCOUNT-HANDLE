import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/server/session";
import { listBrokerAccountsWithSessions, accountSession } from "@/lib/angel-one/account-store";
import { openSession } from "@/lib/angel-one/session";
import { smartApiRequest } from "@/lib/angel-one/smartapi";
import { searchInstruments } from "@/lib/angel-one/instrument-master";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Candle = [string, number, number, number, number, number];
const intervals = new Set(["ONE_MINUTE", "FIVE_MINUTE", "FIFTEEN_MINUTE", "THIRTY_MINUTE", "ONE_HOUR", "ONE_DAY"]);
function formatIndiaDate(date: Date) {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(date).replace(",", "");
}

export async function GET(request: NextRequest) {
  if (!await getSession()) return NextResponse.json({ error: "Application login required." }, { status: 401 });
  try {
    const symbol = (request.nextUrl.searchParams.get("symbol") ?? "").trim().toUpperCase();
    const exchange = (request.nextUrl.searchParams.get("exchange") ?? "NSE").trim().toUpperCase();
    const interval = (request.nextUrl.searchParams.get("interval") ?? "FIVE_MINUTE").trim().toUpperCase();
    if (!/^[A-Z0-9&._-]{1,40}$/.test(symbol) || !["NSE", "BSE"].includes(exchange) || !intervals.has(interval)) {
      return NextResponse.json({ error: "Choose a valid NSE/BSE symbol and chart interval." }, { status: 400 });
    }
    const accounts = await listBrokerAccountsWithSessions();
    const master = accounts.find(account => account.role === "MASTER" && account.id === "master");
    if (!master) return NextResponse.json({ error: "Connect your Angel One Master account to load its broker chart." }, { status: 409 });
    const session = accountSession(master, openSession);
    if (!session) return NextResponse.json({ error: "Angel One Master session expired. Reconnect the Master account." }, { status: 401 });
    const matches = await searchInstruments(exchange, symbol);
    const instrument = matches.find(item => item.symbol.toUpperCase() === symbol && item.exchange === exchange);
    if (!instrument) return NextResponse.json({ error: "This symbol is not an exact match in Angel One's current instrument master. Select a supported NSE/BSE cash instrument." }, { status: 404 });
    const now = new Date();
    const from = new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000);
    const data = await smartApiRequest<Candle[]>(
      "/rest/secure/angelbroking/historical/v1/getCandleData",
      "POST",
      session,
      { exchange, symboltoken: instrument.token, interval, fromdate: formatIndiaDate(from), todate: formatIndiaDate(now) },
    );
    if (!Array.isArray(data)) throw new Error("Angel One returned an invalid candle response.");
    const candles = data.map(row => {
      if (!Array.isArray(row) || row.length < 6) return null;
      const time = Math.floor(new Date(row[0]).getTime() / 1000);
      const values = row.slice(1, 6).map(Number);
      if (!Number.isFinite(time) || values.some(value => !Number.isFinite(value))) return null;
      return { time, open: values[0], high: values[1], low: values[2], close: values[3], volume: values[4] };
    }).filter((row): row is NonNullable<typeof row> => row !== null);
    return NextResponse.json({ source: "ANGEL_ONE_MASTER", symbol, exchange, token: instrument.token, interval, candles, fetchedAt: new Date().toISOString() }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not load Angel One Master chart." }, { status: 502 });
  }
}
