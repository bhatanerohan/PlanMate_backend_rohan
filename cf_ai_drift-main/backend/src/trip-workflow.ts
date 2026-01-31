import {
    WorkflowEntrypoint,
    WorkflowEvent,
    WorkflowStep,
} from "cloudflare:workers";
import { getDestinationCoords, randomOffset } from "./utils/geocoding";

// ============ Type Definitions ============

export interface TripWorkflowParams {
    tripId?: string; // Optional existing ID
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

        // Step 2: Fetch Options (with Strict Pre-Curation Geocoding)
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

                let stays: TripItem[] = [];
                staysResults.forEach((result) => {
                    if (result.status === 'fulfilled') {
                        stays.push(...result.value);
                    }
                });

                // Apply budget filter if provided
                stays = budgetPerNight ? stays.filter(s => s.price <= budgetPerNight) : stays;

                // Fetch activities from multiple providers in parallel
                const activityResults = await Promise.allSettled([
                    this.fetchHeadoutActivities(segment.location),
                    this.fetchKlookActivities(segment.location)
                ]);

                let activities: TripItem[] = [];
                activityResults.forEach((result) => {
                    if (result.status === 'fulfilled') {
                        activities.push(...result.value);
                    }
                });

                // De-duplicate similar activities (e.g., "Colosseum Tour" vs "Colosseum Ticket")
                activities = this.deduplicateActivities(activities);

                // Limit total activities per segment to avoid overwhelming the AI
                const MAX_ACTIVITIES = 20;
                activities = shuffleArray(activities).slice(0, MAX_ACTIVITIES);

                // ============ STRICT PRE-CURATION GEOCODING ============
                console.log(`📍 ${segment.location}: Geocoding ${stays.length} stays, ${activities.length} activities...`);

                // Collect all items needing geocoding (0,0 or missing)
                const allItems = [...stays, ...activities];
                const itemsNeedingGeo = allItems.filter(item =>
                    !item.coordinates || (item.coordinates.lat === 0 && item.coordinates.lng === 0)
                );

                if (itemsNeedingGeo.length > 0) {
                    // Prepare batch input
                    const batchInput = itemsNeedingGeo.map(item => ({
                        id: item.id,
                        query: `${item.name} ${segment.location}`
                    }));

                    // Stage 1: BrowserUse API
                    let resolved = await this.fetchBatchCoordinates(batchInput);

                    // Stage 2: LLM Fallback for remaining
                    const remaining = batchInput.filter(i => !resolved[i.id]);
                    if (remaining.length > 0 && remaining.length <= 10) {
                        // Only LLM fallback if reasonable number of items
                        const llmResolved = await this.geocodeWithLLM(remaining);
                        resolved = { ...resolved, ...llmResolved };
                    }

                    // Apply resolved coordinates
                    allItems.forEach(item => {
                        if (resolved[item.id]) {
                            item.coordinates = resolved[item.id];
                        }
                    });
                }

                // CRITICAL: Filter out items with invalid coordinates
                const validStays = stays.filter(s =>
                    s.coordinates && (s.coordinates.lat !== 0 || s.coordinates.lng !== 0)
                );
                const validActivities = activities.filter(a =>
                    a.coordinates && (a.coordinates.lat !== 0 || a.coordinates.lng !== 0)
                );

                // Ensure minimum activities - fallback to city center if too few
                const MIN_ACTIVITIES = 5;
                if (validActivities.length < MIN_ACTIVITIES) {
                    console.warn(`⚠️ Only ${validActivities.length} valid activities for ${segment.location}. Adding city center fallbacks...`);
                    const center = getDestinationCoords(segment.location);

                    // Add missing activities with city center coords
                    for (const activity of activities.filter(a => !validActivities.includes(a))) {
                        if (validActivities.length >= MIN_ACTIVITIES) break;
                        activity.coordinates = {
                            lat: randomOffset(center.lat, 0.02),
                            lng: randomOffset(center.lng, 0.02)
                        };
                        validActivities.push(activity);
                    }
                }

                segmentsData.push({
                    segment,
                    stays: shuffleArray(validStays),
                    activities: validActivities
                });

