import 'dotenv/config';
import { defineConfig } from 'drizzle-kit';

function getDbCredentials() {
  const host = process.env.DB_HOST?.trim() || 'localhost';
  const port = Number(process.env.DB_PORT || 5432);
  const database = process.env.DB_NAME?.trim() || 'postgres';
  const user = process.env.DB_USER?.trim() || 'postgres';
  const password = process.env.DB_PASSWORD || '';
  const isLocal = host === 'localhost' || host === '127.0.0.1';
  const useSsl =
    process.env.DB_SSL !== undefined ? process.env.DB_SSL !== 'false' : !isLocal;

  return {
    host,
    port,
    user,
    password,
    database,
    ssl: useSsl ? { rejectUnauthorized: false } : false,
  };
}

export default defineConfig({
  schema: './src/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: getDbCredentials(),
});
