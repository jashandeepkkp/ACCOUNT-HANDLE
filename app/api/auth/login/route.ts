import { NextRequest, NextResponse } from "next/server";
import { createSession, SESSION_COOKIE } from "@/lib/server/session";
import { timingSafeEqual } from "node:crypto";

export const runtime = "nodejs";

function safeEqual(left: string, right: string) {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(request: NextRequest) {
  const expectedUsername = process.env.APP_USERNAME?.trim();
  const expectedPassword = process.env.APP_PASSWORD?.trim();
  const sessionSecret = process.env.SESSION_SECRET;
  if (!expectedUsername || !expectedPassword || !sessionSecret || sessionSecret.length < 32) {
    return NextResponse.json({ error: "Login is not configured. Add APP_USERNAME, APP_PASSWORD and a 32+ character SESSION_SECRET in Render." }, { status: 503 });
  }

  let body: { username?: string; password?: string };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid request." }, { status: 400 }); }
  const username = typeof body.username === "string" ? body.username.trim() : "";
  const password = typeof body.password === "string" ? body.password : "";
  if (!safeEqual(username, expectedUsername) || !safeEqual(password, expectedPassword)) {
    return NextResponse.json({ error: "Incorrect username or password." }, { status: 401 });
  }

  const token = await createSession(expectedUsername);
  const response = NextResponse.json({ ok: true, username: expectedUsername });
  response.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: 60 * 60 * 12,
  });
  return response;
}
