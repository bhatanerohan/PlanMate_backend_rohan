// backend/services/reels-job-store.ts
// In-memory store for background Apify reel-fetching jobs.
// Lifecycle:  startReelsJob() → background poll → getReelsJobStatus() from frontend polling endpoint.

import { getInstagramClient, type InstagramReel } from './api-clients/instagram.js';

interface ReelsJob {
    sessionId: string;
    status: 'pending' | 'ready' | 'failed';
    reelsMap: Record<string, InstagramReel[]>;
    venueHashtags: { placeId: string; hashtags: string[] }[];
    createdAt: number;
}

// Map of sessionId → ReelsJob
const jobStore = new Map<string, ReelsJob>();

// Auto-cleanup stale jobs every 5 minutes (entries older than 10 min)
const STALE_MS = 10 * 60 * 1000;
setInterval(() => {
    const now = Date.now();
    for (const [key, job] of jobStore) {
        if (now - job.createdAt > STALE_MS) {
            jobStore.delete(key);
        }
    }
}, 5 * 60 * 1000);

/**
 * Build hashtag queries from venue data (same logic as video-enrichment-agent.ts).
 */
function buildVenueHashtags(venues: any[]): { placeId: string; hashtags: string[] }[] {
    return venues
        .filter(v => v.placeId !== 'user-location')
        .map(venue => {
            const venueName = venue.name || '';
            const cleanName = venueName.toLowerCase().replace(/[^a-z0-9]/g, '');
            const hashtags: string[] = [];
            if (cleanName.length > 2) {
                hashtags.push(cleanName);
            }
            return { placeId: venue.placeId, hashtags };
        })
        .filter(v => v.hashtags.length > 0);
}

/**
 * Start a background reels job. Returns immediately — Apify polls in the background.
 */
export function startReelsJob(sessionId: string, venues: any[], maxReelsPerVenue = 5): void {
    if (jobStore.has(sessionId)) {
        console.log(`📸 Reels job already exists for session ${sessionId}, skipping`);
        return;
    }

    const venueHashtags = buildVenueHashtags(venues);

    if (venueHashtags.length === 0) {
        console.log('📸 No venues to fetch reels for');
        jobStore.set(sessionId, {
            sessionId,
            status: 'ready',
            reelsMap: {},
            venueHashtags: [],
            createdAt: Date.now()
        });
        return;
    }

    // Create pending job
    const job: ReelsJob = {
        sessionId,
        status: 'pending',
        reelsMap: {},
        venueHashtags,
        createdAt: Date.now()
    };
    jobStore.set(sessionId, job);

    console.log(`📸 Reels job started for session ${sessionId} (${venueHashtags.length} venues)`);

    // Fire-and-forget: run the Apify batch search in the background
    const allQueries = [...new Set(venueHashtags.flatMap(v => v.hashtags))];

    const client = getInstagramClient();
    client.batchSearchReels({ queries: allQueries, maxResultsPerQuery: maxReelsPerVenue })
        .then(resultsMap => {
            // Map results back to placeIds
            const reelsMap: Record<string, InstagramReel[]> = {};

            venueHashtags.forEach(({ placeId, hashtags }) => {
                const allReels: InstagramReel[] = [];
                const seenIds = new Set<string>();

                for (const tag of hashtags) {
                    const reels = resultsMap.get(tag) || [];
                    for (const reel of reels) {
                        const reelId = reel.id || reel.shortCode;
                        if (!seenIds.has(reelId)) {
                            seenIds.add(reelId);
                            allReels.push(reel);
                        }
                    }
                }

                reelsMap[placeId] = allReels.slice(0, maxReelsPerVenue);
            });

            job.reelsMap = reelsMap;
            job.status = 'ready';

            const venuesWithReels = Object.values(reelsMap).filter(r => r.length > 0).length;
            console.log(`📸 Reels job completed for session ${sessionId}: ${venuesWithReels}/${venueHashtags.length} venues have reels`);
        })
        .catch(err => {
            console.error(`📸 Reels job failed for session ${sessionId}:`, err);
            job.status = 'failed';
        });
}

/**
 * Check the status of a reels job by sessionId.
 */
export function getReelsJobStatus(sessionId: string): {
    status: 'pending' | 'ready' | 'failed' | 'not_found';
    reelsMap?: Record<string, InstagramReel[]>;
} {
    const job = jobStore.get(sessionId);
    if (!job) {
        return { status: 'not_found' };
    }

    if (job.status === 'ready') {
        return { status: 'ready', reelsMap: job.reelsMap };
    }

    return { status: job.status };
}
