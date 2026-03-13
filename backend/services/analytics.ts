import { Pool } from 'pg';

const hasDbUrl = !!process.env.DATABASE_URL;
console.log(`DB Pool initialized for analytics. DATABASE_URL present: ${hasDbUrl}`);

if (!hasDbUrl) {
    console.warn('WARNING: DATABASE_URL is not set. Analytics will not persist.');
}

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

export interface AnalyticsEvent {
    session_id: string;
    trip_id?: string;
    timestamp?: Date;
    device_type: 'mobile' | 'desktop';
    user_prompt: string;
    query_type: 'discovery' | 'planning';
    timing: {
        intent_classification: number;
        plan_creation: number;
        venue_enrichment: number;
        route_optimization: number;
        video_enrichment: number;
        total: number;
    };
    gemini: {
        input_tokens: number;
        output_tokens: number;
        raw_output: object;
    };
    final_output: {
        venues: object[];
        alternatives: object[];
        venue_count: number;
    };
    modifications: {
        count: number;
        prompts: string[];
    };
    clicked_reels: boolean;
}

export interface AnalyticsDashboardSummary {
    totalPlans: number;
    uniqueSessions: number;
    mobilePlans: number;
    desktopPlans: number;
    avgExecutionTimeMs: number;
    totalModificationCount: number;
    avgModificationCount: number;
    reelClickRate: number;
    totalReelInteractions: number;
    savedTrips: number;
    sharedTrips: number;
    totalUsers: number;
}

export interface RecentAnalyticsEventSummary {
    id: number;
    sessionId: string;
    tripId?: string;
    timestamp: string;
    deviceType: string | null;
    userPrompt: string;
    queryType: string | null;
    totalTimeMs: number;
    modificationCount: number;
    clickedReels: boolean;
    reelInteractionCount: number;
}

export interface TopPromptSummary {
    prompt: string;
    count: number;
    lastSeenAt: string;
}

function toFiniteNumber(value: unknown): number {
    const normalized = Number(value);
    return Number.isFinite(normalized) ? normalized : 0;
}

export async function initAnalyticsTable(): Promise<void> {
    try {
        await pool.query(`
      CREATE TABLE IF NOT EXISTS analytics (
        id SERIAL PRIMARY KEY,
        session_id TEXT NOT NULL,
        trip_id UUID,
        timestamp TIMESTAMPTZ DEFAULT NOW(),
        device_type TEXT,
        user_prompt TEXT,
        query_type TEXT,
        timing JSONB,
        gemini JSONB,
        final_output JSONB,
        modifications JSONB DEFAULT '{"count": 0, "prompts": []}',
        clicked_reels BOOLEAN DEFAULT FALSE,
        reel_interactions JSONB DEFAULT '[]'
      )
    `);

        await pool.query(`
          ALTER TABLE analytics
          ADD COLUMN IF NOT EXISTS reel_interactions JSONB DEFAULT '[]'
        `).catch(() => undefined);

        await pool.query(`
          ALTER TABLE analytics
          ADD COLUMN IF NOT EXISTS trip_id UUID
        `).catch(() => undefined);

        console.log('Analytics table initialized');
    } catch (error) {
        console.error('Failed to initialize analytics table:', error);
    }
}

