import { Pool } from 'pg';
import { v4 as uuidv4 } from 'uuid';

const hasDbUrl = !!process.env.DATABASE_URL;
console.log(`🔗 Share DB Pool. DATABASE_URL present: ${hasDbUrl}`);

if (!hasDbUrl) {
  console.warn('⚠️ WARNING: DATABASE_URL is not set. Share links will not persist.');
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

export interface SharedTripPayload {
  result: string;
  mode: 'route' | 'discovery';
  venues: any[];
  events?: any[];
  routes?: any[];
  alternativesMap?: Record<string, any[]>;
  originalPrompt?: string;
  createdBy?: string;
}

export async function initShareTable(): Promise<void> {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS shared_trips (
        id UUID PRIMARY KEY,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        payload JSONB NOT NULL
      )
    `);
    console.log('✅ Shared trips table initialized');
  } catch (error) {
    console.error('❌ Failed to initialize shared trips table:', error);
  }
}

export async function createSharedTrip(payload: SharedTripPayload): Promise<string> {
  const id = uuidv4();
  await pool.query(
    `INSERT INTO shared_trips (id, payload) VALUES ($1, $2)`,
    [id, JSON.stringify(payload)]
  );
  return id;
}

export async function getSharedTrip(id: string): Promise<SharedTripPayload | null> {
  const result = await pool.query(
    `SELECT payload FROM shared_trips WHERE id = $1`,
    [id]
  );
  return result.rows[0]?.payload || null;
}
