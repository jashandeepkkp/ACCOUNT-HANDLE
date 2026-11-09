import { NextResponse } from "next/server";
import { getSession } from "@/lib/server/session";

export const runtime = "nodejs";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ authenticated: false }, { status: 401 });
  return NextResponse.json({ authenticated: true, username: session.username });
}
