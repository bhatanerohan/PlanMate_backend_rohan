import {
    WorkflowEntrypoint,
    WorkflowEvent,
    WorkflowStep,
} from "cloudflare:workers";

// ============ Type Definitions ============

export interface TripWorkflowParams {
    destination: string;
    days: number;
    budget: number;
    travelers: number;
    startDate?: string;
    userPrompt: string;
}

export interface TripSegment {
    order: number;
    location: string;
    checkIn: string;
    checkOut: string;
    searchQueries: {
        stays: string;
        activityKeywords: string[];
    };
}

export interface TripParams {
    destination: string;
    originCity?: string;
    startDate: string;
    endDate: string;
    travelers: number;
    budgetUSD: number;
    tripVibe: string[];
}

export interface TripItem {
    id: string;
    type: 'flight' | 'hotel' | 'activity' | 'train' | 'food' | 'museum';
    name: string;
    price: number;
    currency: string;
    coordinates: { lat: number; lng: number };
    bookingUrl?: string;
    provider?: string;
    time?: string;
    duration?: string;
    description?: string;
    rating?: number;
    imageUrl?: string;
    isEstimate?: boolean;
    hasReel?: boolean;
    instagramSearchTerm?: string;
}

export interface ActivityItem {
    id: string;
    name: string;
    description: string;
    category: string;
    provider: 'Viator' | 'Klook' | 'GetYourGuide' | 'Headout' | 'Generic';
    location: { address: string; lat: number; lng: number };
    duration: string;
    price: number;
    currency: string;
    rating: number;
    reviewCount: number;
    imageUrl: string;
    bookingUrl: string;
    highlights: string[];
    bestTimeToVisit?: string;
}

export interface SegmentData {
    segment: TripSegment;
    stays: TripItem[];
    activities: TripItem[];
}

export interface SkeletonResult {
    skeleton: TripSegment[];
    tripParams: TripParams;
}

export interface FetchedOptions {
    segmentsData: SegmentData[];
    totalStays: number;
    totalActivities: number;
}

export interface CurationResult {
    prompt: string;
    optionsContext: unknown[];
    tripDays: number;
    firstDate: string;
    lastDate: string;
}

export interface CuratedItinerary {
    id: string;
    destination: string;
    dates: string;
    totalBudget: number;
    currency: string;
    travelers: number;
    days: Record<string, any>[];
    isDemo?: boolean;
}

// Environment bindings from wrangler.toml
export interface Env {
    TRIP_CACHE: KVNamespace;
    AI: Ai;
    GROQ_API_KEY: string;
    GEMINI_API_KEY: string;
    BROWSER_USE_API_KEY: string;
}

// ============ Helper Functions ============

/**
 * Fisher-Yates shuffle algorithm for randomizing array order
 */
function shuffleArray<T>(array: T[]): T[] {
    const shuffled = [...array];
    for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
}

// ============ Schema Definition for Groq ============

const skeletonSchemaDescription = `[
  {
    "order": number,
    "location": "string - CITY NAME ONLY, e.g. 'Tokyo' or 'Paris'",
    "checkIn": "string - YYYY-MM-DD format",
    "checkOut": "string - YYYY-MM-DD format", 
    "searchQueries": {
      "stays": "string - hotel search query",
      "activityKeywords": ["array of attractions/activities"]
    }
  }
]`;

const tripParamsSchemaDescription = `{
  "destination": "string - the destination city/country",
  "originCity": "string | null - the origin city if mentioned",
  "startDate": "string - YYYY-MM-DD format",
  "endDate": "string - YYYY-MM-DD format",
  "travelers": "number - default 2",
  "budgetUSD": "number - default 3000",
  "tripVibe": "string[] - e.g. ['romantic', 'adventure']"
}`;

/**
 * TripWorkflow - A durable Cloudflare Workflow for multi-step trip planning.
 * 
 * This workflow breaks down trip planning into atomic, retriable steps:
 * 1. generate-skeleton: Parse user request into trip segments
 * 2. fetch-options: Fetch hotels, activities from external APIs
 * 3. curate-itinerary: Prepare Gemini prompt for final assembly
 * 4. save-state: Persist result to KV for caching
 */
export class TripWorkflow extends WorkflowEntrypoint<Env, TripWorkflowParams> {

