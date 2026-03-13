import { Pool } from 'pg';
import { v4 as uuidv4 } from 'uuid';

const hasDbUrl = !!process.env.DATABASE_URL;
console.log(`Trips DB Pool. DATABASE_URL present: ${hasDbUrl}`);

if (!hasDbUrl) {
  console.warn('WARNING: DATABASE_URL is not set. User trips will not persist.');
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

export interface UserTripPayload {
  tripId?: string;
  result: string;
  mode: 'route' | 'discovery';
  venues: any[];
  events?: any[];
  routes?: any[];
  alternativesMap?: Record<string, any[]>;
  originalPrompt?: string;
  createdBy?: string;
}

export interface SavedTripSummary {
  id: string;
  title: string;
  mode: 'route' | 'discovery';
  venueCount: number;
  originalPrompt: string;
  createdAt: string;
  updatedAt: string;
}

export interface AdminTripSummary extends SavedTripSummary {
  userId: string;
  ownerEmail: string | null;
  ownerName: string | null;
  sharedCount: number;
}

export interface AdminTripPayload extends UserTripPayload {
  tripId: string;
  userId: string;
  ownerEmail: string | null;
  ownerName: string | null;
}

function buildTripTitle(payload: UserTripPayload): string {
  const fromPrompt = payload.originalPrompt?.trim();
  if (fromPrompt) {
    return fromPrompt.slice(0, 120);
  }

  const firstVenue = payload.venues?.[0]?.name;
  if (firstVenue) {
    return `Trip starting at ${firstVenue}`;
  }

  const fromResult = payload.result?.replace(/\*\*/g, '').trim();
  if (fromResult) {
    return fromResult.split('\n')[0].slice(0, 120);
  }

  return 'Untitled itinerary';
}

function countTripVenues(payload: any): number {
  const venues = Array.isArray(payload?.venues) ? payload.venues : [];
  return venues.filter((venue: any) => venue?.placeId !== 'user-location').length;
}

function mapSummary(row: any): SavedTripSummary {
  return {
    id: row.id,
    title: row.title,
    mode: row.payload?.mode || 'discovery',
    venueCount: countTripVenues(row.payload),
    originalPrompt: row.payload?.originalPrompt || '',
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function mapAdminSummary(row: any): AdminTripSummary {
  return {
    ...mapSummary(row),
    userId: row.user_id,
    ownerEmail: row.owner_email || null,
    ownerName: row.owner_name || null,
    sharedCount: Number(row.shared_count) || 0
  };
}

export async function initUserTripsTable(): Promise<void> {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS user_trips (
        id UUID PRIMARY KEY,
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        title TEXT NOT NULL,
        payload JSONB NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_user_trips_user_id
      ON user_trips(user_id)
    `);

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_user_trips_updated_at
      ON user_trips(updated_at DESC)
    `);

    console.log('User trips table initialized');
  } catch (error) {
    console.error('Failed to initialize user trips table:', error);
  }
}

export async function saveUserTrip(
  userId: string,
  payload: UserTripPayload,
  tripId?: string
): Promise<{ tripId: string; tripSummary: SavedTripSummary }> {
  const title = buildTripTitle(payload);
  const serializedPayload = JSON.stringify(payload);

  if (tripId) {
    const updateResult = await pool.query(
      `
        UPDATE user_trips
        SET title = $3,
            payload = $4,
            updated_at = NOW()
        WHERE id = $1 AND user_id = $2
        RETURNING id, title, payload, created_at, updated_at
      `,
      [tripId, userId, title, serializedPayload]
    );

    if (updateResult.rows[0]) {
      return {
        tripId,
        tripSummary: mapSummary(updateResult.rows[0])
      };
    }
  }

  const normalizedTripId = uuidv4();
  const result = await pool.query(
    `
      INSERT INTO user_trips (id, user_id, title, payload, created_at, updated_at)
      VALUES ($1, $2, $3, $4, NOW(), NOW())
      RETURNING id, title, payload, created_at, updated_at
    `,
    [normalizedTripId, userId, title, serializedPayload]
  );

  return {
    tripId: normalizedTripId,
    tripSummary: mapSummary(result.rows[0])
  };
}

export async function getUserTripSummaries(userId: string): Promise<SavedTripSummary[]> {
  const result = await pool.query(
    `
      SELECT id, title, payload, created_at, updated_at
      FROM user_trips
      WHERE user_id = $1
      ORDER BY updated_at DESC
      LIMIT 100
    `,
    [userId]
  );

  return result.rows.map(mapSummary);
}

export async function getRecentTripSummaries(limit = 50): Promise<AdminTripSummary[]> {
  const result = await pool.query(
    `
      SELECT
        ut.id,
        ut.user_id,
        ut.title,
        ut.payload,
        ut.created_at,
        ut.updated_at,
        u.email AS owner_email,
        u.name AS owner_name,
        COALESCE(shared.share_count, 0)::int AS shared_count
      FROM user_trips ut
      LEFT JOIN users u ON u.id = ut.user_id
      LEFT JOIN (
        SELECT payload->>'tripId' AS trip_id, COUNT(*)::int AS share_count
        FROM shared_trips
        WHERE payload ? 'tripId'
        GROUP BY payload->>'tripId'
      ) shared ON shared.trip_id = ut.id::text
      ORDER BY ut.updated_at DESC
      LIMIT $1
    `,
    [limit]
  );

  return result.rows.map(mapAdminSummary);
}

export async function getUserTripById(userId: string, tripId: string): Promise<UserTripPayload | null> {
  const result = await pool.query(
    `
      SELECT id, payload
      FROM user_trips
      WHERE id = $1 AND user_id = $2
      LIMIT 1
    `,
    [tripId, userId]
  );

  if (!result.rows[0]) {
    return null;
  }

  return {
    ...result.rows[0].payload,
    tripId: result.rows[0].id
  };
}

export async function getAnyUserTripById(tripId: string): Promise<AdminTripPayload | null> {
  const result = await pool.query(
    `
      SELECT
        ut.id,
        ut.user_id,
        ut.payload,
        u.email AS owner_email,
        u.name AS owner_name
      FROM user_trips ut
      LEFT JOIN users u ON u.id = ut.user_id
      WHERE ut.id = $1
      LIMIT 1
    `,
    [tripId]
  );

  const row = result.rows[0];
  if (!row) {
    return null;
  }

  return {
    ...row.payload,
    tripId: row.id,
    userId: row.user_id,
    ownerEmail: row.owner_email || null,
    ownerName: row.owner_name || null
  };
}

export async function updateUserTripReels(
  userId: string,
  tripId: string,
  reelsMap: Record<string, any[]>
): Promise<{ tripId: string; tripSummary: SavedTripSummary; payload: UserTripPayload } | null> {
  const existingTrip = await getUserTripById(userId, tripId);
  if (!existingTrip) {
    return null;
  }

  const updatedPayload: UserTripPayload = {
    ...existingTrip,
    venues: Array.isArray(existingTrip.venues)
      ? existingTrip.venues.map((venue: any) => {
          if (!venue?.placeId || venue.placeId === 'user-location') {
            return venue;
          }

          const instagramReels = reelsMap[venue.placeId];
          if (!instagramReels) {
            return venue;
          }

          return {
            ...venue,
            instagramReels
          };
        })
      : []
  };

  const result = await saveUserTrip(userId, updatedPayload, tripId);
  return {
    ...result,
    payload: {
      ...updatedPayload,
      tripId
    }
  };
}
