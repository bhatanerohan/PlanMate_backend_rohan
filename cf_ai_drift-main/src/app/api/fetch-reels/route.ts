import { NextResponse } from 'next/server';

// Configure for edge runtime
export const runtime = 'edge';

// Configure for longer execution time
export const maxDuration = 60;

const BROWSER_USE_API_URL = 'https://api.browser-use.com/api/v2/skills/384c7def-2ac9-4834-aeff-e58d624e2a5c/execute';

export async function POST(request: Request) {
    try {
        const body = await request.json() as { slug?: string; isDemo?: boolean };
        const { slug } = body;

        if (!slug) {
            return NextResponse.json(
                { success: false, error: 'Missing slug parameter' },
                { status: 400 }
            );
        }

        // ============ FETCH FROM INSTAGRAM ============
        // Validate environment variables
        if (!process.env.BROWSER_USE_API_KEY) {
            return NextResponse.json(
                { success: false, error: 'Browser-Use API key not configured' },
                { status: 500 }
            );
        }

        if (!process.env.IG_SESSION_ID || !process.env.IG_CSRF_TOKEN || !process.env.IG_USER_ID) {
            return NextResponse.json(
                { success: false, error: 'Instagram cookies not configured' },
                { status: 500 }
            );
        }

        // Construct topic by appending '-reels' to the slug
        const topic = `${slug}-reels`;

        console.log(`🎬 Fetching reels for topic: ${topic}`);

        // Prepare payload for Browser-Use API
        const payload = {
            parameters: {
                topic: topic,
                limit: 5, // Get top 5 reels
                // Map environment variables to the required cookie parameters
                sessionid: process.env.IG_SESSION_ID,
                csrftoken: process.env.IG_CSRF_TOKEN,
                ds_user_id: process.env.IG_USER_ID
            }
        };

        // Call Browser-Use API
        const response = await fetch(BROWSER_USE_API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Browser-Use-API-Key': process.env.BROWSER_USE_API_KEY
            },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error('❌ Browser-Use API error:', errorText);
            return NextResponse.json(
                { success: false, error: `API request failed: ${response.status}` },
                { status: response.status }
            );
        }

        const data = await response.json() as { result?: { data?: { reels?: any[] } } };

        // Parse and validate the response
        // Browser-Use returns { result: { success, data: { reels: [...], count: N } }, ... }
        const reels = data?.result?.data?.reels;

        if (!reels || !Array.isArray(reels) || reels.length === 0) {
            console.warn('⚠️ No reels found for topic:', topic);
            return NextResponse.json({
                success: false,
                error: 'No reels found for this location'
            });
        }

        console.log(`✅ Found ${reels.length} reels for ${topic}`);

        // Transform to our app's format
        const videoUrl = reels[0].video_url;
        const gallery = reels.slice(0, 5).map((reel: any) => ({
            type: 'video' as const,
            url: reel.video_url,
            thumbnail: reel.thumbnail_url
        }));

        const result = {
            success: true,
            videoUrl,
            gallery
        };

        return NextResponse.json(result);

    } catch (error) {
        console.error('❌ Fetch reels error:', error);
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        return NextResponse.json(
            { success: false, error: errorMessage },
            { status: 500 }
        );
    }
}
