/**
 * Trip Planner - Cloudflare Workers AI Version
 * 
 * Generates trip skeletons using Cloudflare Workers AI (Llama 3.3 70B)
 * instead of external Groq API.
 */

/**
 * Cloudflare Environment bindings
 */
export interface Env {
  AI: Ai;
}

/**
 * A logical segment of a trip (e.g., 3 nights in Tokyo, then 2 nights in Kyoto)
 */
export interface TripSegment {
  order: number;
  location: string;       // e.g. "Tokyo, Shinjuku"
  checkIn: string;        // YYYY-MM-DD
  checkOut: string;       // YYYY-MM-DD
  searchQueries: {
    stays: string;          // e.g. "Hotels in Shinjuku near station"
    activityKeywords: string[]; // e.g. ["TeamLabs", "Shibuya Crossing"]
  };
}

/**
 * Schema description for the LLM
 */
const schemaDescription = `[
  {
    "order": number,
    "location": "string - CITY NAME ONLY, e.g. 'Tokyo' or 'Paris' or 'Kyoto' (no neighborhoods, just the city)",
    "checkIn": "string - YYYY-MM-DD format",
    "checkOut": "string - YYYY-MM-DD format", 
    "searchQueries": {
      "stays": "string - hotel search query with specific neighborhood e.g. 'Boutique hotels in Shinjuku near train station'",
      "activityKeywords": ["array of specific attractions/activities e.g. 'TeamLabs Borderless', 'Shibuya Crossing', 'Meiji Shrine'"]
    }
  }
]`;

/**
 * Generates a trip skeleton by breaking down a user's trip request into logical segments
 * Each segment represents a stay in a specific location with dates and search queries
 * 
 * @param userPrompt - The user's natural language trip request
 * @param env - Cloudflare environment bindings with AI binding
 * @returns Array of TripSegment objects representing the logical breakdown of the trip
 */
