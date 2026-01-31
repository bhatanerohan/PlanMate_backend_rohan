import { NextResponse } from 'next/server';
import { getRequestContext } from '@cloudflare/next-on-pages';

// Configure for edge runtime
export const runtime = 'edge';

// Request body interface
interface UpdateTripRequest {
    tripId: string;
    newPlan: unknown;
}

// Environment interface for Cloudflare bindings
interface Env {
    TRIP_CACHE: KVNamespace;
}

export async function POST(request: Request) {
    try {
        const body = await request.json() as UpdateTripRequest;
        const { tripId, newPlan } = body;

        if (!tripId) {
            return NextResponse.json(
                { error: 'Missing tripId' },
                { status: 400 }
            );
        }

        if (!newPlan) {
            return NextResponse.json(
                { error: 'Missing newPlan' },
                { status: 400 }
            );
        }

        // Get Cloudflare environment bindings
        const { env } = getRequestContext() as unknown as { env: Env };

        // Save the updated plan to KV
        await env.TRIP_CACHE.put(
            tripId,
            JSON.stringify(newPlan),
            { expirationTtl: 60 * 60 * 24 * 7 } // 7 days
        );

        console.log(`✅ Updated trip in KV: ${tripId}`);

        return NextResponse.json({
            success: true,
            tripId,
            message: 'Trip updated successfully',
        });

    } catch (error) {
        console.error('❌ Error updating trip:', error);

        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        return NextResponse.json(
            { error: 'Failed to update trip', details: errorMessage },
            { status: 500 }
        );
    }
}
