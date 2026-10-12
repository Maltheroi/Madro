import "server-only";
import postgres from "postgres";
import { getEnv } from "@/lib/env";

/**
 * Server-side PostgreSQL access.
 *
 * All user-facing queries run through `withUser`, which opens a transaction,
 * switches to the `authenticated` role and sets the verified user's id as the
 * JWT subject. Row Level Security therefore applies exactly as it would for a
 * Supabase client request, in addition to the explicit ownership checks in
 * the services. `withService` bypasses RLS and is reserved for catalog jobs.
 *
 * With Supabase, point DATABASE_URL at the transaction pooler (port 6543);
 * prepared statements are disabled for compatibility with it.
 */

type Sql = postgres.Sql;
export type Tx = postgres.TransactionSql;

const globalForDb = globalThis as unknown as { __madroSql?: Sql };

function getSql(): Sql {
  if (!globalForDb.__madroSql) {
    const env = getEnv();
    globalForDb.__madroSql = postgres(env.DATABASE_URL, {
      max: 5,
      idle_timeout: 20,
      prepare: false,
      ssl: env.DATABASE_SSL === "require" ? "require" : false,
      onnotice: () => {},
      types: {
        // Return numerics as JS numbers; all numeric columns are bounded well within float precision.
        numeric: { to: 1700, from: [1700], serialize: (x: number) => String(x), parse: (x: string) => Number(x) },
      },
    });
  }
  return globalForDb.__madroSql;
}

export async function withUser<T>(userId: string, fn: (tx: Tx) => Promise<T>): Promise<T> {
  if (!/^[0-9a-f-]{36}$/i.test(userId)) throw new Error("Invalid user id");
  const sql = getSql();
  return sql.begin(async (tx) => {
    await tx`select set_config('request.jwt.claims', ${JSON.stringify({ sub: userId, role: "authenticated" })}, true)`;
    await tx`set local role authenticated`;
    return fn(tx);
  }) as Promise<T>;
}

export async function withService<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
  const sql = getSql();
  return sql.begin(async (tx) => {
    await tx`set local role service_role`;
    return fn(tx);
  }) as Promise<T>;
}
