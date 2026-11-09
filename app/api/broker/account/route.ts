import { NextRequest, NextResponse } from "next/server";
import { smartApiRequest } from "@/lib/angel-one/smartapi";
import { expiredSessionCookie, getSessionCookieName, openSession } from "@/lib/angel-one/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const resources = {
  funds: ["/rest/secure/angelbroking/user/v1/getRMS", "GET"],
  positions: ["/rest/secure/angelbroking/order/v1/getPosition", "GET"],
  holdings: ["/rest/secure/angelbroking/portfolio/v1/getHolding", "GET"],
  orders: ["/rest/secure/angelbroking/order/v1/getOrderBook", "GET"],
  trades: ["/rest/secure/angelbroking/order/v1/getTradeBook", "GET"],
} as const;

export async function GET(request: NextRequest) {
  const sessionValue = request.cookies.get(getSessionCookieName())?.value;
  const session = sessionValue ? openSession(sessionValue) : null;
  if (!session) {
    const response = NextResponse.json({ error: "Angel One account is not connected." }, { status: 401 });
    response.cookies.set(expiredSessionCookie());
    return response;
  }
  const resource = request.nextUrl.searchParams.get("resource") as keyof typeof resources | null;
  if (!resource || !(resource in resources)) {
    return NextResponse.json({ error: "Choose funds, positions, holdings, orders or trades." }, { status: 400 });
  }
  try {
    const [path, method] = resources[resource];
    const data = await smartApiRequest<unknown>(path, method, session);
    return NextResponse.json({ broker: "ANGEL_ONE", resource, data }, {
      headers: { "Cache-Control": "no-store, max-age=0" },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Broker data request failed";
    return NextResponse.json({ error: message.slice(0, 180) }, { status: 502 });
  }
}
