

import { GoogleGenAI } from '@google/genai';
import dotenv from 'dotenv';
import { startCapture } from './logger.js';

dotenv.config();

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
  raw_grounding_chunks?: any[];  // 🆕 For debugging
}

export class GeminiGroundingAgent {
  private ai: GoogleGenAI;

  constructor() {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error('GEMINI_API_KEY not found in environment variables');
    }
    
    this.ai = new GoogleGenAI({
      apiKey: apiKey
    });
  }

  

  /**
   * Main method: Get venue recommendations with Maps grounding
   */
  async getRecommendations(
    userPrompt: string,
    userLocation?: { lat: number; lng: number; name: string }
  ): Promise<GeminiGroundingResult> {
    const stopCapture: any = startCapture(userPrompt);
    let response: any = undefined;
    let groundingChunks: any[] = [];

    console.log('\n🌟 Gemini Grounding Agent starting...');
    console.log(`📝 User prompt: "${userPrompt}"`);
    if (userLocation) {
      console.log(`📍 User location: ${userLocation.name} (${userLocation.lat}, ${userLocation.lng})`);
    }
    
    try {
      const geminiPrompt = this.buildGroundingPrompt(userPrompt, userLocation);
      
      console.log('🔮 Calling Gemini with proper Maps grounding configuration...');
      
      // ✅ CORRECT CONFIG: Matches Python SDK structure
      const config: any = {
        tools: [
          { googleMaps: {} }  // Enable Maps grounding tool
        ]
      };

      // Add location context if available
      if (userLocation) {
        config.toolConfig = {
          retrievalConfig: {
            latLng: {
              latitude: userLocation.lat,
              longitude: userLocation.lng
            }
          }
        };
        console.log(`🗺️ Location context configured: (${userLocation.lat}, ${userLocation.lng})`);
      }

      // Call Gemini with Maps grounding
      response = await this.ai.models.generateContent({
        model: 'gemini-2.5-flash',  // ✅ Use 2.5, not 2.0-exp
        contents: geminiPrompt,
        config: config
      });
      console.log(response);
      const text = response?.text || '';
      
      console.log('✅ Gemini response received');
      console.log(`📄 Response length: ${text.length} characters`);
      
      // Check grounding metadata
      const candidate = response.candidates?.[0];
      const groundingMetadata = candidate?.groundingMetadata;
      
      console.log('\n🔍 Grounding Metadata Analysis:');
      console.log('   candidate exists:', !!candidate);
      console.log('   groundingMetadata exists:', !!groundingMetadata);
      
      const grounding_used = !!groundingMetadata?.groundingChunks && groundingMetadata.groundingChunks.length > 0;
      const search_used = !!groundingMetadata?.searchEntryPoint;
      
      console.log(`📊 Grounding status: Maps=${grounding_used}, Search=${search_used}`);
      
      // Log grounding chunks details
      if (groundingMetadata?.groundingChunks) {
        groundingChunks = groundingMetadata.groundingChunks;
        console.log(`📍 Grounding chunks: ${groundingChunks.length} total`);
        
        // Log first 5 sources
        groundingChunks.forEach((chunk: any, idx: number) => {
          if (chunk.maps) {
            console.log(`   ${idx + 1}. [MAPS] ${chunk.maps.title}`);
            if (chunk.maps.placeId) {
              console.log(`      placeId: ${chunk.maps.placeId}`);
            }
            if (chunk.maps.uri) {
              console.log(`      uri: ${chunk.maps.uri}`);
            }
          } else if (chunk.web) {
            console.log(`   ${idx + 1}. [WEB] ${chunk.web.title}`);
          }
        });
      } else {
        console.log('⚠️ No grounding chunks found - Maps grounding may not have triggered');
        console.log('   This could mean:');
        console.log('   1. Query didn\'t need Maps data');
        console.log('   2. Maps grounding not available for this query type');
        console.log('   3. Location context not sufficient');
      }
      
      // Parse the response
      const parsed = await this.parseGeminiResponse(text, grounding_used);
      
      console.log(`✨ Parsed ${parsed.venues.length} venue recommendations`);
      if (parsed.plan) {
        console.log(`📋 Plan: ${parsed.plan.type}, ${parsed.plan.total_stops} stops`);
      }
      
      return {
        plan: parsed.plan,
        venues: parsed.venues,
        context: parsed.context,
        grounding_used,
        search_used,
        total_venues_found: parsed.venues.length,
        raw_grounding_chunks: groundingChunks
      };
      
    } catch (error) {
      console.error('❌ Gemini Grounding Agent error:', error);
      
      if (error instanceof Error) {
        console.error('   Error message:', error.message);
        console.error('   Error stack:', error.stack);
      }
      
      return {
        plan: undefined,
        venues: [],
        context: 'Failed to get recommendations from Gemini',
        grounding_used: false,
        search_used: false,
        total_venues_found: 0
      };
    } finally {
      try {
        if (stopCapture) {
          try { (stopCapture as any).appendRaw('gemini_raw_response', response); } catch (e) {}
          try { (stopCapture as any).appendRaw('grounding_chunks', groundingChunks); } catch (e) {}
          try { stopCapture('Completed'); } catch (e) {}
        }
      } catch (e) {}
    }
  }

  

  private buildGroundingPrompt(
    userPrompt: string,
    userLocation?: { lat: number; lng: number; name: string }
  ): string {
    
    let prompt = '';
    
    if (userLocation) {
      prompt += `User's current location: ${userLocation.name} (${userLocation.lat}, ${userLocation.lng})\n\n`;
    }
    
    prompt += `User request: "${userPrompt}"\n\n`;
    
    // ✅ SIMPLIFIED: Let Gemini use Maps grounding naturally without forcing JSON format
    prompt += `
🎯 DISTANCE SCALE (choose based on request):

**OVERRIDE:** If user says "walkable", "walking distance", "on foot" → ALWAYS use Neighborhood scale

**Neighborhood** (0.5-1 mile, 10-20 min walk)
- Triggers: "bar crawl in [area]", "day around [place]", "walking tour", "coffee shop hop"
- Example: "bar crawl in SoHo" → 4-5 bars within 0.5 miles, walking

**District** (1-2 miles, mix of walking + transit)  
- Triggers: "explore downtown", "afternoon in [area]", "visit the waterfront"
- Example: "explore downtown Boston" → 4-5 venues across 1-2 miles, walking + transit

**City-wide** (3-10 miles, transit/driving)
- Triggers: "explore [city]", "trip in [city]", "best of [city]", "visit [city]"
- Example: "explore NYC" → 5-6 landmarks across boroughs, transit/driving

📋 RETURN JSON:
{
  "plan": {
    "type": "Experience name",
    "total_stops": 5,
    "estimated_duration": "3-4 hours | Full day (8-10 hours)",
    "travel_mode": "walking | walking + transit | transit/driving",
    "theme": "Brief vibe description",
    "scale": "neighborhood | district | city-wide"
  },
  "venues": [
    {
      "name": "Exact Google Maps name",
      "description": "What makes it special (2-3 sentences)",
      "category": "bar | restaurant | cafe | museum | park | landmark",
      "reasoning": "Why it fits this request",
      "rating": 4.5,
      "reviewsSummary": "What people love",
      "general_location": "Area/neighborhood"
    }
  ]
}

Focus on logical routes and cohesive experiences.`;

    return prompt;
  }

  private async parseGeminiResponse(
    text: string,
    groundingUsed: boolean
  ): Promise<{ plan?: any; venues: GeminiVenueRecommendation[]; context: string }> {
    
    try {
      const jsonMatch = text.match(/```json\s*([\s\S]*?)\s*```/);
      
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[1]);
        
        if (parsed.venues && Array.isArray(parsed.venues)) {
          const venues: GeminiVenueRecommendation[] = parsed.venues.map((v: any) => ({
            name: v.name || 'Unknown',
            description: v.description || '',
            category: v.category || 'venue',
            reasoning: v.reasoning,
            general_location: v.general_location || v.location || v.neighborhood,
            placeId: v.placeId || v.place_id,
            rating: v.rating,
            userRatingCount: v.userRatingCount || v.reviewCount || v.user_rating_count,
            reviewsSummary: v.reviewsSummary || v.reviewInsights || v.review_summary,
            priceLevel: v.priceLevel || v.price_level,
            gemini_confidence: groundingUsed ? 0.9 : 0.7
          }));
          
          return {
            plan: parsed.plan,
            venues,
            context: parsed.context || 'Venue recommendations based on your request'
          };
        }
      }
      
      console.warn('⚠️ Could not parse JSON, attempting natural language parsing...');
      return this.parseNaturalLanguageResponse(text);
      
    } catch (error) {
      console.error('❌ Failed to parse Gemini response:', error);
      return this.parseNaturalLanguageResponse(text);
    }
  }

  private parseNaturalLanguageResponse(text: string): { plan?: any; venues: GeminiVenueRecommendation[]; context: string } {
    const venues: GeminiVenueRecommendation[] = [];
    
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
            description: 'Recommended venue',
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
}

export const geminiGroundingAgent = new GeminiGroundingAgent();