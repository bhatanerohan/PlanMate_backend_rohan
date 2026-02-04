// backend/services/gemini-grounding-agent.ts

import { GoogleGenAI } from '@google/genai';
import OpenAI from 'openai';
import dotenv from 'dotenv';
import { startCapture } from './logger.js';
import fs from 'fs';
import path from 'path';

dotenv.config();

// ============================================================================
// INTERFACES - Updated for 15-20 candidates with categorization
// ============================================================================

export interface GeminiVenueRecommendation {
  name: string;
  description: string;
  category: string;
  reasoning?: string;
  general_location?: string;

  // Priority: must_have = core intent, nice_to_have = complementary
  priority: 'must_have' | 'nice_to_have';

  // Optional enrichment data from grounding
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
    travel_mode?: string;
    scale?: string;
  };
  venues: GeminiVenueRecommendation[];
  context: string;
  grounding_used: boolean;
  search_used: boolean;
  total_venues_found: number;

  // NEW: Track user's requested count (if specified)
  user_requested_count?: number;

  // NEW: Separate counts for debugging
  must_have_count: number;
  nice_to_have_count: number;

  raw_grounding_chunks?: any[];
}

// ============================================================================
// GEMINI GROUNDING AGENT CLASS
// ============================================================================

export class GeminiGroundingAgent {
  private ai: GoogleGenAI;
  private openai: OpenAI;

  constructor() {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error('GEMINI_API_KEY not found in environment variables');
    }

