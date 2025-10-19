// backend/services/plan-creator-agent.ts
import OpenAI from 'openai';
import dotenv from 'dotenv';

dotenv.config();

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

export interface PlanStop {
  slot: number;
  category: string;
  description?: string;
}

export interface ItineraryPlan {
  planType: string;
  stops: PlanStop[];
  location: string;
  reasoning: string;
}

/**
 * Agent 1: Plan Creator
 * Creates high-level experience plans (what types of venues, how many stops)
 * Does NOT search for actual venues - that's Agent 2's job
 */
export class PlanCreatorAgent {
  /**
   * Create an itinerary plan based on user request
   */
  async createPlan(userPrompt: string, userLocation?: { lat: number; lng: number; name: string }): Promise<ItineraryPlan> {
    console.log('\n🎨 Agent 1: Plan Creator starting...');
    console.log(`📝 User request: "${userPrompt}"`);

    try {
      const response = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        temperature: 0.3, // Slight creativity for variety
        messages: [
          {
            role: 'system',
            content: this.getSystemPrompt(userLocation)
          },
          {
            role: 'user',
            content: userPrompt
          }
        ],
        response_format: { type: "json_object" }
      });

      const content = response.choices[0]?.message?.content;
      
      if (!content) {
        throw new Error('No response from Plan Creator');
      }

      const plan: ItineraryPlan = JSON.parse(content);

      // Validate plan structure
      if (!plan.planType || !plan.stops || !Array.isArray(plan.stops) || !plan.location) {
        throw new Error('Invalid plan structure from Agent 1');
      }

      if (plan.stops.length === 0) {
        throw new Error('Plan must have at least one stop');
      }

      console.log('✅ Plan created:');
      console.log(`   Type: ${plan.planType}`);
      console.log(`   Location: ${plan.location}`);
      console.log(`   Stops: ${plan.stops.length}`);
      plan.stops.forEach(stop => {
        console.log(`      ${stop.slot}. ${stop.category}${stop.description ? ` - ${stop.description}` : ''}`);
      });
      console.log(`   Reasoning: ${plan.reasoning}`);

      return plan;

    } catch (error) {
      console.error('❌ Plan Creator error:', error);
      throw error;
    }
  }

  /**
   * System prompt for Plan Creator
   */
  private getSystemPrompt(userLocation?: { lat: number; lng: number; name: string }): string {
    const locationContext = userLocation 
      ? `\n**User's current location:** ${userLocation.name} (${userLocation.lat}, ${userLocation.lng})`
      : '';

    return `You are an experience planner specializing in creating itineraries.

${locationContext}

=== YOUR JOB ===
Given a user request, create a simple plan structure:
1. Determine the plan type (bar_crawl, date_night, food_tour, etc.)
2. Decide how many stops (typically 3-5)
3. Choose venue categories for each stop

=== VENUE CATEGORIES ===
Use these categories:
- bar, club, pub, brewery
- restaurant, cafe, bakery
- dessert, ice cream
- park, museum, landmark
- theater, music venue
- store, boutique, market

Keep it SIMPLE - don't specify subtypes unless user explicitly requests them.
Examples:
- Just "bar" (not "sports bar" or "dive bar")
- Just "restaurant" (not "italian restaurant")
- Exception: If user says "fancy bar crawl" → you can add modifiers

=== PLAN TYPES & TYPICAL STRUCTURES ===

**bar_crawl** (3-5 stops)
- Multiple bars, optionally ending with club
- Example: bar, bar, bar, club

**food_tour** (3-5 stops)
- Multiple restaurants or food spots
- Can mix cuisines or focus on one
- Example: restaurant, restaurant, cafe, dessert

**date_night** (2-3 stops)
- Romantic sequence
- Example: bar, restaurant, dessert
- OR: restaurant, bar

**night_out** (3-4 stops)
- Party/social sequence
- Example: restaurant, bar, bar, club

**coffee_hopping** (3-4 stops)
- Multiple cafes
- Example: cafe, cafe, cafe

**shopping_tour** (4-6 stops)
- Multiple stores/boutiques
- Example: store, store, store, boutique, cafe

=== STOP COUNT GUIDELINES ===
- Bar crawl: 3-5 stops (4 is typical)
- Food tour: 3-5 stops (4 is typical)
- Date: 2-3 stops
- Night out: 3-4 stops
- Shopping: 4-6 stops

Use your judgment - don't force too many or too few stops.

=== OUTPUT FORMAT (JSON) ===
{
  "planType": "bar_crawl" or "date_night" etc,
  "stops": [
    {
      "slot": 1,
      "category": "bar",
      "description": "optional brief note"
    },
    {
      "slot": 2,
      "category": "bar"
    }
  ],
  "location": "fenway" or "boston" etc (extract from user query),
  "reasoning": "Brief explanation of why this structure makes sense"
}

=== EXAMPLES ===

Input: "bar crawl in fenway"
Output:
{
  "planType": "bar_crawl",
  "stops": [
    {"slot": 1, "category": "bar"},
    {"slot": 2, "category": "bar"},
    {"slot": 3, "category": "bar"},
    {"slot": 4, "category": "club"}
  ],
  "location": "fenway",
  "reasoning": "4 stops with variety ending at a club for dancing"
}

Input: "plan a romantic date in boston"
Output:
{
  "planType": "date_night",
  "stops": [
    {"slot": 1, "category": "bar", "description": "start with cocktails"},
    {"slot": 2, "category": "restaurant", "description": "romantic dinner"},
    {"slot": 3, "category": "dessert", "description": "sweet ending"}
  ],
  "location": "boston",
  "reasoning": "Classic date sequence: drinks, dinner, dessert"
}

Input: "food tour in north end"
Output:
{
  "planType": "food_tour",
  "stops": [
    {"slot": 1, "category": "restaurant"},
    {"slot": 2, "category": "restaurant"},
    {"slot": 3, "category": "bakery"},
    {"slot": 4, "category": "cafe"}
  ],
  "location": "north end",
  "reasoning": "Italian food tour with classic spots ending at cafe"
}

=== IMPORTANT ===
- Keep categories simple (bar, restaurant, cafe)
- Don't specify exact venues - that's not your job
- Focus on the STRUCTURE of the experience
- Always return valid JSON
`;
  }
}

// Export singleton instance
export const planCreatorAgent = new PlanCreatorAgent();