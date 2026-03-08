import type { Request } from 'express';
import { OAuth2Client, type TokenPayload } from 'google-auth-library';
import { Pool } from 'pg';
import { v4 as uuidv4 } from 'uuid';
import { createHash, randomBytes } from 'crypto';

const hasDbUrl = !!process.env.DATABASE_URL;
console.log(`Auth DB Pool. DATABASE_URL present: ${hasDbUrl}`);

if (!hasDbUrl) {
  console.warn('WARNING: DATABASE_URL is not set. Google auth sessions will not persist.');
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

const oauthClient = new OAuth2Client();
const AUTH_COOKIE_NAME = process.env.AUTH_COOKIE_NAME || 'planmate_session';
const SESSION_TTL_DAYS = Math.max(1, Number(process.env.AUTH_SESSION_TTL_DAYS || 30));
const SESSION_TTL_MS = SESSION_TTL_DAYS * 24 * 60 * 60 * 1000;

export interface AuthenticatedUser {
  id: string;
  email: string;
  emailVerified: boolean;
  name: string | null;
  avatarUrl: string | null;
}

function getGoogleAudiences(): string[] {
  const raw = process.env.GOOGLE_CLIENT_IDS || process.env.GOOGLE_CLIENT_ID || '';
  return raw
    .split(',')
    .map(value => value.trim())
    .filter(Boolean);
}

function hashSessionToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function parseCookies(cookieHeader?: string): Record<string, string> {
  if (!cookieHeader) return {};

  return cookieHeader
    .split(';')
    .map(part => part.trim())
    .filter(Boolean)
    .reduce<Record<string, string>>((acc, cookie) => {
      const separatorIndex = cookie.indexOf('=');
      if (separatorIndex === -1) return acc;

      const key = cookie.slice(0, separatorIndex).trim();
      const value = cookie.slice(separatorIndex + 1).trim();
      acc[key] = decodeURIComponent(value);
      return acc;
    }, {});
}

function mapUserRow(row: any): AuthenticatedUser {
  return {
    id: row.id,
    email: row.email,
    emailVerified: Boolean(row.email_verified),
    name: row.name ?? null,
    avatarUrl: row.avatar_url ?? null
  };
}

export function getAuthCookieName(): string {
  return AUTH_COOKIE_NAME;
}

export function getAuthCookieOptions() {
  const isProduction = process.env.NODE_ENV === 'production';

  return {
    httpOnly: true,
    secure: isProduction,
    sameSite: isProduction ? 'none' : 'lax',
    path: '/',
    maxAge: SESSION_TTL_MS
  } as const;
}

export async function initAuthTables(): Promise<void> {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id UUID PRIMARY KEY,
        google_sub TEXT UNIQUE NOT NULL,
        email TEXT NOT NULL,
        email_verified BOOLEAN DEFAULT FALSE,
        name TEXT,
        avatar_url TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW(),
        last_login_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS auth_sessions (
        id UUID PRIMARY KEY,
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        session_token_hash TEXT UNIQUE NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        expires_at TIMESTAMPTZ NOT NULL
      )
    `);

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_auth_sessions_token_hash
      ON auth_sessions(session_token_hash)
    `);

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_auth_sessions_user_id
      ON auth_sessions(user_id)
    `);

    await pool.query(`DELETE FROM auth_sessions WHERE expires_at <= NOW()`);

    console.log('Auth tables initialized');
  } catch (error) {
    console.error('Failed to initialize auth tables:', error);
  }
}

async function verifyGoogleCredential(credential: string): Promise<TokenPayload> {
  const audiences = getGoogleAudiences();

  if (audiences.length === 0) {
    throw new Error('GOOGLE_CLIENT_ID or GOOGLE_CLIENT_IDS must be configured on the backend');
  }

  const ticket = await oauthClient.verifyIdToken({
    idToken: credential,
    audience: audiences
  });

  const payload = ticket.getPayload();
  if (!payload?.sub || !payload.email) {
    throw new Error('Google credential did not include a usable identity');
  }

  return payload;
}

async function upsertGoogleUser(payload: TokenPayload): Promise<AuthenticatedUser> {
  const result = await pool.query(
    `
      INSERT INTO users (
        id,
        google_sub,
        email,
        email_verified,
        name,
        avatar_url,
        created_at,
        updated_at,
        last_login_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW(), NOW())
      ON CONFLICT (google_sub)
      DO UPDATE SET
        email = EXCLUDED.email,
        email_verified = EXCLUDED.email_verified,
        name = EXCLUDED.name,
        avatar_url = EXCLUDED.avatar_url,
        updated_at = NOW(),
        last_login_at = NOW()
      RETURNING id, email, email_verified, name, avatar_url
    `,
    [
      uuidv4(),
      payload.sub,
      payload.email,
      Boolean(payload.email_verified),
      payload.name ?? null,
      payload.picture ?? null
    ]
  );

  return mapUserRow(result.rows[0]);
}

async function createSession(userId: string): Promise<{ sessionToken: string; expiresAt: Date }> {
  const sessionToken = randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);

  await pool.query(
    `
      INSERT INTO auth_sessions (id, user_id, session_token_hash, expires_at)
      VALUES ($1, $2, $3, $4)
    `,
    [uuidv4(), userId, hashSessionToken(sessionToken), expiresAt.toISOString()]
  );

  return { sessionToken, expiresAt };
}

async function getUserForSessionToken(sessionToken: string): Promise<AuthenticatedUser | null> {
  const sessionTokenHash = hashSessionToken(sessionToken);
  const result = await pool.query(
    `
      SELECT
        u.id,
        u.email,
        u.email_verified,
        u.name,
        u.avatar_url,
        s.expires_at
      FROM auth_sessions s
      JOIN users u ON u.id = s.user_id
      WHERE s.session_token_hash = $1
      LIMIT 1
    `,
    [sessionTokenHash]
  );

  const row = result.rows[0];
  if (!row) {
    return null;
  }

  if (new Date(row.expires_at).getTime() <= Date.now()) {
    await pool.query(`DELETE FROM auth_sessions WHERE session_token_hash = $1`, [sessionTokenHash]);
    return null;
  }

  return mapUserRow(row);
}

async function revokeSessionToken(sessionToken: string): Promise<void> {
  await pool.query(`DELETE FROM auth_sessions WHERE session_token_hash = $1`, [hashSessionToken(sessionToken)]);
}

export async function signInWithGoogleCredential(
  credential: string
): Promise<{ user: AuthenticatedUser; sessionToken: string; expiresAt: Date }> {
  const googlePayload = await verifyGoogleCredential(credential);
  const user = await upsertGoogleUser(googlePayload);
  const session = await createSession(user.id);

  return {
    user,
    sessionToken: session.sessionToken,
    expiresAt: session.expiresAt
  };
}

export async function getAuthenticatedUserFromRequest(req: Request): Promise<AuthenticatedUser | null> {
  const cookies = parseCookies(req.headers.cookie);
  const sessionToken = cookies[AUTH_COOKIE_NAME];

  if (!sessionToken) {
    return null;
  }

  return getUserForSessionToken(sessionToken);
}

export async function revokeSessionFromRequest(req: Request): Promise<void> {
  const cookies = parseCookies(req.headers.cookie);
  const sessionToken = cookies[AUTH_COOKIE_NAME];

  if (!sessionToken) {
    return;
  }

  await revokeSessionToken(sessionToken);
}