    async run(event: WorkflowEvent<TripWorkflowParams>, step: WorkflowStep) {
        const params = event.payload;
        const cleanPrompt = params.userPrompt.replace('--demo', '').trim();
        const todayStr = new Date().toISOString().split('T')[0];

        // Step 1: Generate Trip Skeleton
        // Parse the user's request and create a high-level trip structure
        const skeletonResult = await step.do("generate-skeleton", async (): Promise<SkeletonResult> => {
            console.log("📐 Step 1: Generating trip skeleton and extracting parameters...");

            // Generate skeleton using Groq LLM
            const skeletonSystemPrompt = `You are a Travel Logistics Architect. Today's date is ${todayStr}.

INPUT: A user's travel request (e.g., "10 days in Japan").

OUTPUT: A strict JSON array of TripSegments that breaks the trip into logical city/region hops with specific dates.

SCHEMA:
${skeletonSchemaDescription}

RULES:
1. Break multi-city trips into separate segments.
2. Calculate specific dates based on today's date.
3. For stays search queries, be specific about neighborhood/area.
4. For activity keywords, include specific attractions, landmarks.
5. Each segment should be 2-4 nights unless specified.
6. Order segments logically for efficient travel.
7. Return ONLY the JSON array, no additional text.`;

            const tripParamsSystemPrompt = `You are a precise API parameter extractor. Today is ${todayStr}. 

Convert the user's travel request into a valid JSON object matching this schema:
${tripParamsSchemaDescription}

Important rules:
1. If dates are relative, calculate exact YYYY-MM-DD dates.
2. Default travelers to 2 if not specified.
3. Default budgetUSD to 3000 if not specified.
4. Return ONLY the JSON object, no additional text.`;

            // Call Groq API for skeleton generation
            const groqResponse = await fetch('https://api.groq.com/openai/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.env.GROQ_API_KEY}`,
                },
                body: JSON.stringify({
                    model: 'llama-3.3-70b-versatile',
                    response_format: { type: 'json_object' },
                    temperature: 0.3,
                    max_tokens: 2000,
                    messages: [
                        { role: 'system', content: skeletonSystemPrompt },
                        { role: 'user', content: cleanPrompt },
                    ],
                }),
            });

            const groqData = await groqResponse.json() as any;
            const skeletonContent = groqData.choices?.[0]?.message?.content || '[]';
            const parsedSkeleton = JSON.parse(skeletonContent);

            // Handle array or object with segments key
            let segments: TripSegment[] = Array.isArray(parsedSkeleton)
                ? parsedSkeleton
                : (parsedSkeleton.segments || parsedSkeleton.tripSegments || []);

            // Validate and normalize segments
            segments = segments.map((seg: any, index: number) => ({
                order: seg.order || index + 1,
                location: seg.location || 'Unknown',
                checkIn: seg.checkIn || seg.check_in || todayStr,
                checkOut: seg.checkOut || seg.check_out || todayStr,
                searchQueries: {
                    stays: seg.searchQueries?.stays || `Hotels in ${seg.location}`,
                    activityKeywords: seg.searchQueries?.activityKeywords || [],
                },
            }));

            // Call Groq API for trip params extraction
            const paramsResponse = await fetch('https://api.groq.com/openai/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.env.GROQ_API_KEY}`,
                },
                body: JSON.stringify({
                    model: 'llama-3.3-70b-versatile',
                    response_format: { type: 'json_object' },
                    temperature: 0.1,
                    max_tokens: 500,
                    messages: [
                        { role: 'system', content: tripParamsSystemPrompt },
                        { role: 'user', content: cleanPrompt },
                    ],
                }),
            });

            const paramsData = await paramsResponse.json() as any;
            const paramsContent = paramsData.choices?.[0]?.message?.content || '{}';
            const parsedParams = JSON.parse(paramsContent) as TripParams;

            const tripParams: TripParams = {
                destination: parsedParams.destination || 'Unknown',
                originCity: parsedParams.originCity,
                startDate: parsedParams.startDate || todayStr,
                endDate: parsedParams.endDate || todayStr,
                travelers: parsedParams.travelers || 2,
                budgetUSD: parsedParams.budgetUSD || 3000,
                tripVibe: parsedParams.tripVibe || [],
            };

            console.log(`✅ Created ${segments.length} segments for ${tripParams.travelers} travelers`);

            return { skeleton: segments, tripParams };
        });

        // Step 2: Fetch Options
        // Query external APIs for hotels, activities
        const options = await step.do("fetch-options", async (): Promise<FetchedOptions> => {
            console.log("🔍 Step 2: Fetching unified stays and activities...");

            const { skeleton, tripParams } = skeletonResult;
            const travelers = tripParams.travelers;
            const budgetPerNight = tripParams.budgetUSD ? Math.round(tripParams.budgetUSD / 7) : undefined;

            const segmentsData: SegmentData[] = [];
            let totalStays = 0;
            let totalActivities = 0;

            // Process each segment sequentially to avoid rate limits
            for (const segment of skeleton) {
                // Fetch stays from Airbnb and Booking.com in parallel
                const staysResults = await Promise.allSettled([
                    this.fetchAirbnbListings(segment.location, segment.checkIn, segment.checkOut, travelers),
                    this.fetchBookingHotels(segment.location, segment.checkIn, segment.checkOut, travelers),
                ]);

                const stays: TripItem[] = [];
                staysResults.forEach((result, index) => {
                    if (result.status === 'fulfilled') {
                        stays.push(...result.value);
                    }
                });

                // Apply budget filter if provided
                const filteredStays = budgetPerNight
                    ? stays.filter(s => s.price <= budgetPerNight)
                    : stays;

                // Fetch activities (simplified - just Headout for now)
                const activities = await this.fetchHeadoutActivities(segment.location);

                segmentsData.push({
                    segment,
                    stays: shuffleArray(filteredStays),
                    activities: activities.map(a => ({
                        id: a.id,
                        type: 'activity' as const,
                        name: a.name,
                        price: a.price,
                        currency: a.currency,
                        coordinates: { lat: a.coordinates.lat, lng: a.coordinates.lng },
                        bookingUrl: a.bookingUrl,
                        provider: a.provider,
                        rating: a.rating,
                        duration: a.duration,
                        description: a.description,
                        imageUrl: a.imageUrl,
                    })),
                });

                totalStays += filteredStays.length;
                totalActivities += activities.length;
                console.log(`📍 ${segment.location}: ${filteredStays.length} stays, ${activities.length} activities`);
            }

            console.log(`✅ Total: ${totalStays} stays and ${totalActivities} activities`);

            return { segmentsData, totalStays, totalActivities };
        });

        // Step 3: Curate Itinerary
        // Call Workers AI to generate the final day-by-day itinerary
        const curatedItinerary = await step.do("curate-itinerary", async (): Promise<CuratedItinerary> => {
            console.log("🎨 Step 3: Curating itinerary with Workers AI...");

            const { skeleton, tripParams } = skeletonResult;
            const { segmentsData } = options;

            // Build the available options context per segment
            const optionsContext = segmentsData.map(({ segment, stays, activities }) => ({
                segment: {
                    location: segment.location,
                    checkIn: segment.checkIn,
                    checkOut: segment.checkOut,
                },
                availableStays: stays.slice(0, 10).map(stay => ({
                    id: stay.id,
                    name: stay.name,
                    provider: stay.provider,
                    price: stay.price,
                    rating: stay.rating,
                    coordinates: stay.coordinates,
                    bookingUrl: stay.bookingUrl,
                    imageUrl: stay.imageUrl,
                })),
                availableActivities: activities.slice(0, 12).map(activity => ({
                    id: activity.id,
                    name: activity.name,
                    provider: activity.provider,
                    price: activity.price,
                    duration: activity.duration,
                    rating: activity.rating,
                    coordinates: activity.coordinates,
                    bookingUrl: activity.bookingUrl,
                    imageUrl: activity.imageUrl,
                })),
            }));

            // Calculate total trip dates
            const firstDate = skeleton[0]?.checkIn || todayStr;
            const lastDate = skeleton[skeleton.length - 1]?.checkOut || firstDate;
            const tripDays = Math.ceil(
                (new Date(lastDate).getTime() - new Date(firstDate).getTime()) / (1000 * 60 * 60 * 24)
            ) + 1;

            const curatorPrompt = `You are a Master Travel Curator. I have provided a list of Available Stays from both Airbnb and Booking.com, plus activities with geocoded coordinates.

USER'S ORIGINAL REQUEST:
"${cleanPrompt}"

TRIP STRUCTURE (DO NOT CHANGE THESE DATES/CITIES):
${JSON.stringify(skeleton, null, 2)}

AVAILABLE OPTIONS PER LEG:
${JSON.stringify(optionsContext, null, 2)}

YOUR TASK:
1. Create a day-by-day itinerary for ${tripDays} days (from ${firstDate} to ${lastDate}).
2. For each segment, SELECT specific stays and activities from the "Available Options" provided.
3. Create realistic daily schedules with times (e.g., "09:00", "14:30").

SELECTION RULES:
- If user wants "cozy", "local experience", "unique" → prefer Airbnb listings
- If user wants "luxury", "service", "amenities", "hotel" → prefer Booking.com hotels
- Match the vibe of the stay to the user's request

STRICT CONSTRAINTS:
1. DO NOT change the cities or dates defined in the Trip Structure.
2. You must use the EXACT id, name, coordinates, imageUrl, and bookingUrl from the provided lists.
3. For each segment, pick ONE stay and 2-4 activities per day.
4. Add realistic meal items (breakfast, lunch, dinner) - you can create these.
5. Include the provider name in the description.

OUTPUT FORMAT:
- Generate a valid TripPlan JSON with all ${tripDays} days.
- Each day should have 3-6 items.
- Set totalBudget based on the sum of selected items.
- Return ONLY valid JSON, no markdown code blocks or additional text.

REEL LOGIC (CRITICAL):
- Set 'hasReel: true' ONLY for visually interesting items.
- EXAMPLES (TRUE): Museums, Parks, Activities, Scenic Trains, Famous Landmarks.
- EXAMPLES (FALSE): Airport transfers, Hotel check-in/out, Generic meals.

INSTAGRAM SEARCH SLUGS:
- For every item where 'hasReel: true', generate an 'instagramSearchTerm'.
- Format: "{specific_landmark}-{city}" (lowercase, hyphenated).

Generate the complete TripPlan JSON now.`;

            // Call Cloudflare Workers AI with Llama 3.3 70B
            console.log("🤖 Calling Workers AI for curation...");

            const response = await this.env.AI.run('@cf/meta/llama-3.3-70b-instruct-fp8-fast', {
                messages: [
                    {
                        role: 'system',
                        content: 'You are a travel curator that outputs only valid JSON. No markdown, no explanation, just JSON.',
                    },
                    {
                        role: 'user',
                        content: curatorPrompt,
                    },
                ],
                max_tokens: 8000,
                temperature: 0.4,
            });

            // Extract response content - Workers AI returns { response: string }
            const rawContent = typeof response === 'object' && 'response' in response
                ? (response as { response: string }).response
                : String(response);

            console.log('📦 Workers AI raw response length:', rawContent?.length || 0);

            if (!rawContent) {
                throw new Error('No response from Workers AI - workflow will retry');
            }

            // Safe JSON extraction - handle markdown code blocks
            let jsonContent = rawContent.trim();

            // Remove markdown code blocks if present
            const jsonMatch = jsonContent.match(/```(?:json)?\s*([\s\S]*?)```/);
            if (jsonMatch) {
                jsonContent = jsonMatch[1].trim();
            }

            // Also try to find raw JSON object
            const objectMatch = jsonContent.match(/\{[\s\S]*\}/);
            if (!jsonMatch && objectMatch) {
                jsonContent = objectMatch[0];
            }

            // Attempt to parse JSON
            let parsedItinerary: CuratedItinerary;
            try {
                parsedItinerary = JSON.parse(jsonContent);
            } catch (parseError) {
                console.error('❌ JSON parse error:', parseError);
                console.error('❌ Raw content preview:', jsonContent.substring(0, 500));
                throw new Error(`Invalid JSON from Workers AI - workflow will retry. Parse error: ${parseError}`);
            }

            // Validate required fields and provide defaults
            const tripId = `trip_${Date.now()}`;
            const curatedResult: CuratedItinerary = {
                id: parsedItinerary.id || tripId,
                destination: parsedItinerary.destination || skeleton.map(s => s.location.split(',')[0]).join(' → '),
                dates: parsedItinerary.dates || `${firstDate} to ${lastDate}`,
                totalBudget: parsedItinerary.totalBudget || tripParams.budgetUSD,
                currency: parsedItinerary.currency || '$',
                travelers: parsedItinerary.travelers || tripParams.travelers,
                days: parsedItinerary.days || [],
                isDemo: params.userPrompt.includes('--demo'),
            };

            // Validate that we have days
            if (!Array.isArray(curatedResult.days) || curatedResult.days.length === 0) {
                throw new Error('Workers AI returned empty days array - workflow will retry');
            }

            console.log(`✅ Curated ${curatedResult.days.length}-day itinerary for ${curatedResult.destination}`);

            return curatedResult;
        });

        // Step 4: Save State
        // Persist the curated itinerary to KV cache
        const saveResult = await step.do("save-state", async () => {
            console.log("💾 Step 4: Saving curated itinerary to KV...");

            const tripId = curatedItinerary.id;

            // Save the complete itinerary to KV
            await this.env.TRIP_CACHE.put(
                tripId,
                JSON.stringify(curatedItinerary),
                { expirationTtl: 60 * 60 * 24 * 7 } // 7 days
            );

            console.log(`✅ Saved itinerary to KV: ${tripId}`);

            return { saved: true, tripId, itinerary: curatedItinerary };
        });

        // Return the curated itinerary
        return saveResult.itinerary;
    }

    // ============ Helper Methods for API Calls ============

    /**
     * Fetch Airbnb listings via Browser Use API
     */
    private async fetchAirbnbListings(
        destination: string,
        checkIn: string,
        checkOut: string,
        travelers: number
    ): Promise<TripItem[]> {
        const apiKey = this.env.BROWSER_USE_API_KEY;
        if (!apiKey) return [];

        try {
            const response = await fetch('https://api.browser-use.com/api/v2/skills/442a08cb-f012-4266-a927-67437632fd1c/execute', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Browser-Use-API-Key': apiKey,
                },
                body: JSON.stringify({
                    parameters: {
                        location: destination,
                        checkin: checkIn,
                        checkout: checkOut,
                        guests: travelers,
                    },
                }),
            });

            if (!response.ok) return [];

            const data = await response.json() as any;
            const listings = data.result?.data?.listings || data.data?.listings || [];

            return listings.map((listing: any, index: number) => ({
                id: `airbnb_${index}_${Date.now()}`,
                type: 'hotel' as const,
                name: listing.title || 'Airbnb Listing',
                price: parseFloat((listing.price_total || '0').replace(/[^0-9.]/g, '')) || 0,
                currency: '$',
                coordinates: { lat: listing.latitude || 0, lng: listing.longitude || 0 },
                bookingUrl: listing.url,
                provider: 'Airbnb',
                rating: listing.rating || 0,
                imageUrl: listing.photos?.[0],
                description: `Airbnb listing in ${destination}`,
            }));
        } catch (error) {
            console.error('Airbnb fetch error:', error);
            return [];
        }
    }

    /**
     * Fetch Booking.com hotels via Browser Use API
     */
    private async fetchBookingHotels(
        destination: string,
        checkIn: string,
        checkOut: string,
        travelers: number
    ): Promise<TripItem[]> {
        const apiKey = this.env.BROWSER_USE_API_KEY;
        if (!apiKey) return [];

        try {
            const response = await fetch('https://api.browser-use.com/api/v2/skills/3311e66a-9dc6-403d-93d6-f20e78701bec/execute', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Browser-Use-API-Key': apiKey,
                },
                body: JSON.stringify({
                    parameters: {
                        destination,
                        checkin: checkIn,
                        checkout: checkOut,
                        adults: travelers,
                        rooms: 1,
                        children: 0,
                    },
                }),
            });

            if (!response.ok) return [];

            const data = await response.json() as any;
            const listings = data.result?.data?.listings || data.data?.hotels || [];

            return listings.map((listing: any) => ({
                id: `booking-${listing.property_id || Date.now()}`,
                type: 'hotel' as const,
                name: listing.name || 'Booking.com Hotel',
                price: typeof listing.price?.amount === 'number'
                    ? listing.price.amount
                    : parseFloat((listing.price?.amount || '0').replace(/[^0-9.]/g, '')) || 0,
                currency: '$',
                coordinates: { lat: listing.latitude || 0, lng: listing.longitude || 0 },
                bookingUrl: listing.url,
                provider: 'Booking.com',
                rating: listing.review_score || 0,
                imageUrl: listing.photo_url,
                description: `Booking.com hotel in ${destination}`,
            }));
        } catch (error) {
            console.error('Booking.com fetch error:', error);
            return [];
        }
    }

    /**
     * Fetch Headout activities via Browser Use API
     */
    private async fetchHeadoutActivities(location: string): Promise<TripItem[]> {
        const apiKey = this.env.BROWSER_USE_API_KEY;
        if (!apiKey) return [];

        try {
            const response = await fetch('https://api.browser-use.com/api/v2/skills/ab1257b7-f66e-4a29-b2a3-eba52f5b3719/execute', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Browser-Use-API-Key': apiKey,
                },
                body: JSON.stringify({
                    parameters: {
                        location,
                        limit: 20,
                        currency: 'USD',
                        sort_type: 'RECOMMENDED',
                    },
                }),
            });

            if (!response.ok) return [];

            const data = await response.json() as any;
            const listings = data.result?.data?.listings || data.data?.activities || [];

            return listings.map((item: any) => ({
                id: `headout-${item.id || Date.now()}`,
                type: 'activity' as const,
                name: item.name || 'Headout Activity',
                price: typeof item.price === 'number' ? item.price : 0,
                currency: '$',
                coordinates: { lat: item.latitude || 0, lng: item.longitude || 0 },
                bookingUrl: item.url,
                provider: 'Headout',
                rating: item.rating || 0,
                duration: item.duration || 'Varies',
                imageUrl: item.image_url || item.imageUrl,
                description: `Book this activity in ${location} through Headout.`,
            }));
        } catch (error) {
            console.error('Headout fetch error:', error);
            return [];
        }
    }
}
