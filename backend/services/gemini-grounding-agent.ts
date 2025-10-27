// backend/services/gemini-grounding-agent.ts

import { GoogleGenAI } from '@google/genai';  // ✅ CORRECT PACKAGE
import dotenv from 'dotenv';

dotenv.config();

/**
 * Gemini Grounding Agent - Uses Google's Gemini with Maps grounding
 * 
 * Purpose: Understand context and provide venue recommendations with rich descriptions
 * Returns: Venue suggestions with synthesized insights from Maps + Search grounding
 */

export interface GeminiVenueRecommendation {
  name: string;
  description: string;
  category: string;
  reasoning?: string;
  general_location?: string;
  
  placeId?: string;
  rating?: number;
  userRatingCount?: number;
  reviewsSummary?: string;
  priceLevel?: string;
  
  gemini_confidence?: number;
}

export interface GeminiGroundingResult {
  plan?: {
    type: string;
    total_stops: number;
    estimated_duration?: string;
    theme?: string;
    reasoning?: string;
  };
  venues: GeminiVenueRecommendation[];
  context: string;
  grounding_used: boolean;
  search_used: boolean;
  total_venues_found: number;
}

export class GeminiGroundingAgent {
  private ai: GoogleGenAI;

  constructor() {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error('GEMINI_API_KEY not found in environment variables');
    }
    
