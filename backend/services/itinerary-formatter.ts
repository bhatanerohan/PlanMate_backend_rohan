import OpenAI from 'openai';
import { formatDistance, formatDuration } from './utils/route_optimizer.js';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

type FormatStop = {
  name: string;
  description?: string;
  category?: string;
  rating?: number;
  priceLevel?: string;
  reasoning?: string;
  reviewsSummary?: string;
  address?: string;
  isUserLocation?: boolean;
};

type RouteSegment = {
  from?: string;
  to?: string;
  distanceFormatted?: string;
  durationFormatted?: string;
  distanceKm?: number;
  durationMin?: number;
};

type FormatInput = {
  prompt?: string;
  plan?: {
    type?: string;
    estimated_duration?: string;
    travel_mode?: string;
    theme?: string;
  };
  stopCount: number;
  stops: FormatStop[];
  travelSegments: RouteSegment[];
  routeSummary?: {
    totalDistanceFormatted: string;
    totalDurationFormatted: string;
  };
};

export async function formatItineraryMessage(params: {
  prompt?: string;
  plan?: any;
  venues: any[];
  routes?: any[];
  isUpdate?: boolean; // 🆕 Added isUpdate flag
}): Promise<string | null> {
  if (!process.env.OPENAI_API_KEY) return null;
  if (!params.venues || params.venues.length === 0) return null;

  const stops: FormatStop[] = params.venues.map((v: any) => ({
    name: v?.name || 'Unknown',
    description: v?.description,
    category: v?.category,
    rating: v?.rating,
    priceLevel: v?.priceLevel,
    reasoning: v?.reasoning || v?.gemini_reasoning,
    reviewsSummary: v?.reviewsSummary,
    address: v?.address,
    isUserLocation: v?.placeId === 'user-location' || v?.isUserLocation
  }));

  const travelSegments: RouteSegment[] = (params.routes || []).map((seg: any) => ({
    from: seg?.from,
    to: seg?.to,
    distanceFormatted: seg?.distanceFormatted,
    durationFormatted: seg?.durationFormatted,
    distanceKm: seg?.distance,
    durationMin: seg?.duration
  }));

  const stopCount = stops.filter(stop => !stop.isUserLocation).length;
  let routeSummary: FormatInput['routeSummary'];
  if (travelSegments.length > 0) {
    let hasDistance = false;
    let hasDuration = false;
    const totalDistanceMeters = travelSegments.reduce((sum, seg) => {
      const km = Number(seg.distanceKm);
      if (Number.isFinite(km)) {
        hasDistance = true;
        return sum + km * 1000;
      }
      return sum;
    }, 0);
    const totalDurationSeconds = travelSegments.reduce((sum, seg) => {
      const min = Number(seg.durationMin);
      if (Number.isFinite(min)) {
        hasDuration = true;
        return sum + min * 60;
      }
      return sum;
    }, 0);
    if (hasDistance || hasDuration) {
      routeSummary = {
        totalDistanceFormatted: hasDistance ? formatDistance(totalDistanceMeters) : '',
        totalDurationFormatted: hasDuration ? formatDuration(totalDurationSeconds) : ''
      };
    }
  }

  const plan = params.plan
    ? {
      type: params.plan.type,
      estimated_duration: params.plan.estimated_duration,
      travel_mode: params.plan.travel_mode,
      theme: params.plan.theme
    }
    : undefined;

  const input: FormatInput & { isUpdate?: boolean } = {
    prompt: params.prompt,
    plan,
    stopCount,
    stops,
    travelSegments,
    routeSummary,
    isUpdate: params.isUpdate
  };

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      temperature: 0.6,
      messages: [
        {
          role: 'system',
          content: `You are a travel itinerary copywriter for a chat app.
Write a clear, engaging itinerary that feels like a helpful guide.

Formatting style (aim for this):
- Header: 
  - If isUpdate is false: "🌟 Here's your curated itinerary with X stops!" (use stopCount)
  - If isUpdate is true: Write a natural, concise confirmation of the changes made based on the prompt (e.g. "I've updated your plan and removed X...") then say "Here is your updated itinerary:"
- Then 1-2 concise lines for duration/travel mode/theme if available.
- List stops as a numbered list with this pattern:
  1. Stop Name (⭐ rating • priceLevel)
     Description sentence.
     💡 Why it matters (use reasoning if provided).
     📝 Reviews line (use reviewsSummary if provided).
     Travel: distance, duration (only between stops, if travelSegments provided).
- End with a "🚶 Route Details" section listing each segment and totals (if travelSegments exist).

Rules:
- Keep stop order exactly as provided.
- Do not invent stops, times, or facts.
- Use current venue data to write short, engaging descriptions/reasoning if fields are missing.
- Only include rating/price if provided.
- If routeSummary is provided, include "Total Distance" and "Total Duration" lines.
- If a stop is the user's location, label it as "Start: Your Location" and do not number it.
- Keep the output concise but informative (roughly 200-320 words).
- Avoid long paragraphs; keep each stop to short lines.`
        },
        {
          role: 'user',
          content: `Input JSON:\n${JSON.stringify(input, null, 2)}`
        }
      ]
    });

    const content = response.choices[0]?.message?.content?.trim();
    if (!content) return null;
    return content;
  } catch (error) {
    console.warn('Itinerary formatter failed:', error);
    return null;
  }
}
