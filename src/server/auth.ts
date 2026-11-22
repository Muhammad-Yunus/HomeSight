import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import type { Request, Response, NextFunction } from 'express';
import { eq, and } from 'drizzle-orm';
import { getDb, isDbConfigured, schema } from '../db/index.ts';

const EPHEMERAL_JWT_SECRET = crypto.randomBytes(32).toString('hex');

function getJwtSecret(): string {
  const envSecret = process.env.JWT_SECRET?.trim();
  return envSecret && envSecret.length >= 16 ? envSecret : EPHEMERAL_JWT_SECRET;
}

export interface AuthUserPayload {
  userId: number;
  email: string;
  name: string;
  role: string;
}

export interface AuthenticatedRequest extends Request {
  user?: AuthUserPayload;
  ingestKeyName?: string;
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export function signUserToken(payload: AuthUserPayload): string {
  return jwt.sign(payload, getJwtSecret(), { expiresIn: '24h' });
}

export function verifyUserToken(token: string): AuthUserPayload | null {
  try {
    const decoded = jwt.verify(token, getJwtSecret()) as AuthUserPayload;
    if (!decoded || typeof decoded.userId !== 'number') return null;
    return decoded;
  } catch {
    return null;
  }
}

export function hashApiKey(rawKey: string): string {
  return crypto.createHash('sha256').update(rawKey).digest('hex');
}

export function generateRawApiKey(): { rawKey: string; prefix: string; keyHash: string } {
  const randomPart = crypto.randomBytes(24).toString('hex');
  const rawKey = `hs_ingest_${randomPart}`;
  return {
    rawKey,
    prefix: rawKey.slice(0, 18),
    keyHash: hashApiKey(rawKey),
  };
}

function timingSafeEquals(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

/**
 * Middleware 1: App User Auth (User-based Login via Bearer JWT)
 */
export function requireUserAuth(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): void {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Authentication required. Provide Bearer token.' });
    return;
  }

  const token = authHeader.slice('Bearer '.length).trim();
  const payload = verifyUserToken(token);
  if (!payload) {
    res.status(401).json({ error: 'Invalid or expired authentication token.' });
    return;
  }

  req.user = payload;
  next();
}

/**
 * Middleware 2: External Ingest API Auth (API Key ONLY — separated from user login)
 */
export async function requireIngestApiKey(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const headerKey =
    (typeof req.headers['x-api-key'] === 'string' ? req.headers['x-api-key'] : '') ||
    (typeof req.headers.authorization === 'string' &&
    req.headers.authorization.startsWith('ApiKey ')
      ? req.headers.authorization.slice('ApiKey '.length)
      : '');

  const rawKey = headerKey.trim();
  if (!rawKey) {
    res.status(401).json({
      error: 'Ingest API key required. Supply X-API-Key header or Authorization: ApiKey <key>.',
    });
    return;
  }

  const envIngestKey = process.env.INGEST_API_KEY?.trim();
  if (envIngestKey && envIngestKey.length > 0 && timingSafeEquals(rawKey, envIngestKey)) {
    req.ingestKeyName = 'env:INGEST_API_KEY';
    next();
    return;
  }

  if (isDbConfigured()) {
    try {
      const db = getDb();
      const keyHash = hashApiKey(rawKey);
      const [found] = await db
        .select()
        .from(schema.apiKeys)
        .where(and(eq(schema.apiKeys.keyHash, keyHash), eq(schema.apiKeys.isActive, true)))
        .limit(1);

      if (found) {
        req.ingestKeyName = found.name;
        // Update lastUsedAt asynchronously without blocking ingest latency
        db.update(schema.apiKeys)
          .set({ lastUsedAt: new Date() })
          .where(eq(schema.apiKeys.id, found.id))
          .catch(() => {});
        next();
        return;
      }
    } catch (err) {
      console.error('[Auth] API key lookup failed:', (err as Error).message);
    }
  }

  res.status(403).json({ error: 'Invalid or revoked ingest API key.' });
}
