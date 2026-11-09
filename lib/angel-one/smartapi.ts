import "server-only";
import os from "node:os";
import type { AngelOneSession } from "./session";

const API_ROOT = "https://apiconnect.angelone.in";

function networkIdentity() {
  const interfaces = os.networkInterfaces();
  for (const entries of Object.values(interfaces)) {
    for (const entry of entries ?? []) {
      if (entry.family === "IPv4" && !entry.internal && entry.mac && entry.mac !== "00:00:00:00:00:00") {
        return { localIp: entry.address, mac: entry.mac };
      }
    }
  }
  return {
    localIp: process.env.ANGELONE_CLIENT_LOCAL_IP ?? "",
    mac: process.env.ANGELONE_MAC_ADDRESS ?? "",
  };
}

export function smartApiHeaders(session?: AngelOneSession, clientCodeOverride?: string): HeadersInit {
  const apiKey = process.env.ANGELONE_API_KEY;
  const clientCode = session?.clientCode ?? clientCodeOverride ?? process.env.ANGELONE_CLIENT_CODE;
  const publicIp = process.env.ANGELONE_STATIC_IP;
  const identity = networkIdentity();
  if (!apiKey || !clientCode || !publicIp || !identity.localIp || !identity.mac) {
    throw new Error("Angel One server configuration is incomplete");
  }
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json",
    "X-PrivateKey": apiKey,
    "X-UserType": "USER",
    "X-SourceID": "WEB",
    "X-ClientLocalIP": identity.localIp,
    "X-ClientPublicIP": publicIp,
    "X-MACAddress": identity.mac,
  };
  if (session?.jwtToken) headers.Authorization = `Bearer ${session.jwtToken}`;
  return headers;
}

export async function smartApiRequest<T>(
  path: string,
  method: "GET" | "POST",
  session?: AngelOneSession,
  body?: unknown,
): Promise<T> {
  const response = await fetch(`${API_ROOT}${path}`, {
    method,
    headers: smartApiHeaders(session),
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: "no-store",
    signal: AbortSignal.timeout(12_000),
  });
  const payload = await response.json().catch(() => null) as
    | { status?: boolean; message?: string; errorcode?: string; data?: T }
    | null;
  if (!response.ok || !payload?.status) {
    const message = payload?.message || `Angel One request failed (HTTP ${response.status})`;
    throw new Error(message.slice(0, 180));
  }
  return payload.data as T;
}
