import Groq from 'groq-sdk';

// Initialize the Groq client
const groq = new Groq({
    apiKey: process.env.GROQ_API_KEY,
});

/**
 * Activity input for geocoding
 */
interface ActivityInput {
    id: string;
    name: string;
    city: string;
}

/**
 * Geocoded coordinates
 */
interface Coordinates {
    lat: number;
    lng: number;
}

/**
 * Geocode a list of activities using Groq LLM
 * 
 * Uses the LLM to provide real-world coordinates for activity venues/meeting points.
 * Falls back to city center coordinates if the specific venue is unknown.
 * 
 * @param activities - Array of activities with id, name, and city
 * @returns Promise resolving to a Record mapping activity IDs to coordinates
 */
export async function geocodeActivities(
    activities: ActivityInput[]
): Promise<Record<string, Coordinates>> {
    // Return empty object for empty input
    if (!activities || activities.length === 0) {
        return {};
    }

    // Format the input for the LLM
    const inputLines = activities.map(activity =>
        `ID: ${activity.id} | Name: ${activity.name} | City: ${activity.city}`
    ).join('\n');

    const systemPrompt = `You are a precise Geocoding Engine. I will provide a list of activity names and cities.

TASK: Return a JSON object where keys are the Activity IDs and values are { lat: number, lng: number } coordinates.

CONSTRAINTS:
1. Provide real-world coordinates for the venue/meeting point.
2. If the specific venue is unknown, use the city center coordinates.
3. Latitude must be between -90 and 90.
4. Longitude must be between -180 and 180.
5. Return ONLY the JSON object, no additional text.

EXAMPLE OUTPUT:
{
  "activity_123": { "lat": 35.6762, "lng": 139.6503 },
  "activity_456": { "lat": 48.8566, "lng": 2.3522 }
}`;

    try {
        const completion = await groq.chat.completions.create({
            messages: [
                {
                    role: 'system',
                    content: systemPrompt,
                },
                {
                    role: 'user',
                    content: `Please geocode the following activities:\n\n${inputLines}`,
                },
            ],
            model: 'llama-3.3-70b-versatile',
            response_format: { type: 'json_object' },
            temperature: 0.1, // Low temperature for consistent geocoding
            max_tokens: 2000,
        });

        const content = completion.choices[0]?.message?.content;

        if (!content) {
            console.warn('⚠️ No response from Groq geocoding');
            return {};
        }

        const parsed = JSON.parse(content) as Record<string, Coordinates>;

        // Validate and clean the response
        const result: Record<string, Coordinates> = {};

        for (const [id, coords] of Object.entries(parsed)) {
            if (
                coords &&
                typeof coords.lat === 'number' &&
                typeof coords.lng === 'number' &&
                coords.lat >= -90 && coords.lat <= 90 &&
                coords.lng >= -180 && coords.lng <= 180
            ) {
                result[id] = {
                    lat: coords.lat,
                    lng: coords.lng,
                };
            } else {
                console.warn(`⚠️ Invalid coordinates for ${id}:`, coords);
            }
        }

        console.log(`📍 Geocoded ${Object.keys(result).length}/${activities.length} activities`);
        return result;

    } catch (error) {
        console.error('❌ Error geocoding activities:', error);
        return {};
    }
}

/**
 * Geocode a single location/activity
 * 
 * @param name - Name of the place/activity
 * @param city - City where it's located
 * @returns Promise resolving to coordinates or null if failed
 */
export async function geocodeLocation(
    name: string,
    city: string
): Promise<Coordinates | null> {
    const result = await geocodeActivities([{ id: 'single', name, city }]);
    return result['single'] || null;
}