export async function saveAnalyticsEvent(event: AnalyticsEvent): Promise<void> {
    try {
        await pool.query(
            `INSERT INTO analytics
       (session_id, trip_id, device_type, user_prompt, query_type, timing, gemini, final_output, modifications, clicked_reels)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
            [
                event.session_id,
                event.trip_id || null,
                event.device_type,
                event.user_prompt,
                event.query_type,
                JSON.stringify(event.timing),
                JSON.stringify(event.gemini),
                JSON.stringify(event.final_output),
                JSON.stringify(event.modifications),
                event.clicked_reels
            ]
        );
        console.log(`Analytics saved for session: ${event.session_id}`);
    } catch (error) {
        console.error('Failed to save analytics event:', error);
    }
}

export async function trackModification(sessionId: string, prompt: string): Promise<void> {
    try {
        await pool.query(
            `UPDATE analytics
       SET modifications = jsonb_set(
         jsonb_set(modifications, '{count}', (COALESCE((modifications->>'count')::int, 0) + 1)::text::jsonb),
         '{prompts}', COALESCE(modifications->'prompts', '[]'::jsonb) || $2::jsonb
       )
       WHERE session_id = $1`,
            [sessionId, JSON.stringify([prompt])]
        );
        console.log(`Modification tracked for session: ${sessionId}`);
    } catch (error) {
        console.error('Failed to track modification:', error);
    }
}

export async function trackReelClick(
    sessionId: string,
    reelId?: string,
    reelUrl?: string,
    watchTimeSeconds?: number
): Promise<void> {
    try {
        const reelEntry = {
            reel_id: reelId || 'unknown',
            reel_url: reelUrl || '',
            watch_time_seconds: watchTimeSeconds || 0,
            clicked_at: new Date().toISOString()
        };

        await pool.query(
            `UPDATE analytics
       SET clicked_reels = TRUE,
           reel_interactions = COALESCE(reel_interactions, '[]'::jsonb) || $2::jsonb
       WHERE session_id = $1`,
            [sessionId, JSON.stringify([reelEntry])]
        );
        console.log(`Reel interaction tracked: ${sessionId} (${reelId}, ${watchTimeSeconds}s)`);
    } catch (error) {
        console.error('Failed to track reel click:', error);
    }
}

export async function getAllAnalytics(): Promise<any[]> {
    try {
        const result = await pool.query(`SELECT * FROM analytics ORDER BY timestamp DESC LIMIT 1000`);
        return result.rows;
    } catch (error) {
        console.error('Failed to get analytics:', error);
        return [];
    }
}

export async function getSessionAnalytics(sessionId: string): Promise<any | null> {
    try {
        const result = await pool.query(
            `SELECT * FROM analytics WHERE session_id = $1`,
            [sessionId]
        );
        return result.rows[0] || null;
    } catch (error) {
        console.error('Failed to get session analytics:', error);
        return null;
    }
}

export async function getAnalyticsDashboardSummary(): Promise<AnalyticsDashboardSummary> {
    try {
        const result = await pool.query(`
      SELECT
        COUNT(*)::int AS total_plans,
        COUNT(DISTINCT session_id)::int AS unique_sessions,
        COUNT(*) FILTER (WHERE device_type = 'mobile')::int AS mobile_plans,
        COUNT(*) FILTER (WHERE device_type = 'desktop')::int AS desktop_plans,
        COALESCE(AVG(CASE WHEN timing ? 'total' THEN (timing->>'total')::numeric END), 0) AS avg_execution_time_ms,
        COALESCE(SUM(COALESCE((modifications->>'count')::int, 0)), 0)::int AS total_modification_count,
        COALESCE(AVG(COALESCE((modifications->>'count')::numeric, 0)), 0) AS avg_modification_count,
        COALESCE(AVG(CASE WHEN clicked_reels THEN 100 ELSE 0 END), 0) AS reel_click_rate,
        COALESCE(SUM(CASE WHEN jsonb_typeof(reel_interactions) = 'array' THEN jsonb_array_length(reel_interactions) ELSE 0 END), 0)::int AS total_reel_interactions,
        (SELECT COUNT(*)::int FROM user_trips) AS saved_trips,
        (SELECT COUNT(*)::int FROM shared_trips) AS shared_trips,
        (SELECT COUNT(*)::int FROM users) AS total_users
      FROM analytics
    `);

        const row = result.rows[0] || {};
        return {
            totalPlans: toFiniteNumber(row.total_plans),
            uniqueSessions: toFiniteNumber(row.unique_sessions),
            mobilePlans: toFiniteNumber(row.mobile_plans),
            desktopPlans: toFiniteNumber(row.desktop_plans),
            avgExecutionTimeMs: Math.round(toFiniteNumber(row.avg_execution_time_ms)),
            totalModificationCount: toFiniteNumber(row.total_modification_count),
            avgModificationCount: Number(toFiniteNumber(row.avg_modification_count).toFixed(2)),
            reelClickRate: Number(toFiniteNumber(row.reel_click_rate).toFixed(1)),
            totalReelInteractions: toFiniteNumber(row.total_reel_interactions),
            savedTrips: toFiniteNumber(row.saved_trips),
            sharedTrips: toFiniteNumber(row.shared_trips),
            totalUsers: toFiniteNumber(row.total_users)
        };
    } catch (error) {
        console.error('Failed to build analytics dashboard summary:', error);
        return {
            totalPlans: 0,
            uniqueSessions: 0,
            mobilePlans: 0,
            desktopPlans: 0,
            avgExecutionTimeMs: 0,
            totalModificationCount: 0,
            avgModificationCount: 0,
            reelClickRate: 0,
            totalReelInteractions: 0,
            savedTrips: 0,
            sharedTrips: 0,
            totalUsers: 0
        };
    }
}

export async function getRecentAnalyticsEvents(limit = 20): Promise<RecentAnalyticsEventSummary[]> {
    try {
        const result = await pool.query(
            `
        SELECT
          id,
          session_id,
          trip_id,
          timestamp,
          device_type,
          user_prompt,
          query_type,
          timing,
          modifications,
          clicked_reels,
          reel_interactions
        FROM analytics
        ORDER BY timestamp DESC
        LIMIT $1
      `,
            [limit]
        );

        return result.rows.map((row: any) => ({
            id: toFiniteNumber(row.id),
            sessionId: row.session_id,
            tripId: row.trip_id || undefined,
            timestamp: row.timestamp,
            deviceType: row.device_type || null,
            userPrompt: row.user_prompt || '',
            queryType: row.query_type || null,
            totalTimeMs: toFiniteNumber(row.timing?.total),
            modificationCount: toFiniteNumber(row.modifications?.count),
            clickedReels: Boolean(row.clicked_reels),
            reelInteractionCount: Array.isArray(row.reel_interactions) ? row.reel_interactions.length : 0
        }));
    } catch (error) {
        console.error('Failed to get recent analytics events:', error);
        return [];
    }
}

export async function getTopAnalyticsPrompts(limit = 10): Promise<TopPromptSummary[]> {
    try {
        const result = await pool.query(
            `
        SELECT
          user_prompt,
          COUNT(*)::int AS usage_count,
          MAX(timestamp) AS last_seen_at
        FROM analytics
        WHERE NULLIF(BTRIM(user_prompt), '') IS NOT NULL
        GROUP BY user_prompt
        ORDER BY usage_count DESC, last_seen_at DESC
        LIMIT $1
      `,
            [limit]
        );

        return result.rows.map((row: any) => ({
            prompt: row.user_prompt,
            count: toFiniteNumber(row.usage_count),
            lastSeenAt: row.last_seen_at
        }));
    } catch (error) {
        console.error('Failed to get top analytics prompts:', error);
        return [];
    }
}
