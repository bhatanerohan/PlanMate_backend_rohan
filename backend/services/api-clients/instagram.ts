// backend/services/api-clients/instagram.ts
// Instagram Reels client implementation — fetches reels via Apify Instagram Hashtag Scraper API.
import axios from 'axios';

export interface InstagramReel {
    id: string;
    shortCode: string;
    caption: string;
    videoUrl: string;
    thumbnailUrl: string;
    likesCount: number;
    viewCount: number;
    commentsCount: number;
    ownerUsername: string;
    hashtags: string[];
    timestamp: string;
    url: string;
}

export interface ReelSearchParams {
    query: string;
    maxResults?: number;
}

export interface BatchReelSearchParams {
    queries: string[];
    maxResultsPerQuery?: number;
}

const APIFY_BASE_URL = 'https://api.apify.com/v2';
const ACTOR_ID = 'apify~instagram-hashtag-scraper';
const POLL_INTERVAL_MS = 2000;
const POLL_TIMEOUT_MS = 60000;

/**
 * Polls the Apify run until it completes or times out.
 */
async function pollForCompletion(runId: string, token: string): Promise<string> {
    const startTime = Date.now();

    while (Date.now() - startTime < POLL_TIMEOUT_MS) {
        const statusResp = await axios.get(`${APIFY_BASE_URL}/actor-runs/${runId}`, {
            params: { token }
        });

        const status = statusResp.data?.data?.status;
        const datasetId = statusResp.data?.data?.defaultDatasetId;

        if (status === 'SUCCEEDED') {
            return datasetId;
        }

        if (status === 'FAILED' || status === 'ABORTED' || status === 'TIMED-OUT') {
            throw new Error(`Apify run failed with status: ${status}`);
        }

        // Wait before next poll
        await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL_MS));
    }

    throw new Error('Apify run timed out after 60 seconds');
}

/**
 * Fetches results from an Apify dataset.
 */
async function fetchDatasetResults(datasetId: string, token: string): Promise<any[]> {
    const resp = await axios.get(`${APIFY_BASE_URL}/datasets/${datasetId}/items`, {
        params: { token }
    });
    return resp.data || [];
}

/**
 * Transforms raw Apify result into InstagramReel format.
 */
