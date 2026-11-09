import "server-only";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const COOKIE_NAME = "angelone_session";
const SESSION_TTL_SECONDS = 10 * 60 * 60;

export type AngelOneSession = {
  jwtToken: string;
  refreshToken: string;
  feedToken: string;
  clientCode: string;
  expiresAt: number;
};

function encryptionKey(): Buffer {
  const raw = process.env.ANGELONE_SESSION_ENCRYPTION_KEY ?? "";
  if (!/^[a-fA-F0-9]{64}$/.test(raw)) {
    throw new Error("ANGELONE_SESSION_ENCRYPTION_KEY must be 64 hexadecimal characters");
  }
  return Buffer.from(raw, "hex");
}

export function sealSession(session: AngelOneSession): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const encrypted = Buffer.concat([
    cipher.update(JSON.stringify(session), "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, encrypted]).toString("base64url");
}

export function openSession(value: string): AngelOneSession | null {
  try {
    const packed = Buffer.from(value, "base64url");
    if (packed.length < 29) return null;
    const iv = packed.subarray(0, 12);
    const tag = packed.subarray(12, 28);
    const encrypted = packed.subarray(28);
    const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), iv);
    decipher.setAuthTag(tag);
    const decoded = Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8");
    const session = JSON.parse(decoded) as AngelOneSession;
    if (!session.jwtToken || !session.clientCode || !Number.isFinite(session.expiresAt)) return null;
    if (session.expiresAt <= Date.now()) return null;
    return session;
  } catch {
    return null;
  }
}

export function sessionCookie(value: string) {
  return {
    name: COOKIE_NAME,
    value,
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict" as const,
    path: "/api/broker",
    maxAge: SESSION_TTL_SECONDS,
  };
}

export function expiredSessionCookie() {
  return {
    name: COOKIE_NAME,
    value: "",
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict" as const,
    path: "/api/broker",
    maxAge: 0,
  };
}

export function getSessionCookieName() {
  return COOKIE_NAME;
}

export function sessionExpiry() {
  return Date.now() + SESSION_TTL_SECONDS * 1000;
}
