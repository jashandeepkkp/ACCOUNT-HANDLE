import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";

const COOKIE = "eagle_trades_follower_session";
function secret() {
  const value = process.env.SESSION_SECRET;
  if (!value || value.length < 32) throw new Error("SESSION_SECRET must be at least 32 characters.");
  return new TextEncoder().encode(value);
}
export async function createFollowerSession(followerId: string) {
  return new SignJWT({ role: "follower", followerId })
    .setProtectedHeader({ alg: "HS256" }).setIssuedAt().setExpirationTime("10h").sign(secret());
}
export async function getFollowerSession() {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret());
    if (payload.role !== "follower" || typeof payload.followerId !== "string" || !/^[a-f0-9]{32}$/.test(payload.followerId)) return null;
    return { followerId: payload.followerId };
  } catch { return null; }
}
export function setFollowerCookie(response: import("next/server").NextResponse, token: string) {
  response.cookies.set(COOKIE, token, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "strict", path: "/api/follower", maxAge: 10 * 60 * 60 });
}
export function clearFollowerCookie(response: import("next/server").NextResponse) {
  response.cookies.set(COOKIE, "", { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "strict", path: "/api/follower", maxAge: 0 });
}
