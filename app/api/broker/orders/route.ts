import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/server/session";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Hard stop: no live broker order can be transmitted by this release.
export async function POST(_request: NextRequest) {
  if (!await getSession()) return NextResponse.json({ error: "Application login required." }, { status: 401 });
  return NextResponse.json({ accepted: false, liveExecutionEnabled: false, error: "Live order placement is disabled until broker approval, account authorization, static-IP verification, risk limits, duplicate-order protection and reconciliation are independently reviewed." }, { status: 403 });
}