    // Initialize with correct SDK
    this.ai = new GoogleGenAI({
      apiKey: apiKey
    });
  }

  /**
   * Main method: Get venue recommendations with grounding
   * 🆕 NOW HANDLES PLANNING + GROUNDING (Agent 1 is dormant)
   */
  async getRecommendations(
    userPrompt: string,
    userLocation?: { lat: number; lng: number; name: string }
  ): Promise<GeminiGroundingResult> {
    
    console.log('\n🌟 Gemini Grounding Agent starting...');
    console.log(`📝 User prompt: "${userPrompt}"`);
    
    try {
      // Build enhanced prompt for Gemini (handles planning + grounding)
      const geminiPrompt = this.buildGroundingPrompt(userPrompt, userLocation);
      
      console.log('🔮 Calling Gemini with Maps grounding...');
      
      // Build config with Maps grounding
      const config: any = {
        // Enable Google Maps tool
        tools: [{ googleMaps: {} }],  // ✅ CORRECT SYNTAX for Maps grounding
      };

      // Add location context if user location is available
      if (userLocation) {
        config.toolConfig = {
          retrievalConfig: {
            latLng: {
              latitude: userLocation.lat,
              longitude: userLocation.lng
            }
          }
        };
      }

      // Call Gemini with Maps grounding
      const response = await this.ai.models.generateContent({
        model: 'gemini-2.0-flash-exp',
        contents: geminiPrompt,
        config: config
      });

      const text = response.text;
      
      console.log('✅ Gemini response received');
      if (typeof text === 'string') {
        console.log(`📄 Response length: ${text.length} characters`);
      } else {
        console.log('📄 Response is missing or undefined.');
      }
      
      // Check if grounding was used
      const groundingMetadata = response.candidates?.[0]?.groundingMetadata;
      const grounding_used = !!groundingMetadata?.groundingChunks;
      const search_used = false;  // We're using Maps, not Search
      
      console.log(`📊 Grounding status: Maps=${grounding_used}`);
      
      // Log grounding sources if available
      if (groundingMetadata?.groundingChunks) {
        console.log(`📍 Grounding sources: ${groundingMetadata.groundingChunks.length} chunks`);
        
        // Log first few sources
        groundingMetadata.groundingChunks.slice(0, 3).forEach((chunk: any, idx: number) => {
          if (chunk.maps) {
            console.log(`   ${idx + 1}. ${chunk.maps.title} - ${chunk.maps.uri}`);
          }
        });
      }
      
      // Parse the response
      const parsed = await this.parseGeminiResponse(text ?? '', grounding_used);
      
      console.log(`✨ Parsed ${parsed.venues.length} venue recommendations`);
      if (parsed.plan) {
        console.log(`📋 Plan details: ${parsed.plan.type}, ${parsed.plan.total_stops} stops`);
      }
      
      return {
        plan: parsed.plan,
        venues: parsed.venues,
        context: parsed.context,
        grounding_used,
        search_used,
        total_venues_found: parsed.venues.length
      };
      
    } catch (error) {
      console.error('❌ Gemini Grounding Agent error:', error);
      
      // Log full error for debugging
      if (error instanceof Error) {
        console.error('   Error message:', error.message);
        console.error('   Error stack:', error.stack);
      }
      
      // Graceful fallback - return empty result
      return {
        plan: undefined,
        venues: [],
        context: 'Failed to get recommendations from Gemini',
        grounding_used: false,
        search_used: false,
        total_venues_found: 0
      };
    }
  }

  /**
   * Build optimized prompt for Gemini grounding
   * 🆕 NOW HANDLES BOTH PLANNING + GROUNDING (Agent 1 is dormant)
   */
  private buildGroundingPrompt(
    userPrompt: string,
    userLocation?: { lat: number; lng: number; name: string }
  ): string {
    
    let prompt = '';
    
    // Context about user location
    if (userLocation) {
      prompt += `User's current location: ${userLocation.name} (${userLocation.lat}, ${userLocation.lng})\n\n`;
    }
    
    // Main request
    prompt += `User request: "${userPrompt}"\n\n`;
    
    // 🆕 NEW: Gemini handles BOTH planning AND recommendation
    prompt += `You are an expert travel planner and venue recommender. Your job is to:

STEP 1: PLAN THE EXPERIENCE
- Analyze the user's request and decide what type of experience they want
- Determine how many stops make sense (2-6 typically)
- Consider timing, distance, and flow
- Think about the theme and vibe

STEP 2: RECOMMEND SPECIFIC VENUES
- Use Google Maps data to find real, highly-rated venues
- Choose venues that create a cohesive experience
- Ensure venues are close together (walkable when possible)
- Consider the user's intent and preferences

For each venue, provide:

1. **Name**: Exact venue name as it appears on Google Maps
2. **Description**: Rich 2-3 sentence description including:
   - What makes it special or unique
   - Atmosphere and vibe
   - What people love about it (from reviews)
   - Best for what occasion/audience
   
3. **Category**: Type of venue (bar, restaurant, museum, park, cafe, etc.)
4. **Reasoning**: Brief explanation of why you picked this venue for THIS request
5. **Rating**: Star rating from Google Maps if available
6. **Review insights**: Synthesize what reviewers commonly mention
7. **Price level**: $ to $$$$ if available
8. **General location**: Neighborhood or area (e.g., "Fenway area", "North End")

**PLANNING GUIDELINES:**
- For "bar crawl": 4-5 bars, prioritize walkability and variety
- For "date night": 2-3 stops, prioritize romantic/intimate venues
- For "food tour": 3-4 stops, diverse cuisines, authentic local spots
- For "day out": 3-5 stops, mix of activities, consider energy flow
- For "best [X]": 3-5 top recommendations, explain what makes each special

**SELECTION CRITERIA:**
- Choose venues that are close together (0.3-0.5 miles apart ideal)
- Consider the time of day (brunch spots vs dinner spots)
- Think about the occasion (casual vs upscale, loud vs quiet)
- Prioritize highly-rated venues (4.0+ stars preferred)
- Include practical details (price level, good for groups, outdoor seating)
- Create a logical flow between venues

**IMPORTANT:**
- Use REAL venues from Google Maps data
- Include current information (hours, status)
- Cite Google Maps sources
- Ensure venues actually exist and are open

**FORMAT YOUR RESPONSE AS JSON:**
\`\`\`json
{
  "plan": {
    "type": "bar_crawl",
    "total_stops": 4,
    "estimated_duration": "3-4 hours",
    "theme": "Sports bars around Fenway Park",
    "reasoning": "Four venues within walking distance create ideal bar crawl flow"
  },
  "venues": [
    {
      "name": "Bleacher Bar",
      "description": "Legendary sports bar built into Fenway Park's center field wall. Perfect game-day atmosphere with craft beer selection and unique stadium views.",
      "category": "bar",
      "reasoning": "Perfect first stop - iconic Fenway location sets the theme",
      "rating": 4.5,
      "userRatingCount": 1247,
      "reviewsSummary": "Visitors praise the unique views into the stadium and lively atmosphere during games. Some note it gets crowded.",
      "priceLevel": "$$",
      "general_location": "Fenway"
    }
  ],
  "context": "These four bars create an ideal walking route around Fenway Park, covering just 0.3 miles. Start at Bleacher Bar for the iconic view, then move to Lansdowne Pub for live music..."
}
\`\`\`

Use Google Maps grounding to provide accurate, up-to-date recommendations with real venues.`;

    return prompt;
  }

  /**
   * Parse Gemini's response into structured format
   * 🆕 NOW INCLUDES PLANNING DATA
   */
  private async parseGeminiResponse(
    text: string,
    groundingUsed: boolean
  ): Promise<{ plan?: any; venues: GeminiVenueRecommendation[]; context: string }> {
    
    try {
      // Try to extract JSON from response
      const jsonMatch = text.match(/```json\s*([\s\S]*?)\s*```/);
      
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[1]);
        
        if (parsed.venues && Array.isArray(parsed.venues)) {
          // Map to our interface
          const venues: GeminiVenueRecommendation[] = parsed.venues.map((v: any) => ({
            name: v.name || 'Unknown',
            description: v.description || '',
            category: v.category || 'venue',
            reasoning: v.reasoning,
            general_location: v.general_location || v.location,
            placeId: v.placeId,
            rating: v.rating,
            userRatingCount: v.userRatingCount || v.reviewCount,
            reviewsSummary: v.reviewsSummary || v.reviewInsights,
            priceLevel: v.priceLevel,
            gemini_confidence: groundingUsed ? 0.9 : 0.7
          }));
          
          return {
            plan: parsed.plan,  // 🆕 NEW: Extract planning data
            venues,
            context: parsed.context || 'Venue recommendations based on your request'
          };
        }
      }
      
      // Fallback: Parse from natural language
      console.warn('⚠️ Could not parse JSON, attempting natural language parsing...');
      return this.parseNaturalLanguageResponse(text);
      
    } catch (error) {
      console.error('❌ Failed to parse Gemini response:', error);
      
      // Last resort: Try natural language parsing
      return this.parseNaturalLanguageResponse(text);
    }
  }

  /**
   * Fallback parser for natural language responses
   */
  private parseNaturalLanguageResponse(text: string): { plan?: any; venues: GeminiVenueRecommendation[]; context: string } {
    const venues: GeminiVenueRecommendation[] = [];
    
    // Simple pattern matching for venue names
    const venuePatterns = [
      /\d+\.\s*\*\*(.+?)\*\*/g,
      /\d+\.\s*(.+?)(?:\n|:)/g,
      /\*\*(.+?)\*\*\s*[-–—]\s*/g
    ];
    
    for (const pattern of venuePatterns) {
      const matches = text.matchAll(pattern);
      for (const match of matches) {
        if (match[1] && match[1].length > 3) {
          venues.push({
            name: match[1].trim(),
            description: 'Recommended venue (parse full description from text)',
            category: 'venue',
            gemini_confidence: 0.5
          });
        }
      }
      
      if (venues.length > 0) break;
    }
    
    return {
      plan: undefined,
      venues,
      context: 'Parsed from natural language response'
    };
  }

  /**
   * Validate that a recommendation has minimum required fields
   */
  private isValidRecommendation(venue: any): boolean {
    return !!(venue.name && venue.description && venue.category);
  }
}

// Export singleton instance
export const geminiGroundingAgent = new GeminiGroundingAgent();