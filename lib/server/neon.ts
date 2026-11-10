import { neon } from "@neondatabase/serverless";

export function getNeon() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not configured on the server.");
  return neon(url);
}

export async function ensureTradingStateTable() {
  const sql = getNeon();
  await sql`
    CREATE TABLE IF NOT EXISTS eagle_trades_state (
      id text PRIMARY KEY,
      positions jsonb NOT NULL DEFAULT '[]'::jsonb,
      order_events jsonb NOT NULL DEFAULT '[]'::jsonb,
      follower_accounts jsonb NOT NULL DEFAULT '[]'::jsonb,
      updated_at timestamptz NOT NULL DEFAULT now()
    )
  `;
  await sql`ALTER TABLE eagle_trades_state ADD COLUMN IF NOT EXISTS pre_data_starting_balance numeric NOT NULL DEFAULT 0`;
  return sql;
}
