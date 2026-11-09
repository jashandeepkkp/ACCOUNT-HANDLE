import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";

export async function middleware(request: NextRequest) {
  if (!request.nextUrl.pathname.startsWith("/api/broker/")) return NextResponse.next();

  const token = request.cookies.get("eagle_trades_session")?.value;
  const secret = process.env.SESSION_SECRET;
  if (!token || !secret || secret.length < 32) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }
  try {
    await jwtVerify(token, new TextEncoder().encode(secret));
    return NextResponse.next();
  } catch {
    return NextResponse.json({ error: "Session expired. Please log in again." }, { status: 401 });
  }
}

export const config = {
  matcher: ["/api/broker/:path*"],
};
