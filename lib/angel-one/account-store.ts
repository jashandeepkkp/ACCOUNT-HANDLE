import "server-only";
import { ensureTradingStateTable } from "@/lib/server/neon";
import type { AngelOneSession } from "./session";

export type BrokerAccountRole = "MASTER" | "FOLLOWER";
export type StoredBrokerAccount = {
  id: string;
  role: BrokerAccountRole;
  label: string;
  client_code_masked: string;
  encrypted_session: string;
  session_expires_at: string;
  authorized_for_copy: boolean;
};

export async function ensureBrokerAccountsTable() {
  const sql = await ensureTradingStateTable();
  await sql`
    CREATE TABLE IF NOT EXISTS eagle_trades_broker_accounts (
      id text PRIMARY KEY,
      role text NOT NULL CHECK (role IN ('MASTER','FOLLOWER')),
      label text NOT NULL,
      client_code_masked text NOT NULL,
      encrypted_session text NOT NULL,
      session_expires_at timestamptz NOT NULL,
      authorized_for_copy boolean NOT NULL DEFAULT false,
      updated_at timestamptz NOT NULL DEFAULT now()
    )
  `;
  return sql;
}

export function maskClientCode(code: string) {
  return code.length <= 4 ? "••••" : `${"•".repeat(Math.max(4, code.length - 4))}${code.slice(-4)}`;
}

export async function saveBrokerAccount(input: {
  id: string; role: BrokerAccountRole; label: string; clientCode: string;
  encryptedSession: string; expiresAt: number; authorizedForCopy: boolean;
}) {
  const sql = await ensureBrokerAccountsTable();
  await sql`
    INSERT INTO eagle_trades_broker_accounts
      (id, role, label, client_code_masked, encrypted_session, session_expires_at, authorized_for_copy, updated_at)
    VALUES
      (${input.id}, ${input.role}, ${input.label}, ${maskClientCode(input.clientCode)},
       ${input.encryptedSession}, to_timestamp(${input.expiresAt / 1000}),
       ${input.authorizedForCopy}, now())
    ON CONFLICT (id) DO UPDATE SET
      role = EXCLUDED.role, label = EXCLUDED.label,
      client_code_masked = EXCLUDED.client_code_masked,
      encrypted_session = EXCLUDED.encrypted_session,
      session_expires_at = EXCLUDED.session_expires_at,
      authorized_for_copy = EXCLUDED.authorized_for_copy,
      updated_at = now()
  `;
}

export async function getBrokerAccount(id: string) {
  const sql = await ensureBrokerAccountsTable();
  const rows = await sql`SELECT id, role, label, client_code_masked, encrypted_session, session_expires_at, authorized_for_copy FROM eagle_trades_broker_accounts WHERE id = ${id} LIMIT 1`;
  return rows[0] as StoredBrokerAccount | undefined;
}

export async function listBrokerAccountsWithSessions() {
  const sql = await ensureBrokerAccountsTable();
  const rows = await sql`SELECT id, role, label, client_code_masked, encrypted_session, session_expires_at, authorized_for_copy FROM eagle_trades_broker_accounts ORDER BY role, label`;
  return rows as StoredBrokerAccount[];
}

export async function listBrokerAccounts() {
  const sql = await ensureBrokerAccountsTable();
  const rows = await sql`SELECT id, role, label, client_code_masked, session_expires_at, authorized_for_copy FROM eagle_trades_broker_accounts ORDER BY role, label`;
  return rows as Array<Omit<StoredBrokerAccount, "encrypted_session">>;
}

export async function deleteBrokerAccount(id: string) {
  const sql = await ensureBrokerAccountsTable();
  await sql`DELETE FROM eagle_trades_broker_accounts WHERE id = ${id}`;
}

export function accountSession(account: StoredBrokerAccount, open: (value: string) => AngelOneSession | null) {
  const session = open(account.encrypted_session);
  if (!session || session.expiresAt <= Date.now()) return null;
  return session;
}