export async function generateTripSkeleton(userPrompt: string, env: Env): Promise<TripSegment[]> {
  const today = new Date();
  const todayStr = today.toISOString().split('T')[0];

  const systemPrompt = `You are a Travel Logistics Architect. Today's date is ${todayStr}.

INPUT: A user's travel request (e.g., "10 days in Japan").

OUTPUT: A strict JSON array of TripSegments that breaks the trip into logical city/region hops with specific dates.

SCHEMA:
${schemaDescription}

RULES:
1. Break multi-city trips into separate segments (e.g., Tokyo → Kyoto → Osaka).
2. Calculate specific dates based on today's date and any mentioned timeframes.
3. For stays search queries, be specific about neighborhood/area and type of accommodation.
4. For activity keywords, include specific attractions, landmarks, neighborhoods, and experiences.
5. Each segment should be 2-4 nights unless the user specifies otherwise.
6. Order segments logically for efficient travel (nearby cities grouped together).
7. If dates are relative (e.g., "next month", "in 2 weeks"), calculate exact YYYY-MM-DD dates.
8. Return ONLY the JSON array, no additional text or markdown.

EXAMPLE:
Input: "10 days in Japan starting next week"
Output:
[
  {
    "order": 1,
    "location": "Tokyo",
    "checkIn": "2024-12-27",
    "checkOut": "2024-12-30",
    "searchQueries": {
      "stays": "Modern hotels in Shinjuku near JR station with city views",
      "activityKeywords": ["Shibuya Crossing", "Meiji Shrine", "TeamLab Borderless", "Harajuku", "Senso-ji Temple"]
    }
  },
  {
    "order": 2,
    "location": "Kyoto",
    "checkIn": "2024-12-30",
    "checkOut": "2025-01-02",
    "searchQueries": {
      "stays": "Traditional ryokan or boutique hotel in Gion district",
      "activityKeywords": ["Fushimi Inari", "Kinkaku-ji", "Arashiyama Bamboo Grove", "Geisha district", "Nishiki Market"]
    }
  },
  {
    "order": 3,
    "location": "Osaka",
    "checkIn": "2025-01-02",
    "checkOut": "2025-01-05",
    "searchQueries": {
      "stays": "Hotels in Namba near Dotonbori entertainment district",
      "activityKeywords": ["Dotonbori", "Osaka Castle", "Kuromon Market", "Universal Studios Japan", "Day trip to Nara"]
    }
  }
]`;

  try {
    console.log('🔍 Calling Cloudflare Workers AI for skeleton generation...');

    // Use Cloudflare Workers AI with Llama 3.3 70B
    const response = await env.AI.run('@cf/meta/llama-3.3-70b-instruct-fp8-fast', {
      messages: [
        {
          role: 'system',
          content: systemPrompt,
        },
        {
          role: 'user',
          content: userPrompt,
        },
      ],
      max_tokens: 2000,
      temperature: 0.3, // Slightly higher for creative city suggestions
    });

    // Extract response content - Workers AI returns { response: string }
    const content = typeof response === 'object' && 'response' in response
      ? (response as { response: string }).response
      : String(response);

    console.log('📦 Workers AI raw response:', content?.substring(0, 500));

    if (!content) {
      throw new Error('No response from Workers AI');
    }

    // Try to extract JSON from the response (handle markdown code blocks)
    let jsonContent = content;

    // Remove markdown code blocks if present
    const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) {
      jsonContent = jsonMatch[1].trim();
    }

    // Also try to find raw JSON array
    const arrayMatch = content.match(/\[[\s\S]*\]/);
    if (!jsonMatch && arrayMatch) {
      jsonContent = arrayMatch[0];
    }

    // Parse the response - handle array, object with segments key, or single segment object
    const parsed = JSON.parse(jsonContent);
    console.log('📋 Parsed type:', Array.isArray(parsed) ? 'array' : 'object', '| Keys:', Object.keys(parsed));

    let segments: TripSegment[];

    if (Array.isArray(parsed)) {
      // Response is already an array
      segments = parsed;
    } else if (parsed.segments || parsed.tripSegments || parsed.trip_segments || parsed.data) {
      // Response is an object with a segments array inside
      segments = parsed.segments || parsed.tripSegments || parsed.trip_segments || parsed.data;
    } else if (parsed.location && (parsed.checkIn || parsed.check_in)) {
      // Response is a single segment object - wrap it in an array
      console.log('📍 Detected single segment response, wrapping in array');
      segments = [parsed];
    } else {
      segments = [];
    }

    console.log(`✅ Extracted ${segments.length} segments`);

    // Validate and ensure required fields
    return segments.map((segment: any, index: number) => ({
      order: segment.order || index + 1,
      location: segment.location || 'Unknown Location',
      checkIn: segment.checkIn || segment.check_in || todayStr,
      checkOut: segment.checkOut || segment.check_out || todayStr,
      searchQueries: {
        stays: segment.searchQueries?.stays || segment.search_queries?.stays || `Hotels in ${segment.location}`,
        activityKeywords: Array.isArray(segment.searchQueries?.activityKeywords)
          ? segment.searchQueries.activityKeywords
          : Array.isArray(segment.search_queries?.activity_keywords)
            ? segment.search_queries.activity_keywords
            : [],
      },
    }));

  } catch (error) {
    console.error('❌ Error generating trip skeleton:', error);

    // Return a basic fallback skeleton
    const defaultCheckIn = new Date();
    const defaultCheckOut = new Date();
    defaultCheckOut.setDate(defaultCheckOut.getDate() + 7);

    return [{
      order: 1,
      location: userPrompt.split(' ').pop() || 'Unknown',
      checkIn: defaultCheckIn.toISOString().split('T')[0],
      checkOut: defaultCheckOut.toISOString().split('T')[0],
      searchQueries: {
        stays: `Hotels in ${userPrompt}`,
        activityKeywords: ['sightseeing', 'local cuisine', 'cultural attractions'],
      },
    }];
  }
}
