import Groq from 'groq-sdk';

// Initialize the Groq client
const groq = new Groq({
    apiKey: process.env.GROQ_API_KEY,
});

/**
 * Extracted trip parameters from natural language input
 */
export interface TripParams {
    destination: string;
    originCity?: string;
    startDate: string;   // YYYY-MM-DD
    endDate: string;     // YYYY-MM-DD
    travelers: number;
    budgetUSD: number;
    tripVibe: string[];  // e.g. ['romantic', 'adventure']
}

/**
 * Schema description for the LLM
 */
const schemaDescription = `{
  "destination": "string - the destination city/country",
  "originCity": "string | null - the origin city if mentioned",
  "startDate": "string - travel start date in YYYY-MM-DD format",
  "endDate": "string - travel end date in YYYY-MM-DD format",
  "travelers": "number - number of travelers (default 2 if not specified)",
  "budgetUSD": "number - total budget in USD (default 3000 if not specified)",
  "tripVibe": "string[] - array of trip vibes like 'romantic', 'adventure', 'relaxing', 'cultural', 'foodie', 'family', 'luxury', 'budget'"
}`;

/**
 * Extracts structured trip parameters from a natural language prompt using Groq LLM
 * @param prompt - The user's natural language travel request
 * @returns Parsed TripParams object
 */
export async function extractTripParams(prompt: string): Promise<TripParams> {
    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];

    // Calculate a reasonable default end date (7 days from start)
    const defaultEndDate = new Date(today);
    defaultEndDate.setDate(defaultEndDate.getDate() + 7);
    const defaultEndStr = defaultEndDate.toISOString().split('T')[0];

    const systemPrompt = `You are a precise API parameter extractor. Today is ${todayStr}. 

Convert the user's travel request into a valid JSON object matching this schema:
${schemaDescription}

Important rules:
1. If dates are relative (e.g., 'next Friday', 'in 2 weeks', 'next month'), calculate the exact YYYY-MM-DD date based on today's date.
2. If no dates are specified, use today as startDate and 7 days from today as endDate.
3. If duration is mentioned (e.g., '10 days'), calculate endDate from startDate.
4. Default travelers to 2 if not specified.
5. Default budgetUSD to 3000 if not specified. Convert from other currencies if needed.
6. Infer tripVibe from context (e.g., 'honeymoon' -> ['romantic'], 'hiking trip' -> ['adventure', 'nature']).
7. Return ONLY the JSON object, no additional text or markdown.`;

    try {
        const completion = await groq.chat.completions.create({
            messages: [
                {
                    role: 'system',
                    content: systemPrompt,
                },
                {
                    role: 'user',
                    content: prompt,
                },
            ],
            model: 'llama-3.3-70b-versatile',
            response_format: { type: 'json_object' },
            temperature: 0.1, // Low temperature for consistent extraction
            max_tokens: 500,
        });

        const content = completion.choices[0]?.message?.content;

        if (!content) {
            throw new Error('No response from Groq');
        }

        const parsed = JSON.parse(content) as TripParams;

        // Validate and provide defaults
        return {
            destination: parsed.destination || 'Unknown',
            originCity: parsed.originCity || undefined,
            startDate: parsed.startDate || todayStr,
            endDate: parsed.endDate || defaultEndStr,
            travelers: parsed.travelers || 2,
            budgetUSD: parsed.budgetUSD || 3000,
            tripVibe: Array.isArray(parsed.tripVibe) ? parsed.tripVibe : [],
        };
    } catch (error) {
        console.error('Error extracting trip params:', error);

        // Return sensible defaults on error
        return {
            destination: prompt.split(' ').slice(-1)[0] || 'Unknown', // Try to get last word as destination
            startDate: todayStr,
            endDate: defaultEndStr,
            travelers: 2,
            budgetUSD: 3000,
            tripVibe: [],
        };
    }
}