                totalStays += validStays.length;
                totalActivities += validActivities.length;
                console.log(`✅ ${segment.location}: ${validStays.length} valid stays, ${validActivities.length} valid activities`);
            }

            console.log(`✅ Total: ${totalStays} stays and ${totalActivities} activities (all geocoded)`);

            return { segmentsData, totalStays, totalActivities };
        });

        // Step 3: Curate Itinerary (Monolithic Single-Pass)
        const curatedItinerary = await step.do("curate-itinerary", async (): Promise<CuratedItinerary> => {
            console.log("🎨 Step 3: Curating itinerary (Monolithic Curator)...");

            const { skeleton, tripParams } = skeletonResult;
            const { segmentsData } = options;

            // Calculate overall trip dates
            const firstDateStr = skeleton[0]?.checkIn || todayStr;
            const lastDateStr = skeleton[skeleton.length - 1]?.checkOut || firstDateStr;
            const startDate = new Date(firstDateStr);
            const endDate = new Date(lastDateStr);

            // Calculate total days (inclusive)
            const diffTime = Math.abs(endDate.getTime() - startDate.getTime());
            const totalDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;

            console.log(`📅 Generating ${totalDays}-day plan for ${tripParams.destination}...`);

            // Build full options context (all segments combined)
            // Create a lookup map for hydration later
            const allOptionsMap = new Map<string, any>();

            // Build compact context for the AI prompt
            const fullOptionsContext = segmentsData.map(({ segment, stays, activities }) => {
                // Add to lookup map
                [...stays, ...activities].forEach(item => {
                    allOptionsMap.set(item.id, item);
                    allOptionsMap.set(item.name.toLowerCase(), item);
                });

                return {
                    location: segment.location,
                    checkIn: segment.checkIn,
                    checkOut: segment.checkOut,
                    stays: stays.slice(0, 5).map(s => ({
                        id: s.id,
                        name: s.name,
                        price: s.price,
                        rating: s.rating || 0
                    })),
                    activities: activities.slice(0, 15).map(a => ({
                        id: a.id,
                        name: a.name,
                        price: a.price,
                        rating: a.rating || 0,
                        desc: a.description?.substring(0, 60) || ""
                    }))
                };
            });

            // Build date-to-location mapping
            const dateLocationMap: Record<string, string> = {};
            for (let i = 0; i < totalDays; i++) {
                const d = new Date(startDate);
                d.setDate(startDate.getDate() + i);
                const dateStr = d.toISOString().split('T')[0];

                // Find which segment this date belongs to
                const seg = segmentsData.find(({ segment }) => {
                    const segStart = new Date(segment.checkIn).getTime();
                    const segEnd = new Date(segment.checkOut).getTime();
                    return d.getTime() >= segStart && d.getTime() < segEnd;
                }) || segmentsData[segmentsData.length - 1];

                dateLocationMap[dateStr] = seg.segment.location;
            }

            // Construct monolithic prompt
            const monolithicPrompt = `You are a Master Travel Curator creating a complete ${totalDays}-day itinerary.

USER REQUEST: "${params.userPrompt}"

TRIP DATES: ${firstDateStr} to ${lastDateStr}
BUDGET: $${tripParams.budgetUSD} USD total
TRAVELERS: ${tripParams.travelers}

AVAILABLE OPTIONS PER SEGMENT:
${JSON.stringify(fullOptionsContext, null, 2)}

DATE-TO-CITY MAPPING:
${JSON.stringify(dateLocationMap, null, 2)}

STRICT RULES:
1. Create exactly ${totalDays} days (Day 1 through Day ${totalDays}).
2. Each day MUST have 3-5 items with realistic times (morning 09:00, afternoon 14:00, evening 19:00).
3. USE UNIQUE ACTIVITIES - do NOT repeat the same activity across multiple days.
4. VENUE DIVERSITY: Do NOT schedule two activities that visit the same landmark (e.g., do NOT visit "Colosseum Tour" on Monday and "Colosseum Ticket" on Tuesday). Pick the best one.
5. Reference activities by their exact "id" and "name" from the options provided.
6. Include meals (Breakfast, Lunch, Dinner) with type: "food".
7. For each day, use activities from the correct city based on the date.
8. ALLOWED TYPES: hotel, activity, food, museum, train, flight. Use "museum" for galleries/exhibits, "food" for meals.

ACCOMMODATION RULES (CRITICAL):
9. For EACH city segment, you MUST pick exactly ONE stay from the "stays" list.
10. ARRIVAL DAY (Day 1 of entire trip): Schedule "Check-in" or "Bag Drop" as the FIRST item of the day (e.g., 11:00 or 14:00). Then schedule activities AFTER.
11. NEW CITY ARRIVAL (mid-trip city change): Schedule "Check-in" immediately upon arrival in the new city, before other activities.
12. DEPARTURE FROM CITY: On the last day in a city (if changing cities OR last day of trip), schedule "Check-out" at 11:00.
13. For "Check-out", use the SAME hotel ID and name as the Check-in for that city.
14. Do NOT invent new hotels. Use the exact IDs provided in the stays list.

HOTEL ITEM FORMAT:
Check-in/Bag Drop: { "time": "11:00", "type": "hotel", "id": "[stay_id]", "name": "Check-in: [Hotel Name]", "description": "Check into your accommodation.", "price": [price] }
Check-out: { "time": "11:00", "type": "hotel", "id": "[stay_id]", "name": "Check-out: [Hotel Name]", "description": "Check out of your accommodation.", "price": 0 }

OUTPUT FORMAT (JSON only, no markdown):
{
  "days": [
    {
      "day": 1,
      "date": "YYYY-MM-DD",
      "location": "City Name",
      "title": "Creative Day Title",
      "theme": "Short Theme",
      "items": [
        { "time": "11:00", "type": "hotel", "id": "airbnb_0_123", "name": "Check-in: Cozy Apartment", "description": "Check into your accommodation.", "price": 150, "hasReel": false },
        { "time": "14:00", "id": "activity_id", "name": "Colosseum Tour", "description": "Iconic Roman amphitheater", "price": 50, "type": "activity", "hasReel": true, "instagramSearchTerm": "colosseum-rome-aesthetic" },
        { "time": "19:30", "name": "Dinner at Trattoria", "description": "Local cuisine", "price": 35, "type": "food", "hasReel": true, "instagramSearchTerm": "rome-trattoria-aesthetic" }
      ]
    }
  ]
}

REEL RULES:
- hasReel: Set to TRUE for famous landmarks, scenic spots, iconic restaurants, and photogenic locations.
- hasReel: Set to FALSE for logistics (check-in, check-out, generic meals, transfers).
- instagramSearchTerm: Only include if hasReel=true. Format: "attraction-city-aesthetic" (e.g., "uffizi-florence-aesthetic").`;

            console.log("🤖 Calling AI with monolithic prompt...");

            try {
                // @ts-ignore - response_format might not be in the strict type definition yet
                const response = await this.env.AI.run('@cf/meta/llama-3.3-70b-instruct-fp8-fast', {
                    messages: [
                        { role: 'system', content: 'You are a JSON-only API. Output valid JSON with no markdown formatting.' },
                        { role: 'user', content: monolithicPrompt }
                    ],
                    temperature: 0.4,
                    max_tokens: 8000,
                    response_format: { type: 'json_object' }
                });

                const rawResponse = (response as any).response || String(response);
                const cleanJson = rawResponse.replace(/```json/g, '').replace(/```/g, '').trim();

                console.log("📝 Parsing AI response...");
                let parsed: any;
                try {
                    parsed = JSON.parse(cleanJson);
                } catch (e) {
                    console.error("❌ JSON Parse Failed");
                    console.error("Raw response:", cleanJson.substring(0, 500));
                    throw e;
                }

                const rawDays = parsed.days || [];
                console.log(`✅ AI generated ${rawDays.length} days`);

                // Extract unique cities and resolve their coordinates dynamically
                const uniqueCities = [...new Set(rawDays.map((d: any) =>
                    d.location || dateLocationMap[d.date] || tripParams.destination
                ))] as string[];

                const cityCoordsMap = await this.resolveCityCoordinates(uniqueCities);
                console.log(`🌍 City coordinates resolved:`, Object.keys(cityCoordsMap));

                // Hydrate items with full data from options
                const hydratedDays = rawDays.map((day: any, idx: number) => {
                    const dayLocation = day.location || dateLocationMap[day.date] || tripParams.destination;

                    // Determine "Anchor Coordinate" for this day
                    // Best: Hotel coordinates for this city segment
                    // Fallback: City center from cityCoordsMap or static map
                    let dayAnchor: { lat: number; lng: number } | null = null;

                    // Find hotel/stay item for this day to use as anchor
                    const hotelItem = (day.items || []).find((i: any) =>
                        i.type === 'hotel' || i.name?.toLowerCase().includes('check-in')
                    );
                    if (hotelItem) {
                        const hotelStay = allOptionsMap.get(hotelItem.id) ||
                            Array.from(allOptionsMap.values()).find((s: any) =>
                                s.type === 'stay' && hotelItem.name?.includes(s.name)
                            );
                        if (hotelStay?.coordinates && hotelStay.coordinates.lat !== 0) {
                            dayAnchor = hotelStay.coordinates;
                        }
                    }

                    // Fallback to city coords
                    if (!dayAnchor) {
                        dayAnchor = cityCoordsMap[dayLocation] || getDestinationCoords(dayLocation);
                    }

                    const enrichedItems = (day.items || []).map((item: any) => {
                        // Detect if this is a Hotel/Check-in/Check-out item
                        if (item.type === 'hotel' || item.name?.toLowerCase().includes('check-in') || item.name?.toLowerCase().includes('check-out')) {
                            const isCheckOut = item.name?.toLowerCase().includes('check-out');

                            // Find matching stay by ID first, then by name fuzzy match
                            const stayById = allOptionsMap.get(item.id);
                            const stayByName = stayById || Array.from(allOptionsMap.values()).find(
                                (s: any) => s.type === 'stay' && item.name?.includes(s.name)
                            );
                            const stay = stayById || stayByName;

                            if (stay) {
                                return {
                                    ...item,
                                    id: stay.id,
                                    type: 'hotel',
                                    name: isCheckOut ? `Check-out: ${stay.name}` : `Check-in: ${stay.name}`,
                                    imageUrl: stay.imageUrl,
                                    bookingUrl: stay.bookingUrl,
                                    provider: stay.provider,
                                    coordinates: stay.coordinates,
                                    price: isCheckOut ? 0 : stay.price,
                                    currency: stay.currency || 'USD',
                                    rating: stay.rating,
                                    hasReel: false
                                };
                            }
                        }

                        // Try to find original by ID first, then by name
                        const original = allOptionsMap.get(item.id) ||
                            allOptionsMap.get(item.name?.toLowerCase());

                        // Helper to determine item type
                        const determineType = (itemName: string, aiType: string): string => {
                            const name = itemName?.toLowerCase() || '';
                            // Remap 'meal' to 'food'
                            if (aiType === 'meal') return 'food';
                            // Detect museums/galleries
                            if (/museum|gallery|exhibit|art|uffizi|louvre|vatican/i.test(name)) return 'museum';
                            // Detect food items
                            if (/breakfast|lunch|dinner|cafe|restaurant|trattoria|pizzeria/i.test(name)) return 'food';
                            // Keep valid types
                            if (['hotel', 'activity', 'food', 'museum', 'train', 'flight'].includes(aiType)) return aiType;
                            return 'activity';
                        };

                        if (original) {
                            return {
                                ...item,
                                id: original.id,
                                name: item.name || original.name,
                                type: determineType(item.name || original.name, item.type),
                                imageUrl: original.imageUrl,
                                coordinates: original.coordinates,
                                bookingUrl: original.bookingUrl,
                                provider: original.provider,
                                rating: original.rating,
                                price: item.price ?? original.price,
                                currency: original.currency || 'USD',
                                hasReel: item.hasReel ?? false,
                                instagramSearchTerm: item.instagramSearchTerm || null
                            };
                        } else {
                            // AI-generated or generic item (meals, etc.)
                            // Use day anchor (hotel coords) for smarter placement
                            return {
                                ...item,
                                id: item.id || `gen_${idx}_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
                                name: item.name || "Activity",
                                type: determineType(item.name, item.type),
                                coordinates: { lat: randomOffset(dayAnchor.lat, 0.015), lng: randomOffset(dayAnchor.lng, 0.015) },
                                imageUrl: null,
                                hasReel: item.hasReel ?? false,
                                instagramSearchTerm: item.instagramSearchTerm || null
                            };
                        }
                    });

                    return {
                        day: day.day || idx + 1,
                        date: day.date,
                        location: dayLocation,
                        title: day.title || `Day ${idx + 1}`,
                        subtitle: day.theme || dayLocation,
                        items: enrichedItems
                    };
                });

                console.log("✅ Itinerary curation complete");

                // Calculate actual total from hydrated items
                const realTotalCost = hydratedDays.reduce((total: number, day: any) => {
                    const dayCost = (day.items || []).reduce((sum: number, item: any) => sum + (item.price || 0), 0);
                    return total + dayCost;
                }, 0);
                console.log(`💰 Calculated total cost: $${realTotalCost}`);

                // Construct final result
                const curatedResult: CuratedItinerary = {
                    id: params.tripId || `trip_${Date.now()}`,
                    destination: skeleton.map(s => s.location).join(' → '),
                    dates: `${firstDateStr} to ${lastDateStr}`,
                    totalBudget: realTotalCost,
                    currency: "USD",
                    travelers: tripParams.travelers,
                    days: hydratedDays,
                    isDemo: params.userPrompt.includes('--demo'),
                };

                return curatedResult;

            } catch (error) {
                console.error("❌ Monolithic curation failed:", error);

                // Fallback: Generate minimal itinerary
                const fallbackDays = [];
                for (let i = 0; i < totalDays; i++) {
                    const d = new Date(startDate);
                    d.setDate(startDate.getDate() + i);
                    const dateStr = d.toISOString().split('T')[0];
                    const location = dateLocationMap[dateStr] || tripParams.destination;

                    fallbackDays.push({
                        day: i + 1,
                        date: dateStr,
                        location,
                        title: `Day ${i + 1} in ${location}`,
                        subtitle: location,
                        items: [
                            { id: `fb_${i}_1`, time: "10:00", name: "Morning Exploration", description: "Discover the city", price: 0, type: "activity", coordinates: getDestinationCoords(location), hasReel: false },
                            { id: `fb_${i}_2`, time: "14:00", name: "Lunch", description: "Local cuisine", price: 20, type: "meal", coordinates: getDestinationCoords(location), hasReel: false },
                            { id: `fb_${i}_3`, time: "19:00", name: "Evening Relaxation", description: "Unwind after a day of exploration", price: 0, type: "activity", coordinates: getDestinationCoords(location), hasReel: false }
                        ]
                    });
                }

                return {
                    id: params.tripId || `trip_${Date.now()}`,
                    destination: skeleton.map(s => s.location).join(' → '),
                    dates: `${firstDateStr} to ${lastDateStr}`,
                    totalBudget: tripParams.budgetUSD,
                    currency: "USD",
                    travelers: tripParams.travelers,
                    days: fallbackDays,
                    isDemo: true,
                };
            }
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
            console.log('🔍 [Diagnostic] Airbnb Raw Keys:', Object.keys(data));
            const listings = data.result?.data?.listings || data.data?.listings || [];

            return listings.map((listing: any, index: number) => {
                if (index === 0) {
                    console.log('🔍 [Diagnostic] Airbnb Sample Listing:', JSON.stringify(listing, null, 2));
                }
                return {
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
                };
            });
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
            console.log('🔍 [Diagnostic] Booking Raw Keys:', Object.keys(data));
            const listings = data.result?.data?.listings || data.data?.hotels || [];

            return listings.map((listing: any, index: number) => {
                if (index === 0) {
                    console.log('🔍 [Diagnostic] Booking Sample Listing:', JSON.stringify(listing, null, 2));
                }
                return {
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
                };
            });
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
            console.log('🔍 [Diagnostic] Headout Raw Keys:', Object.keys(data));
            const listings = data.result?.data?.listings || data.data?.activities || [];

            return listings.map((item: any, index: number) => {
                if (index === 0) {
                    console.log('🔍 [Diagnostic] Headout Sample Listing:', JSON.stringify(item, null, 2));
                }
                return {
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
                };
            });
        } catch (error) {
            console.error('Headout fetch error:', error);
            return [];
        }
    }

    /**
     * Batch geocode a list of items using the BrowserUse Google Maps Skill.
     * This allows us to fix multiple items (like "Lunch" or "Headout Activity") in a single API call.
     */
    private async fetchBatchCoordinates(items: { id: string; query: string }[]): Promise<Record<string, { lat: number; lng: number }>> {
        if (items.length === 0) return {};

        const apiKey = this.env.BROWSER_USE_API_KEY;
        if (!apiKey) {
            console.warn("⚠️ Skipping geocoding: No BROWSER_USE_API_KEY");
            return {};
        }

        console.log(`🗺️ Batch geocoding ${items.length} final itinerary items...`);

        // Skill ID for "Google Maps Scout" from aggregators.ts
        const skillId = 'da022610-68fd-443f-a856-a109dc7b8243';
        const endpoint = `https://api.browser-use.com/api/v2/skills/${skillId}/execute`;

        try {
            const response = await fetch(endpoint, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Browser-Use-API-Key': apiKey
                },
                body: JSON.stringify({
                    parameters: {
                        parameter: {
                            // The skill expects a simple array of location strings
                            locations: items.map(i => i.query)
                        }
                    }
                })
            });

            if (!response.ok) {
                console.error(`Geocoding API failed: ${response.status} ${response.statusText}`);
                return {};
            }

            const json = await response.json() as any;
            // The API returns { data: { "Query String": { latitude: 123, longitude: 456 } } }
            const data = json.result?.data || {};

            const results: Record<string, { lat: number; lng: number }> = {};

            // Map the results back to Item IDs with FUZZY matching
            items.forEach(item => {
                const query = item.query;
                // Try exact match first, then fuzzy includes match
                const key = Object.keys(data).find(k =>
                    k === query ||
                    k.toLowerCase().includes(query.toLowerCase()) ||
                    query.toLowerCase().includes(k.toLowerCase())
                );

                if (key && data[key]?.latitude && data[key]?.longitude) {
                    results[item.id] = { lat: data[key].latitude, lng: data[key].longitude };
                }
            });

            // Check for failures
            const failedItems = items.filter(item => !results[item.id]);

            if (failedItems.length > 0) {
                console.warn(`⚠️ Failed to geocode ${failedItems.length} items. Queries sent:`);
                failedItems.forEach(item => {
                    console.warn(`   ❌ [ID: ${item.id}] Query: "${item.query}"`);
                });

                // Log the raw response keys for debugging
                console.log('🔍 Diagnostic - Raw API Keys returned:', Object.keys(data));
            }

            console.log(`✅ Successfully geocoded ${Object.keys(results).length}/${items.length} items`);
            return results;

        } catch (error) {
            console.error("Batch geocoding error:", error);
            return {};
        }
    }

    /**
     * Fallback geocoder using LLM to generate coordinates.
     * Used when BrowserUse API fails to geocode items.
     */
    private async geocodeWithLLM(items: { id: string; query: string }[]): Promise<Record<string, { lat: number; lng: number }>> {
        if (items.length === 0) return {};
        console.log(`🧠 Fallback: Asking LLM for ${items.length} locations...`);

        const list = items.map(i => `ID: ${i.id} | Query: ${i.query}`).join('\n');
        const prompt = `You are a Geocoding Engine.
INPUT:
${list}

TASK: Return a JSON object mapping IDs to {lat, lng} coordinates.
Use your knowledge to provide the most accurate real-world coordinates for these places.
If generic (e.g. "Lunch"), provide coordinates for the city center mentioned in the query.
Return JSON ONLY.`;

        try {
            const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.env.GROQ_API_KEY}`,
                },
                body: JSON.stringify({
                    model: 'llama-3.3-70b-versatile',
                    response_format: { type: 'json_object' },
                    messages: [
                        { role: 'system', content: prompt },
                        { role: 'user', content: "Geocode these items." }
                    ]
                })
            });

            const json = await response.json() as any;
            const content = json.choices?.[0]?.message?.content || '{}';
            const parsed = JSON.parse(content);

            console.log(`✅ LLM geocoded ${Object.keys(parsed).length} items`);
            return parsed;
        } catch (e) {
            console.error("LLM geocoding failed:", e);
            return {};
        }
    }

    /**
     * Resolve coordinates for a list of cities using Groq LLM.
     * Used as fallback when static `getDestinationCoords` doesn't have the city.
     */
    private async resolveCityCoordinates(cities: string[]): Promise<Record<string, { lat: number; lng: number }>> {
        if (cities.length === 0) return {};
        console.log(`🌍 Resolving coordinates for ${cities.length} cities: ${cities.join(', ')}`);

        const prompt = `Geocode these cities. Return a JSON object where each key is the city name and value is { "lat": number, "lng": number }.
Cities: ${cities.join(', ')}
Return ONLY valid JSON, no explanation.`;

        try {
            const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.env.GROQ_API_KEY}`
                },
                body: JSON.stringify({
                    model: 'llama-3.3-70b-versatile',
                    response_format: { type: 'json_object' },
                    messages: [{ role: 'user', content: prompt }]
                })
            });

            const json = await response.json() as any;
            const content = json.choices?.[0]?.message?.content || '{}';
            const parsed = JSON.parse(content);

            console.log(`✅ Resolved coordinates for ${Object.keys(parsed).length} cities`);
            return parsed;
        } catch (e) {
            console.error("City geocoding failed:", e);
            return {};
        }
    }

    /**
     * Fetch Klook activities via Browser Use API
     */
    private async fetchKlookActivities(location: string): Promise<TripItem[]> {
        const apiKey = this.env.BROWSER_USE_API_KEY;
        if (!apiKey) {
            console.warn('⚠️ BROWSER_USE_API_KEY not configured, skipping Klook fetch');
            return [];
        }

        const apiEndpoint = 'https://api.browser-use.com/api/v2/skills/ebf4715e-4bf3-4263-8bf2-af82aeef3829/execute';

        try {
            console.log(`🎫 Fetching Klook activities for ${location}...`);

            const response = await fetch(apiEndpoint, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Browser-Use-API-Key': apiKey,
                },
                body: JSON.stringify({
                    parameters: {
                        location,
                        date: null,
                        max_price: null,
                        currency: 'USD',
                    },
                }),
            });

            if (!response.ok) {
                console.error(`❌ Klook API error: ${response.status} ${response.statusText}`);
                return [];
            }

            const data = await response.json() as any;
            const responseData = data.result?.data || data.data || data;
            const items: any[] = responseData.activities || responseData.results || responseData.items || [];

            if (!Array.isArray(items)) {
                console.warn('⚠️ Unexpected Klook API response format');
                return [];
            }

            console.log(`✅ Received ${items.length} Klook activities`);

            // Map to TripItem format
            return items.map((item, i) => {
                let price = 0;
                if (typeof item.price === 'number') {
                    price = item.price;
                } else if (typeof item.price === 'string') {
                    price = parseFloat(item.price.replace(/[^0-9.]/g, '')) || 0;
                }

                return {
                    id: `klook_${Date.now()}_${i}`,
                    name: item.title || item.name || 'Klook Activity',
                    description: item.description || `Book this activity in ${location} through Klook.`,
                    type: 'activity' as const,
                    provider: 'Klook',
                    coordinates: { lat: 0, lng: 0 },
                    price,
                    currency: 'USD',
                    rating: item.rating || 0,
                    imageUrl: item.image_url || item.imageUrl || item.image || item.photo || '',
                    bookingUrl: item.activity_url || item.url || `https://www.klook.com/search/?query=${encodeURIComponent(location)}`,
                    hasReel: false
                };
            });

        } catch (error) {
            console.error('❌ Error fetching Klook activities:', error);
            return [];
        }
    }

    /**
     * De-duplicate activities that are essentially the same attraction
     * (e.g., "Colosseum Guided Tour" and "Colosseum Skip-the-Line Ticket")
     */
    private deduplicateActivities(activities: TripItem[]): TripItem[] {
        const unique: TripItem[] = [];
        const seenNames = new Set<string>();

        for (const act of activities) {
            // Normalize name: remove common tour/ticket words
            const normalized = act.name.toLowerCase()
                .replace(/skip[- ]the[- ]line|ticket|tour|entry|access|guided|priority|reserved|admission|pass|experience/gi, '')
                .replace(/[^a-z0-9]/g, '') // Remove punctuation/spaces
                .trim();

            // Skip if normalized name is too short (probably just generic words)
            if (normalized.length < 4) {
                unique.push(act);
                continue;
            }

            // Check for fuzzy match against already seen names
            const isDuplicate = Array.from(seenNames).some(seen =>
                seen.includes(normalized) || normalized.includes(seen)
            );

            if (!isDuplicate) {
                seenNames.add(normalized);
                unique.push(act);
            }
        }

        console.log(`🔄 Deduplicated ${activities.length} → ${unique.length} unique activities`);
        return unique;
    }
}