    this.ai = new GoogleGenAI({ apiKey });
    this.openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }

  /**
   * Main method: Get 15-20 venue CANDIDATES with Maps grounding
   * Returns categorized venues for downstream selection
   */
  async getRecommendations(
    userPrompt: string,
    userLocation?: { lat: number; lng: number; name: string }
  ): Promise<GeminiGroundingResult> {
    const stopCapture: any = startCapture(userPrompt);
    let response: any = undefined;
    let groundingChunks: any[] = [];

    console.log('\n🌟 Gemini Grounding Agent starting (CANDIDATE MODE)...');
    console.log(`📝 User prompt: "${userPrompt}"`);
    if (userLocation) {
      console.log(`📍 User location: ${userLocation.name} (${userLocation.lat}, ${userLocation.lng})`);
    }

    try {
      // Extract user's requested count if specified
      const userRequestedCount = this.extractRequestedCount(userPrompt);
      if (userRequestedCount) {
        console.log(`🔢 User requested ${userRequestedCount} stops`);
      }

      const geminiPrompt = this.buildGroundingPrompt(userPrompt, userLocation, userRequestedCount);

      console.log('🔮 Calling Gemini for 15-20 CANDIDATES...');

      const config: any = {
        tools: [{ googleMaps: {} }]
      };

      const startTime = Date.now();
      console.log('⏱️ Starting Gemini API call...');

      if (userLocation) {
        config.toolConfig = {
          retrievalConfig: {
            latLng: {
              latitude: userLocation.lat,
              longitude: userLocation.lng
            }
          }
        };
        console.log(`🗺️ Location context: (${userLocation.lat}, ${userLocation.lng})`);
      }

      // Retry configuration
      const MAX_RETRIES = 3;
      const INITIAL_DELAY_MS = 1000;

      const isRetryableError = (error: any): boolean => {
        if (!error) return false;
        // Retry on 503 (service unavailable), 429 (rate limit), timeouts, network errors
        const status = error?.status || error?.statusCode;
        if (status === 503 || status === 429 || status === 500) return true;
        const message = String(error?.message || '').toLowerCase();
        return message.includes('timeout') ||
          message.includes('network') ||
          message.includes('econnreset') ||
          message.includes('unavailable');
      };

      for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        try {
          response = await this.ai.models.generateContent({
            model: 'gemini-2.5-flash-lite',
            contents: geminiPrompt,
            config
          });
          break; // Success, exit retry loop
        } catch (apiError) {
          console.error(`❌ Gemini API attempt ${attempt}/${MAX_RETRIES} failed:`, apiError);

          if (attempt === MAX_RETRIES || !isRetryableError(apiError)) {
            throw apiError; // Either max retries reached or non-retryable error
          }

          const delay = INITIAL_DELAY_MS * Math.pow(2, attempt - 1);
          console.log(`⏳ Retrying Gemini API in ${delay}ms (attempt ${attempt + 1}/${MAX_RETRIES})...`);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }

      const duration = Date.now() - startTime;
      console.log(`⏱️ Gemini API call took: ${duration}ms (${(duration / 1000).toFixed(2)}s)`);

      const text = response?.text || '';
      console.log('✅ Gemini response received');
      console.log(`📄 Response length: ${text.length} characters`);

      // LOGGING TO FILE
      try {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const outputDir = path.join(process.cwd(), 'output');
        if (!fs.existsSync(outputDir)) {
          fs.mkdirSync(outputDir, { recursive: true });
        }
        const logPath = path.join(outputDir, `gemini_output_${timestamp}.txt`);
        const logContent = `PROMPT:\n${geminiPrompt}\n\n${'='.repeat(50)}\n\nRESPONSE:\n${text}`;
        fs.writeFileSync(logPath, logContent);
        console.log(`📝 Logged Gemini output to ${logPath}`);
      } catch (err) {
        console.error('Failed to log Gemini output:', err);
      }

      // Check grounding metadata
      const candidate = response.candidates?.[0];
      const groundingMetadata = candidate?.groundingMetadata;

      const grounding_used = !!groundingMetadata?.groundingChunks?.length;
      const search_used = !!groundingMetadata?.searchEntryPoint;

      console.log(`📊 Grounding: Maps=${grounding_used}, Search=${search_used}`);

      if (groundingMetadata?.groundingChunks) {
        groundingChunks = groundingMetadata.groundingChunks;
        console.log(`📍 Grounding chunks: ${groundingChunks.length} sources`);
      }

      // Parse the response with new categorized format
      const parsed = await this.parseGeminiResponse(text, grounding_used);

      const mustHaveCount = parsed.venues.filter(v => v.priority === 'must_have').length;
      const niceToHaveCount = parsed.venues.filter(v => v.priority === 'nice_to_have').length;

      console.log(`\n✨ Parsed ${parsed.venues.length} CANDIDATES:`);
      console.log(`   🎯 Must-have: ${mustHaveCount}`);
      console.log(`   ✨ Nice-to-have: ${niceToHaveCount}`);

      if (parsed.plan) {
        console.log(`📋 Plan: ${parsed.plan.type}, ${parsed.plan.total_stops} target stops`);
      }

      return {
        plan: parsed.plan,
        venues: parsed.venues,
        context: parsed.context,
        grounding_used,
        search_used,
        total_venues_found: parsed.venues.length,
        user_requested_count: userRequestedCount,
        must_have_count: mustHaveCount,
        nice_to_have_count: niceToHaveCount,
        raw_grounding_chunks: groundingChunks
      };

    } catch (error) {
      console.error('❌ Gemini Grounding Agent error:', error);

      if (error instanceof Error && error.message === 'COULD_NOT_PARSE_JSON') {
        return {
          plan: undefined,
          venues: [],
          context: 'error pls try again',
          grounding_used: false,
          search_used: false,
          total_venues_found: 0,
          must_have_count: 0,
          nice_to_have_count: 0,
          raw_grounding_chunks: groundingChunks
        };
      }

      return {
        plan: undefined,
        venues: [],
        context: 'Failed to get recommendations from Gemini',
        grounding_used: false,
        search_used: false,
        total_venues_found: 0,
        must_have_count: 0,
        nice_to_have_count: 0
      };
    } finally {
      try {
        if (stopCapture) {
          try { (stopCapture as any).appendRaw('gemini_raw_response', response); } catch (e) { }
          try { (stopCapture as any).appendRaw('grounding_chunks', groundingChunks); } catch (e) { }
          try { stopCapture('Completed'); } catch (e) { }
        }
      } catch (e) { }
    }
  }

  /**
   * Extract user's requested venue count from prompt
   * e.g., "5 bars", "give me 3 restaurants", "I want to visit 7 places"
   */
  private extractRequestedCount(prompt: string): number | undefined {
    const patterns = [
      /(\d+)\s*(?:stops?|places?|venues?|locations?|spots?)/i,
      /(?:give me|find|show|suggest|recommend)\s*(\d+)/i,
      /(?:visit|try|check out)\s*(\d+)/i,
      /(\d+)\s*(?:bars?|restaurants?|cafes?|museums?|shops?)/i
    ];

    for (const pattern of patterns) {
      const match = prompt.match(pattern);
      if (match && match[1]) {
        const count = parseInt(match[1], 10);
        if (count >= 2 && count <= 10) {
          return count;
        }
      }
    }
    return undefined;
  }

  /**
   * Build prompt that requests 15-20 CANDIDATES with minimal fields
   * Only ask for name + priority, Places API provides the rest
   */
  private buildGroundingPrompt(
    userPrompt: string,
    userLocation?: { lat: number; lng: number; name: string },
    userRequestedCount?: number
  ): string {

    let prompt = '';

    if (userLocation) {
      prompt += `User location: ${userLocation.name} (${userLocation.lat}, ${userLocation.lng})\n\n`;
    }

    prompt += `Request: "${userPrompt}"\n\n`;

    const targetStops = userRequestedCount || 5;

    prompt += `Return 15-20 venue CANDIDATES as JSON. User wants ~${targetStops} final stops.

RULES:
- "must_have" = directly matches user intent (core request)
- "nice_to_have" = complementary/optional (nearby attractions)
- Return 5-8 must_have + 10-12 nice_to_have
- Use exact Google Maps venue names
- Spread venues geographically

JSON FORMAT:
\`\`\`json
{
  "plan": {
    "type": "Experience type",
    "total_stops": ${targetStops},
    "estimated_duration": "X hours",
    "travel_mode": "walking"
  },
  "venues": [
    { "name": "Exact Venue Name", "category": "restaurant", "priority": "must_have" },
    { "name": "Another Venue", "category": "park", "priority": "nice_to_have" }
  ]
}
\`\`\`

Return ONLY the JSON, no explanation.`;

    return prompt;
  }

  /**
   * Parse Gemini response - handles new categorized format
   */
  private async parseGeminiResponse(
    text: string,
    groundingUsed: boolean
  ): Promise<{ plan?: any; venues: GeminiVenueRecommendation[]; context: string }> {

    try {
      console.log('🔄 Parsing Gemini response...');

      // 1. Clean the text of markdown code blocks first
      let cleanText = text.replace(/```json\s*|\s*```/g, '').trim();

      // 2. Find the first '{' and last '}' to isolate the JSON object
      const firstOpen = cleanText.indexOf('{');
      const lastClose = cleanText.lastIndexOf('}');

      if (firstOpen !== -1 && lastClose !== -1 && lastClose > firstOpen) {
        cleanText = cleanText.substring(firstOpen, lastClose + 1);
      } else {
        console.warn('⚠️ Could not find valid JSON object markers `{}` in response');
      }

      // 3. Attempt parsing
      let parsed: any;
      try {
        parsed = JSON.parse(cleanText);
      } catch (e) {
        console.warn('⚠️ JSON parse failed on cleaned text, trying aggressive cleanup...');
        // Fallback: dangerous regex cleanup if simple extraction failed
        // This handles cases like comments in JSON or bad escaping if needed in simpler cases
        // But usually identifying the outer brackets is the most important step.
        throw new Error('COULD_NOT_PARSE_JSON');
      }

      if (parsed.venues && Array.isArray(parsed.venues)) {
        const venues: GeminiVenueRecommendation[] = parsed.venues.map((v: any) => ({
          name: v.name || 'Unknown',
          description: v.description || '',
          category: v.category || 'venue',
          priority: this.normalizePriority(v.priority),
          reasoning: v.reasoning,
          general_location: v.general_location || v.location || v.neighborhood,
          placeId: v.placeId || v.place_id,
          rating: v.rating,
          userRatingCount: v.userRatingCount || v.reviewCount || v.user_rating_count,
          reviewsSummary: v.reviewsSummary || v.reviewInsights || v.review_summary,
          priceLevel: v.priceLevel || v.price_level,
          gemini_confidence: groundingUsed ? 0.9 : 0.7
        }));

        // Validate we have both categories
        const mustHaves = venues.filter(v => v.priority === 'must_have');
        const niceToHaves = venues.filter(v => v.priority === 'nice_to_have');

        console.log(`   📊 Parsed: ${mustHaves.length} must_have, ${niceToHaves.length} nice_to_have`);

        // If Gemini didn't categorize properly, auto-categorize based on position
        if (mustHaves.length === 0 && venues.length > 0) {
          console.log('   ⚠️ No must_haves found, auto-categorizing first 5 as must_have');
          venues.slice(0, 5).forEach(v => v.priority = 'must_have');
          venues.slice(5).forEach(v => v.priority = 'nice_to_have');
        }

        return {
          plan: parsed.plan,
          venues,
          context: parsed.context || 'Venue candidates based on your request'
        };
      } else {
        // Valid JSON but missing 'venues' array
        console.warn('⚠️ Valid JSON but missing "venues" array');
        throw new Error('INVALID_SCHEMA');
      }

    } catch (error) {
      console.error('❌ Failed to parse Gemini response:', error);
      console.log('📄 Raw text start:', text.substring(0, 100));

      // Use GPT-4o-mini as intelligent fallback parser
      console.log('🔄 Attempting GPT-4o-mini cleanup parsing...');
      return await this.parseWithGPT(text, groundingUsed);
    }
  }

  /**
   * Normalize priority value from Gemini response
   */
  private normalizePriority(priority: any): 'must_have' | 'nice_to_have' {
    if (!priority) return 'nice_to_have';

    const normalized = String(priority).toLowerCase().replace(/[\s-]/g, '_');

    if (normalized.includes('must') || normalized === 'required' || normalized === 'core') {
      return 'must_have';
    }
    return 'nice_to_have';
  }

  /**
   * Fallback parser for non-JSON responses
   */
  private parseNaturalLanguageResponse(text: string): {
    plan?: any;
    venues: GeminiVenueRecommendation[];
    context: string
  } {
    const venues: GeminiVenueRecommendation[] = [];

    const venuePatterns = [
      /\d+\.\s*\*\*(.+?)\*\*/g,
      /\d+\.\s*(.+?)(?:\n|:)/g,
      /\*\*(.+?)\*\*\s*[-–—]\s*/g
    ];

    for (const pattern of venuePatterns) {
      const matches = text.matchAll(pattern);
      for (const match of matches) {
        if (match[1] && match[1].length > 3 && match[1].length < 100) {
          venues.push({
            name: match[1].trim(),
            description: 'Recommended venue',
            category: 'venue',
            priority: venues.length < 5 ? 'must_have' : 'nice_to_have',
            gemini_confidence: 0.5
          });
        }
      }

      if (venues.length >= 5) break;
    }

    return {
      plan: undefined,
      venues,
      context: 'Parsed from natural language response'
    };
  }

  /**
   * GPT-4o-mini fallback parser - uses AI to extract structured data from messy text
   */
  private async parseWithGPT(
    messyText: string,
    groundingUsed: boolean
  ): Promise<{ plan?: any; venues: GeminiVenueRecommendation[]; context: string }> {
    try {
      const response = await this.openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [{
          role: 'user',
          content: `Extract venue names from this text and return ONLY valid JSON.

INPUT TEXT:
${messyText}

RETURN THIS EXACT JSON FORMAT:
{
  "plan": {
    "type": "string describing the experience type",
    "total_stops": number
  },
  "venues": [
    { "name": "exact venue name", "priority": "must_have" },
    { "name": "another venue", "priority": "nice_to_have" }
  ]
}

RULES:
- Extract ALL venue names mentioned
- Core intent venues = "must_have", complementary = "nice_to_have"
- Return ONLY JSON, no explanation`
        }],
        response_format: { type: "json_object" },
        temperature: 0,
        max_tokens: 4000
      });

      const content = response.choices[0]?.message?.content;
      if (!content) {
        console.warn('⚠️ GPT-4o-mini returned empty response');
        return this.parseNaturalLanguageResponse(messyText);
      }

      const parsed = JSON.parse(content);

      if (parsed.venues && Array.isArray(parsed.venues)) {
        const venues: GeminiVenueRecommendation[] = parsed.venues.map((v: any) => ({
          name: v.name || 'Unknown',
          description: v.description || '',
          category: v.category || 'venue',
          priority: this.normalizePriority(v.priority),
          reasoning: v.reasoning,
          general_location: v.general_location || v.location,
          rating: v.rating,
          reviewsSummary: v.reviewsSummary,
          gemini_confidence: groundingUsed ? 0.8 : 0.6  // Slightly lower confidence for GPT-parsed
        }));

        console.log(`✅ GPT-4o-mini extracted ${venues.length} venues`);

        return {
          plan: parsed.plan,
          venues,
          context: parsed.context || 'Extracted via GPT-4o-mini cleanup'
        };
      }

      console.warn('⚠️ GPT-4o-mini response missing venues array');
      return this.parseNaturalLanguageResponse(messyText);

    } catch (error) {
      console.error('❌ GPT-4o-mini parsing failed:', error);
      // Ultimate fallback to regex parser
      return this.parseNaturalLanguageResponse(messyText);
    }
  }
}

export const geminiGroundingAgent = new GeminiGroundingAgent();