import { NextResponse } from 'next/server';
import { getRequestContext } from '@cloudflare/next-on-pages';

// Configure for edge runtime
export const runtime = 'edge';

// Environment interface for Cloudflare bindings
interface Env {
    TRIP_CACHE: KVNamespace;
}

export async function GET(request: Request) {
    try {
        const url = new URL(request.url);
        const tripId = url.searchParams.get('tripId');

        if (!tripId) {
            return NextResponse.json(
                { error: 'Missing tripId parameter' },
                { status: 400 }
            );
        }

        // Get Cloudflare environment bindings
        const { env } = getRequestContext() as unknown as { env: Env };

        // Check if the trip plan is ready in KV
        const cachedPlan = await env.TRIP_CACHE.get(tripId);

        if (!cachedPlan) {
            // Plan not ready yet
            return NextResponse.json(
                {
                    tripId,
                    status: 'pending',
                    message: 'Trip is still being planned. Please try again shortly.',
                },
                { status: 202 } // 202 Accepted - processing
            );
        }

        // Parse and return the completed plan
        const tripPlan = JSON.parse(cachedPlan);

        console.log(`✅ Returning completed trip plan: ${tripId}`);

        return NextResponse.json({
            tripId,
            status: 'complete',
            plan: tripPlan,
        });

    } catch (error) {
        console.error('❌ Error polling trip status:', error);

        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        return NextResponse.json(
            { error: 'Failed to check trip status', details: errorMessage },
            { status: 500 }
        );
    }
}

// Also support POST for flexibility
export async function POST(request: Request) {
    try {
        const body = await request.json() as { tripId?: string };
        const tripId = body.tripId;

        if (!tripId) {
            return NextResponse.json(
                { error: 'Missing tripId in request body' },
                { status: 400 }
            );
        }

        // Get Cloudflare environment bindings
        const { env } = getRequestContext() as unknown as { env: Env };

        // Check if the trip plan is ready in KV
        const cachedPlan = await env.TRIP_CACHE.get(tripId);

        if (!cachedPlan) {
            // Plan not ready yet
            return NextResponse.json(
                {
                    tripId,
                    status: 'pending',
                    message: 'Trip is still being planned. Please try again shortly.',
                },
                { status: 202 }
            );
        }

        // Parse and return the completed plan
        const tripPlan = JSON.parse(cachedPlan);

        return NextResponse.json({
            tripId,
            status: 'complete',
            plan: tripPlan,
        });

    } catch (error) {
        console.error('❌ Error polling trip status:', error);

        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        return NextResponse.json(
            { error: 'Failed to check trip status', details: errorMessage },
            { status: 500 }
        );
    }
}
