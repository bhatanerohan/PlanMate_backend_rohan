import { getRequestContext } from '@cloudflare/next-on-pages';
import { NextResponse } from 'next/server';

export const runtime = 'edge';

// Environment interface for Cloudflare bindings
interface CloudflareEnv {
  BACKEND: {
    fetch(input: RequestInfo, init?: RequestInit): Promise<Response>;
  };
  TRIP_CACHE: KVNamespace;
}

export async function POST(request: Request) {
  const { env } = getRequestContext() as unknown as { env: CloudflareEnv };
  const body = await request.json() as Record<string, unknown>;

  // Generate an ID (or let backend do it)
  const tripId = crypto.randomUUID();

  try {
    // CALL THE BACKEND WORKER
    // We use the 'BACKEND' binding we added to wrangler.toml
    const backendResponse = await env.BACKEND.fetch('http://internal/start-trip', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tripId,
        userPrompt: body.userPrompt || body.destination,
        ...body
      })
    });

    if (!backendResponse.ok) {
      throw new Error(`Backend error: ${backendResponse.statusText}`);
    }

    return NextResponse.json({
      tripId,
      status: 'pending',
      message: 'Trip Architect has started...'
    });

  } catch (error) {
    console.error("Failed to start workflow:", error);
    return NextResponse.json({ error: "Failed to start planner" }, { status: 500 });
  }
}
