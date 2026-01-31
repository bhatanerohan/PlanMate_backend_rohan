// backend/src/index.ts
import { TripWorkflow } from './trip-workflow';

// 1. Export the Workflow class so Cloudflare sees it
export { TripWorkflow };

// Environment types
export interface Env {
	TRIP_WORKFLOW: Workflow;
	TRIP_CACHE: KVNamespace;
	AI: Ai;
}

// 2. Export the "fetch" handler (The API Gateway)
export default {
	async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
		const url = new URL(request.url);

		// CORS headers
		const corsHeaders = {
			'Access-Control-Allow-Origin': '*',
			'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
			'Access-Control-Allow-Headers': 'Content-Type',
		};

		// Handle CORS preflight
		if (request.method === 'OPTIONS') {
			return new Response(null, { headers: corsHeaders });
		}

		// POST requests start the workflow
		if (request.method === 'POST') {
			const body = await request.json() as { tripId?: string;[key: string]: unknown };
			const tripId = body.tripId || crypto.randomUUID();

			// TRIGGER THE WORKFLOW LOCALLY
			// 'TRIP_WORKFLOW' matches the binding in backend/wrangler.toml
			await env.TRIP_WORKFLOW.create({
				id: tripId,
				params: body
			});

			return Response.json(
				{ success: true, tripId, status: 'started' },
				{ headers: corsHeaders }
			);
		}

		// GET requests to poll for results
		if (request.method === 'GET' && url.pathname === '/poll') {
			const tripId = url.searchParams.get('tripId');
			if (!tripId) {
				return Response.json(
					{ error: 'Missing tripId' },
					{ status: 400, headers: corsHeaders }
				);
			}

			const result = await env.TRIP_CACHE.get(tripId);
			if (!result) {
				return Response.json(
					{ status: 'pending', tripId },
					{ status: 202, headers: corsHeaders }
				);
			}

			return Response.json(
				{ status: 'complete', tripId, plan: JSON.parse(result) },
				{ headers: corsHeaders }
			);
		}

		return new Response('Backend is healthy', { status: 200, headers: corsHeaders });
	},
} satisfies ExportedHandler<Env>;
