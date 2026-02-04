import { Pool } from 'pg';

// Initialize connection pool with Railway Postgres
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

export interface AnalyticsEvent {
    session_id: string;
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

/**
 * Initialize the analytics table on startup
 */
export async function initAnalyticsTable(): Promise<void> {
    try {
        await pool.query(`
      CREATE TABLE IF NOT EXISTS analytics (
        id SERIAL PRIMARY KEY,
        session_id TEXT NOT NULL,
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

        // Add reel_interactions column to existing tables (migration for existing DBs)
        await pool.query(`
          ALTER TABLE analytics 
          ADD COLUMN IF NOT EXISTS reel_interactions JSONB DEFAULT '[]'
        `).catch(() => {
            // Column might already exist, ignore error
        });

        console.log('✅ Analytics table initialized');
    } catch (error) {
        console.error('❌ Failed to initialize analytics table:', error);
    }
}

/**
 * Save a complete analytics event to the database
 */
export async function saveAnalyticsEvent(event: AnalyticsEvent): Promise<void> {
    try {
        await pool.query(
            `INSERT INTO analytics 
       (session_id, device_type, user_prompt, query_type, timing, gemini, final_output, modifications, clicked_reels)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
            [
                event.session_id,
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
        console.log(`📊 Analytics saved for session: ${event.session_id}`);
    } catch (error) {
        console.error('❌ Failed to save analytics event:', error);
    }
}

/**
 * Track a user modification (updates existing session record)
 */
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
        console.log(`📊 Modification tracked for session: ${sessionId}`);
    } catch (error) {
        console.error('❌ Failed to track modification:', error);
    }
}

/**
 * Track when a user clicks on a reel (with details and watch time)
 */
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
        console.log(`📊 Reel interaction tracked: ${sessionId} (${reelId}, ${watchTimeSeconds}s)`);
    } catch (error) {
        console.error('❌ Failed to track reel click:', error);
    }
}

/**
 * Get all analytics events (for export/review)
 */
export async function getAllAnalytics(): Promise<any[]> {
    try {
        const result = await pool.query(`SELECT * FROM analytics ORDER BY timestamp DESC LIMIT 1000`);
        return result.rows;
    } catch (error) {
        console.error('❌ Failed to get analytics:', error);
        return [];
    }
}

/**
 * Get analytics for a specific session
 */
export async function getSessionAnalytics(sessionId: string): Promise<any | null> {
    try {
        const result = await pool.query(
            `SELECT * FROM analytics WHERE session_id = $1`,
            [sessionId]
        );
        return result.rows[0] || null;
    } catch (error) {
        console.error('❌ Failed to get session analytics:', error);
        return null;
    }
}