function transformToReel(item: any): InstagramReel {
    // Extract hashtags from caption
    const caption = item.caption || '';
    const hashtagMatches = caption.match(/#[\w]+/g) || [];

    return {
        id: item.id || item.pk || '',
        shortCode: item.shortCode || item.code || '',
        caption: caption,
        videoUrl: item.videoUrl || item.video_url || '',
        thumbnailUrl: item.displayUrl || item.thumbnailUrl || item.thumbnail_url || '',
        likesCount: item.likesCount || item.likes_count || item.like_count || 0,
        viewCount: item.videoViewCount || item.video_view_count || item.playCount || item.play_count || 0,
        commentsCount: item.commentsCount || item.comments_count || item.comment_count || 0,
        ownerUsername: item.ownerUsername || item.owner?.username || '',
        hashtags: hashtagMatches.map((h: string) => h.substring(1)), // Remove # prefix
        timestamp: item.timestamp || item.taken_at || '',
        url: item.url || `https://www.instagram.com/reel/${item.shortCode || item.code}/`
    };
}

export function getInstagramClient() {
    return {
        /**
         * Search for Instagram Reels by keyword/hashtag.
         */
        async searchReels(params: ReelSearchParams): Promise<InstagramReel[]> {
            const apiToken = process.env.APIFY_API_TOKEN;
            if (!apiToken) {
                console.log('⏭️ APIFY_API_TOKEN not set — returning empty reel list');
                return [];
            }

            const { query, maxResults = 5 } = params;

            try {
                console.log(`📸 Searching Instagram Reels for: "${query}"`);

                // Start the Apify actor run
                const runResp = await axios.post(
                    `${APIFY_BASE_URL}/acts/${ACTOR_ID}/runs`,
                    {
                        hashtags: [query],
                        resultsType: 'reels',
                        resultsLimit: maxResults,
                        keywordSearch: true
                    },
                    {
                        params: { token: apiToken },
                        headers: { 'Content-Type': 'application/json' }
                    }
                );

                const runId = runResp.data?.data?.id;
                if (!runId) {
                    console.error('⚠️ Failed to start Apify run — no run ID returned');
                    return [];
                }

                console.log(`⏳ Apify run started: ${runId}, polling for completion...`);

                // Poll for completion
                const datasetId = await pollForCompletion(runId, apiToken);

                // Fetch results from dataset
                const rawResults = await fetchDatasetResults(datasetId, apiToken);

                // Filter for videos only and transform
                const reels = rawResults
                    .filter((item: any) => item.type === 'Video' || item.isVideo || item.video_url || item.videoUrl)
                    .slice(0, maxResults)
                    .map(transformToReel);

                console.log(`✅ Found ${reels.length} Instagram Reels`);
                return reels;

            } catch (error) {
                console.error('⚠️ Instagram client error:', error);
                return [];
            }
        },

        /**
         * Batch search for Instagram Reels across multiple queries/venues.
         */
        async batchSearchReels(params: BatchReelSearchParams): Promise<Map<string, InstagramReel[]>> {
            const apiToken = process.env.APIFY_API_TOKEN;
            if (!apiToken) {
                console.log('⏭️ APIFY_API_TOKEN not set — returning empty reel map');
                return new Map();
            }

            const { queries, maxResultsPerQuery = 3 } = params;
            const resultsMap = new Map<string, InstagramReel[]>();

            try {
                console.log(`📸 Batch searching Instagram Reels for ${queries.length} queries`);

                // Start the Apify actor run with all queries
                const runResp = await axios.post(
                    `${APIFY_BASE_URL}/acts/${ACTOR_ID}/runs`,
                    {
                        hashtags: queries,
                        resultsType: 'reels',
                        resultsLimit: maxResultsPerQuery,
                        keywordSearch: true
                    },
                    {
                        params: { token: apiToken },
                        headers: { 'Content-Type': 'application/json' }
                    }
                );

                const runId = runResp.data?.data?.id;
                if (!runId) {
                    console.error('⚠️ Failed to start Apify run — no run ID returned');
                    return resultsMap;
                }

                console.log(`⏳ Apify batch run started: ${runId}, polling for completion...`);

                // Poll for completion
                const datasetId = await pollForCompletion(runId, apiToken);

                // Fetch results from dataset
                const rawResults = await fetchDatasetResults(datasetId, apiToken);

                // Filter for videos only
                const videoResults = rawResults.filter(
                    (item: any) => item.type === 'Video' || item.isVideo || item.video_url || item.videoUrl
                );

                // Group results by query (using hashtag or caption matching)
                for (const query of queries) {
                    const queryLower = query.toLowerCase().replace(/[^a-z0-9]/g, '');
                    const matchingReels = videoResults
                        .filter((item: any) => {
                            const caption = (item.caption || '').toLowerCase();
                            const hashtags = (item.hashtags || []).join(' ').toLowerCase();
                            return caption.includes(queryLower) || hashtags.includes(queryLower);
                        })
                        .slice(0, maxResultsPerQuery)
                        .map(transformToReel);

                    resultsMap.set(query, matchingReels);
                }

                // If we couldn't match by query, distribute results evenly
                if ([...resultsMap.values()].every(arr => arr.length === 0) && videoResults.length > 0) {
                    const reelsPerQuery = Math.ceil(videoResults.length / queries.length);
                    queries.forEach((query, index) => {
                        const start = index * reelsPerQuery;
                        const end = Math.min(start + reelsPerQuery, videoResults.length);
                        resultsMap.set(query, videoResults.slice(start, end).map(transformToReel));
                    });
                }

                console.log(`✅ Batch search completed for ${queries.length} queries`);
                return resultsMap;

            } catch (error: any) {
                console.error('⚠️ Instagram batch search error:', error.message);
                if (error.response?.data) {
                    console.error('📛 Apify error response:', JSON.stringify(error.response.data, null, 2));
                }
                return resultsMap;
            }

        }
    };
}
