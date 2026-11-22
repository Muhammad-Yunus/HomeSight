import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema.ts';

let pool: Pool | null = null;
let dbInstance: NodePgDatabase<typeof schema> | null = null;

interface DbParams {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
  useSsl: boolean;
}

function getDbParams(): DbParams | null {
  const host = process.env.DB_HOST?.trim();
  const user = process.env.DB_USER?.trim();
  const password = process.env.DB_PASSWORD;
  const database = process.env.DB_NAME?.trim() || 'postgres';
  const port = Number(process.env.DB_PORT || 5432);

  if (!host || !user || !password) {
    return null;
  }

  const isLocal = host === 'localhost' || host === '127.0.0.1';
  const useSsl =
    process.env.DB_SSL !== undefined
      ? process.env.DB_SSL !== 'false'
      : !isLocal || host.includes('supabase.com');

  return { host, port, database, user, password, useSsl };
}

export function isDbConfigured(): boolean {
  return getDbParams() !== null;
}

export function getDb(): NodePgDatabase<typeof schema> {
  if (dbInstance) return dbInstance;
  const params = getDbParams();
  if (!params) {
    throw new Error('DB_HOST, DB_USER, and DB_PASSWORD are not configured in environment variables.');
  }

  pool = new Pool({
    host: params.host,
    port: params.port,
    database: params.database,
    user: params.user,
    password: params.password,
    ssl: params.useSsl ? { rejectUnauthorized: false } : undefined,
    max: 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000,
  });

  dbInstance = drizzle(pool, { schema });
  return dbInstance;
}

export async function testDbConnection(): Promise<boolean> {
  try {
    if (!isDbConfigured()) return false;
    getDb();
    if (!pool) return false;
    await pool.query('SELECT 1');
    return true;
  } catch (err) {
    console.error('[DB] Connection check failed:', (err as Error).message);
    return false;
  }
}

export { schema };
