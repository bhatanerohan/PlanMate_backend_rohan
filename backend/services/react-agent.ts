// backend/services/react-agent.ts

import OpenAI from 'openai';
import { toolRegistry } from './tools/tool-registry.js';
import { SafetyGuards } from './safety-guards.js';
import { RouteEvaluator } from './route-evaluator.js';
import { startCapture } from './logger.js';
import type {
  AgentState,
  AgentAction,
  ActionType,
  ReActResponse,
  SafetyConfig,
  ToolResult as ToolResultType
} from '../types/react-agent.js';
import { DEFAULT_SAFETY_CONFIG } from '../types/react-agent.js';

// ============================================================================
// INTERFACES
// ============================================================================

export interface GeminiVenueRecommendation {
  name: string;
  description: string;
  category: string;
  reasoning?: string;
  general_location?: string;
  priority?: 'must_have' | 'nice_to_have';
  placeId?: string;
  rating?: number;
  userRatingCount?: number;
  reviewsSummary?: string;
  priceLevel?: string;
  gemini_confidence?: number;
}

interface AgentMetadata {
  isItinerary: boolean;
  originalPrompt?: string;
  geminiRecommendations?: GeminiVenueRecommendation[];
  useGroundingMode?: boolean;
  searchPreference?: 'walkable' | 'spread';
  searchRadiusKm?: number;
  anchorLabel?: string;
  requestedCount?: number;
}

interface AlternativesMap {
  [primaryPlaceId: string]: {
    alternatives: any[];
    searchQuery: string;
  };
}

// ============================================================================
// NEW: Enriched Candidate Interface for Venue Selector
// ============================================================================

export interface EnrichedCandidate {
  placeId: string;
  name: string;
  address: string;
  location: { lat: number; lng: number };
  rating?: number;
  userRatingCount?: number;
  priceLevel?: string;
  photos?: string[];
  types?: string[];
  // Single representative photo URL (optional)
  photoUrl?: string;
  description: string;
  category: string;
  priority: 'must_have' | 'nice_to_have';
  reasoning?: string;
  reviewsSummary?: string;
  gemini_confidence?: number;
  enriched: boolean;
  enrichmentSource: 'google_places' | 'gemini_only';
  // Optional flag indicating this entry represents the user's current location
  isUserLocation?: boolean;
  // Instagram Reels attached to this venue
  instagramReels?: any[];
}

export interface EnrichmentResult {
  success: boolean;
  candidates: EnrichedCandidate[];
  must_have_count: number;
  nice_to_have_count: number;
  failed_count: number;
  executionTimeMs: number;
}

// ============================================================================
// REACT AGENT CLASS
// ============================================================================

export class ReActAgent {
  private openai: OpenAI;
  private safetyGuards: SafetyGuards;
  private config: SafetyConfig;
  private evaluator: RouteEvaluator;
  private alternativesMap: AlternativesMap = {};

  constructor(config: SafetyConfig = DEFAULT_SAFETY_CONFIG) {
    this.config = config;
    this.safetyGuards = new SafetyGuards(config);
    this.evaluator = new RouteEvaluator();
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY
    });
  }

  // ============================================================================
  // HELPER: Extract city from user location
  // ============================================================================

  private extractCityFromUserLocation(userLocation?: { lat: number; lng: number; name: string }): string | null {
    if (!userLocation || !userLocation.name) return null;

    const parts = userLocation.name.split(',').map((p: string) => p.trim());

    if (parts.length >= 3) {
      const city = parts[1];
      const state = parts[2];
      const isStateCode = state.length <= 3;
      return isStateCode ? `${city}, ${state}` : city;
    } else if (parts.length === 2) {
      return parts[0];
    }
    return parts[0];
  }

  // ============================================================================
  // NEW: ENRICH ALL CANDIDATES (for Venue Selector flow)
  // ============================================================================

  async enrichAllCandidates(
    geminiCandidates: GeminiVenueRecommendation[],
    userPrompt: string,
    userLocation?: { lat: number; lng: number; name: string }
  ): Promise<EnrichmentResult> {
    const startTime = Date.now();
    const stopCapture = startCapture(userPrompt);

    console.log('\n🔄 CANDIDATE ENRICHMENT MODE');
    console.log(`📦 Processing ${geminiCandidates.length} candidates from Gemini`);

    const mustHaves = geminiCandidates.filter(c => c.priority === 'must_have');
    const niceToHaves = geminiCandidates.filter(c => c.priority === 'nice_to_have');

    console.log(`   🎯 Must-have: ${mustHaves.length}`);
    console.log(`   ✨ Nice-to-have: ${niceToHaves.length}`);

    try {
      const locationHint = this.extractLocationHint(userPrompt, geminiCandidates);
      console.log(`📍 Location hint: ${locationHint}`);

      // Build all searches
      const allSearches = geminiCandidates.map(candidate => ({
        query: candidate.name,
        location: candidate.general_location || locationHint,
        limit: 1
      }));

      // Split into batches of 10 (tool limit)
      const BATCH_SIZE = 10;
      const batches: typeof allSearches[] = [];
      for (let i = 0; i < allSearches.length; i += BATCH_SIZE) {
        batches.push(allSearches.slice(i, i + BATCH_SIZE));
      }

      console.log(`\n🔍 Enriching ${allSearches.length} candidates in ${batches.length} batch(es)...`);

      // Process all batches and collect results
      const allResults: any[] = [];

      for (let batchIdx = 0; batchIdx < batches.length; batchIdx++) {
        const batch = batches[batchIdx];
        console.log(`\n   📦 Batch ${batchIdx + 1}/${batches.length} (${batch.length} searches)...`);

        const searchResult = await toolRegistry.executeTool(
          'batch_search_venues',
          { searches: JSON.stringify(batch) },
          { iteration: batchIdx + 1, timestamp: Date.now(), previousResults: [] }
        );

        if (searchResult.success && searchResult.data?.results) {
          allResults.push(...searchResult.data.results);
          console.log(`      ✅ Batch ${batchIdx + 1} complete: ${searchResult.data.results.length} results`);
        } else {
          console.error(`      ❌ Batch ${batchIdx + 1} failed:`, searchResult.error);
          // Add empty results for failed batch to maintain index alignment
          for (let i = 0; i < batch.length; i++) {
            allResults.push({ success: false, venues: [] });
          }
        }

        // Small delay between batches to avoid rate limiting
        if (batchIdx < batches.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 200));
        }
      }

      // Process all results
      const enrichedCandidates: EnrichedCandidate[] = [];
      let failedCount = 0;

      allResults.forEach((result: any, idx: number) => {
        const geminiCandidate = geminiCandidates[idx];
        if (!geminiCandidate) return;

        if (result.success && result.venues && result.venues.length > 0) {
          const placesVenue = result.venues[0];

          enrichedCandidates.push({
            placeId: placesVenue.placeId,
            name: placesVenue.name,
            address: placesVenue.address,
            location: placesVenue.location,
            rating: placesVenue.rating,
            userRatingCount: placesVenue.userRatingCount,
            priceLevel: placesVenue.priceLevel,
            photos: placesVenue.photos,
            types: placesVenue.types,
            description: geminiCandidate.description || placesVenue.description || '',
            category: geminiCandidate.category,
            priority: geminiCandidate.priority || 'nice_to_have',
            reasoning: geminiCandidate.reasoning,
            reviewsSummary: geminiCandidate.reviewsSummary,
            gemini_confidence: geminiCandidate.gemini_confidence,
            enriched: true,
            enrichmentSource: 'google_places'
          });

          console.log(`   ✅ ${geminiCandidate.name} → ${placesVenue.name} (${geminiCandidate.priority})`);
        } else {
          console.log(`   ⚠️ ${geminiCandidate.name} - not found in Google Places`);
          failedCount++;
        }
      });

      const enrichedMustHaves = enrichedCandidates.filter(c => c.priority === 'must_have');
      const enrichedNiceToHaves = enrichedCandidates.filter(c => c.priority === 'nice_to_have');

      console.log(`\n✅ ENRICHMENT COMPLETE`);
      console.log(`   Total enriched: ${enrichedCandidates.length}`);
      console.log(`   🎯 Must-have: ${enrichedMustHaves.length}`);
      console.log(`   ✨ Nice-to-have: ${enrichedNiceToHaves.length}`);
      console.log(`   ❌ Failed: ${failedCount}`);
      console.log(`   ⏱️ Time: ${Date.now() - startTime}ms`);

      return {
        success: enrichedCandidates.length > 0,
        candidates: enrichedCandidates,
        must_have_count: enrichedMustHaves.length,
        nice_to_have_count: enrichedNiceToHaves.length,
        failed_count: failedCount,
        executionTimeMs: Date.now() - startTime
      };

    } catch (error) {
      console.error('❌ Enrichment error:', error);
      return {
        success: false,
        candidates: [],
        must_have_count: 0,
        nice_to_have_count: 0,
        failed_count: geminiCandidates.length,
        executionTimeMs: Date.now() - startTime
      };
    } finally {
      if (stopCapture) {
        try { stopCapture('Enrichment completed'); } catch (e) { }
      }
    }
  }

  private extractLocationHint(userPrompt: string, candidates: GeminiVenueRecommendation[]): string {
    const patterns = [
      /\bin\s+([A-Za-z\s]+?)(?:\s+where|\s+with|\s*$)/i,
      /\baround\s+([A-Za-z\s]+?)(?:\s+where|\s+with|\s*$)/i,
      /\bnear\s+([A-Za-z\s]+?)(?:\s+where|\s+with|\s*$)/i,
    ];

    for (const pattern of patterns) {
      const match = userPrompt.match(pattern);
      if (match && match[1]) return match[1].trim();
    }

    const firstLocation = candidates.find(c => c.general_location)?.general_location;
    if (firstLocation) return firstLocation;

    const cityMatch = userPrompt.match(/\b(NYC|New York|Boston|LA|Los Angeles|Chicago|Miami|Seattle|SF|San Francisco)\b/i);
    if (cityMatch) return cityMatch[1];

    return 'nearby';
  }

  // ============================================================================
  // GROUNDING-ENHANCED EXECUTION MODE (Legacy - kept for compatibility)
  // ============================================================================

  async executeWithGrounding(
    userPrompt: string,
    geminiRecommendations: GeminiVenueRecommendation[],
    userLocation: { lat: number; lng: number; name: string },
    metadata?: AgentMetadata
  ): Promise<ReActResponse> {
    console.log('\n🌟 ReAct Agent: GROUNDING-ENHANCED MODE');
    console.log(`📍 Processing ${geminiRecommendations.length} Gemini recommendations`);

    this.alternativesMap = {};

    const state: AgentState = {
      status: 'thinking',
      currentIteration: 0,
      startTime: Date.now(),
      totalTokensUsed: 0,
      conversationHistory: [],
      toolResults: [],
      isInCorrectionMode: false,
      correctionAttempts: 0
    };

    try {
      state.currentIteration = 1;

      const locationHint = userPrompt.match(/in\s+([^,]+)/i)?.[1] ||
        geminiRecommendations[0]?.general_location ||
        this.extractCityFromUserLocation(userLocation);

      console.log('\n🔍 Searching for venues...');

      const exactSearches = geminiRecommendations.map(geminiVenue => ({
        query: geminiVenue.name,
        location: geminiVenue.general_location || locationHint,
        limit: 1
      }));

      const exactResult = await toolRegistry.executeTool(
        'batch_search_venues',
        { searches: JSON.stringify(exactSearches) },
        { iteration: 1, timestamp: Date.now(), previousResults: [] }
      );

      if (!exactResult.success || !exactResult.data?.results) {
        throw new Error('Failed to search for venues');
      }

      const primaryVenues: any[] = [];
      exactResult.data.results.forEach((result: any, idx: number) => {
        if (result.success && result.venues && result.venues.length > 0) {
          const venue = result.venues[0];
          venue.description = geminiRecommendations[idx]?.description || venue.description;
          venue.gemini_reasoning = geminiRecommendations[idx]?.reasoning;
          venue.gemini_review_summary = geminiRecommendations[idx]?.reviewsSummary;
          primaryVenues.push(venue);
        }
      });

      console.log(`✅ Found ${primaryVenues.length} venues`);

      const resultMessage = this.buildGroundingResultMessage(primaryVenues, geminiRecommendations);
      const selectedPlaceIds = primaryVenues.map(v => v.placeId);

      state.finalResult = resultMessage;
      state.finishParameters = {
        result: resultMessage,
        mode: metadata?.isItinerary ? 'route' : 'discovery',
        selected_venue_ids: selectedPlaceIds,
        alternatives_map: this.alternativesMap
      };
      state.status = 'complete';

      return {
        success: true,
        result: state.finalResult,
        state,
        iterations: 1,
        tokensUsed: state.totalTokensUsed,
        executionTimeMs: Date.now() - state.startTime,
        stoppedReason: 'completed'
      };

    } catch (error) {
      console.error('❌ Grounding-enhanced mode error:', error);
      return {
        success: false,
        state,
        iterations: state.currentIteration,
        tokensUsed: state.totalTokensUsed,
        executionTimeMs: Date.now() - state.startTime,
        stoppedReason: 'error',
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  private buildGroundingResultMessage(mergedVenues: any[], originalGeminiVenues: GeminiVenueRecommendation[]): string {
    let message = `🗺️ Here's your personalized itinerary!\n\n`;

    mergedVenues.forEach((venue, idx) => {
      const rating = venue.rating ? `${venue.rating}` : 'N/A';
      const priceLevel = venue.priceLevel || '';

      message += `${idx + 1}. **${venue.name}** (⭐ ${rating} • ${priceLevel})\n`;
      message += `   ${venue.description}\n`;

      if (venue.gemini_reasoning) {
        message += `   💡 ${venue.gemini_reasoning}\n`;
      }

      message += `\n`;
    });

    if (mergedVenues.length < originalGeminiVenues.length) {
      const missing = originalGeminiVenues.length - mergedVenues.length;
      message += `\n⚠️ Note: ${missing} venue(s) could not be verified.`;
    }

    return message;
  }

  // ============================================================================
  // STANDARD REACT EXECUTION MODE
  // ============================================================================

  async execute(
    userPrompt: string,
    userLocation?: { lat: number; lng: number; name: string },
    metadata?: AgentMetadata
  ): Promise<ReActResponse> {
    console.log('\n🤖 ReAct Agent: STANDARD MODE');
    console.log(`📝 Prompt: "${userPrompt}"`);

    this.alternativesMap = {};

    const state: AgentState = {
      status: 'thinking',
      currentIteration: 0,
      startTime: Date.now(),
      totalTokensUsed: 0,
      conversationHistory: [
        {
          role: 'system',
          content: this.getSystemPrompt(userLocation, metadata),
          timestamp: Date.now()
        },
        {
          role: 'user',
          content: userPrompt,
          timestamp: Date.now()
        }
      ],
      toolResults: [],
      isInCorrectionMode: false,
      correctionAttempts: 0
    };

    const stopCapture = startCapture(userPrompt);

    try {
      while (state.currentIteration < this.config.maxIterations) {
        state.currentIteration++;
        const iterationStart = Date.now();

        console.log(`\n--- Iteration ${state.currentIteration} ---`);

        // Check safety limits
        const safetyCheck = this.safetyGuards.checkBeforeIteration(state);
        if (!safetyCheck.safe) {
          console.log(`⚠️ Safety limit reached: ${safetyCheck.reason}`);
          state.status = 'stopped';
          break;
        }

        // THINK
        state.status = 'thinking';
        const action = await this.think(state);

        if (!action) {
          console.log('❌ No action returned from think step');
          state.status = 'failed';
          state.error = 'Failed to determine next action';
          break;
        }

        console.log(`🧠 Action: ${action.action}`);
        console.log(`   Reasoning: ${action.reasoning}`);

        // Handle finish action
        if (action.action === 'finish') {
          console.log('\n✅ Agent completed task');

          if (!action.parameters.result) {
            action.parameters.result = 'Task completed';
          }
          if (!action.parameters.mode) {
            action.parameters.mode = 'discovery';
          }

          if (action.parameters.mode === 'route' && action.parameters.selected_venues) {
            this.cleanAlternatives(action.parameters.selected_venues);
          }

          state.finalResult = action.parameters.result;
          state.finishParameters = {
            result: action.parameters.result,
            mode: action.parameters.mode,
            selected_venue_ids: action.parameters.selected_venues || [],
            alternatives_map: this.alternativesMap
          };
          state.status = 'complete';
          break;
        }

        // ACT
        state.status = 'acting';
        const result = await this.act(action, state);

        // OBSERVE
        state.status = 'observing';
        this.observe(action.action, result, state);

        console.log(`⏱️ Iteration ${state.currentIteration} took ${Date.now() - iterationStart}ms`);
      }

      if (state.currentIteration >= this.config.maxIterations && state.status !== 'complete') {
        state.status = 'stopped';
        state.error = 'Max iterations reached';
      }

      return {
        success: state.status === 'complete',
        result: state.finalResult,
        state,
        iterations: state.currentIteration,
        tokensUsed: state.totalTokensUsed,
        executionTimeMs: Date.now() - state.startTime,
        stoppedReason: state.status === 'complete' ? 'completed' :
          state.currentIteration >= this.config.maxIterations ? 'max_iterations' : 'error',
        error: state.error
      };

    } catch (error) {
      console.error('❌ Execute error:', error);
      return {
        success: false,
        state,
        iterations: state.currentIteration,
        tokensUsed: state.totalTokensUsed,
        executionTimeMs: Date.now() - state.startTime,
        stoppedReason: 'error',
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    } finally {
      if (stopCapture) {
        try { stopCapture('Completed'); } catch (e) { }
      }
    }
  }

  // ============================================================================
  // THINK - LLM reasoning step
  // ============================================================================

  // ============================================================================
  // THINK - LLM reasoning step (FIXED VERSION)
  // ============================================================================

  private async think(state: AgentState): Promise<AgentAction | null> {
    try {
      const messages = state.conversationHistory.map(msg => ({
        role: msg.role as 'system' | 'user' | 'assistant',
        content: msg.content
      }));

      const response = await this.openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages,
        temperature: 0.7,
        tools: [
          {
            type: 'function',
            function: {
              name: 'search_venues',
              description: 'Search for venues like restaurants, cafes, attractions',
              parameters: {
                type: 'object',
                properties: {
                  reasoning: { type: 'string', description: 'Why you are searching for this' },
                  query: { type: 'string', description: 'Search query (e.g., "Starbucks", "coffee shops", "parks")' },
                  location: { type: 'string', description: 'Location to search in (e.g., "Hudson Yards, New York", "Boston")' },
                  limit: { type: 'string', description: 'Max results (default: 5)' }
                },
                required: ['reasoning', 'query', 'location']
              }
            }
          },
          {
            type: 'function',
            function: {
              name: 'batch_search_venues',
              description: 'Search for multiple venue types in parallel',
              parameters: {
                type: 'object',
                properties: {
                  reasoning: { type: 'string', description: 'Why you are doing this batch search' },
                  searches: {
                    type: 'string',
                    description: 'JSON array of searches. Example: [{"query":"coffee","location":"Boston","limit":3}]'
                  }
                },
                required: ['reasoning', 'searches']
              }
            }
          },
          {
            type: 'function',
            function: {
              name: 'search_events',
              description: 'Search for events and activities',
              parameters: {
                type: 'object',
                properties: {
                  reasoning: { type: 'string', description: 'Why you are searching for events' },
                  query: { type: 'string', description: 'Event search query' },
                  location: { type: 'string', description: 'Location for events' },
                  date: { type: 'string', description: 'Date for events (optional)' }
                },
                required: ['reasoning', 'query', 'location']
              }
            }
          },
          {
            type: 'function',
            function: {
              name: 'finish',
              description: 'Complete the task and return results to user',
              parameters: {
                type: 'object',
                properties: {
                  reasoning: { type: 'string', description: 'Summary of what was accomplished' },
                  result: { type: 'string', description: 'Message to show the user' },
                  mode: { type: 'string', enum: ['discovery', 'route'], description: 'Type of result' },
                  selected_venues: {
                    type: 'array',
                    items: { type: 'string' },
                    description: 'Array of placeIds from search results'
                  }
                },
                required: ['reasoning', 'result', 'mode']
              }
            }
          }
        ],
        tool_choice: 'required'
      });

      if (response.usage) {
        state.totalTokensUsed += response.usage.total_tokens;
      }

      // Parse tool call (new format)
      const toolCall = response.choices[0]?.message?.tool_calls?.[0];
      if (!toolCall?.function) return null;

      const actionName = toolCall.function.name as ActionType;
      const args = JSON.parse(toolCall.function.arguments || '{}');

      // Extract reasoning and parameters
      const reasoning = args.reasoning || 'No reasoning provided';
      delete args.reasoning;  // Remove from parameters

      const action: AgentAction = {
        action: actionName,
        reasoning: reasoning,
        parameters: args
      };

      state.conversationHistory.push({
        role: 'assistant',
        content: `Reasoning: ${action.reasoning}\nAction: ${action.action}`,
        timestamp: Date.now(),
        iteration: state.currentIteration
      });

      return action;

    } catch (error) {
      console.error('Think error:', error);
      return null;
    }
  }

  // ============================================================================
  // ACT - Execute tool
  // ============================================================================

  private async act(action: AgentAction, state: AgentState): Promise<ToolResultType> {
    console.log(`   📤 Parameters:`, JSON.stringify(action.parameters));
    try {
      const execResult = await toolRegistry.executeTool(
        action.action,
        action.parameters,
        {
          iteration: state.currentIteration,
          timestamp: Date.now(),
          previousResults: state.toolResults
        }
      );

      const toolResultRecord: ToolResultType = {
        action: action.action,
        success: !!execResult.success,
        data: execResult.data,
        error: execResult.error,
        timestamp: Date.now(),
        iteration: state.currentIteration
      };

      state.toolResults.push(toolResultRecord);

      return toolResultRecord;

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      const errorResult: ToolResultType = {
        action: action.action,
        success: false,
        error: errorMessage,
        timestamp: Date.now(),
        iteration: state.currentIteration
      };

      state.toolResults.push({
        action: action.action,
        success: false,
        error: errorResult.error,
        timestamp: errorResult.timestamp,
        iteration: errorResult.iteration
      });

      return errorResult;
    }
  }

  // ============================================================================
  // OBSERVE - Process results
  // ============================================================================

  private observe(actionName: ActionType, result: ToolResultType, state: AgentState): void {
    let observation: string;

    if (!result.success) {
      observation = `Action '${actionName}' failed. Error: ${result.error}`;
    } else {
      switch (actionName) {
        case 'batch_search_venues':
          const batchResults = result.data?.results || [];
          const compactSummary = batchResults.map((r: any) => {
            if (!r.success || !r.venues?.length) return `${r.query}:0`;
            const venueList = r.venues.map((v: any) =>
              `${v.name}|${v.placeId}|${v.rating || 'N/A'}⭐`
            ).join(';');
            return `${r.query}(${r.count}):[${venueList}]`;
          }).join(' || ');
          observation = `Batch: ${compactSummary}`;
          break;

        case 'search_venues':
          const venues = result.data?.venues || [];
          if (venues.length === 0) {
            observation = `Found 0 venues`;
          } else {
            const venueList = venues.map((v: any) =>
              `${v.name}|${v.placeId}|${v.rating || 'N/A'}⭐`
            ).join(';');
            observation = `Found ${venues.length}: [${venueList}]`;
          }
          break;

        case 'search_events':
          const events = result.data?.events || [];
          observation = events.length === 0
            ? `Found 0 events`
            : `Found ${events.length} events`;
          break;

        default:
          observation = `Action '${actionName}' succeeded.`;
      }
    }
    console.log(`   📊 Observation: ${observation.substring(0, 200)}`);

    state.conversationHistory.push({
      role: 'user',
      content: `OBSERVATION: ${observation}`,
      timestamp: Date.now(),
      iteration: state.currentIteration
    });
  }

  // ============================================================================
  // SYSTEM PROMPT
  // ============================================================================

  // In react-agent.ts, REPLACE the getSystemPrompt method:

  private getSystemPrompt(
    userLocation?: { lat: number; lng: number; name: string },
    metadata?: AgentMetadata
  ): string {
    const locationContext = userLocation
      ? `User's current location: ${userLocation.name} (${userLocation.lat}, ${userLocation.lng})`
      : 'User location not provided.';

    let preferenceContext = '';
    if (metadata?.searchPreference) {
      const radiusKm = metadata.searchRadiusKm || 1.5;
      const radiusMiles = (radiusKm / 1.609).toFixed(1);
      if (metadata.searchPreference === 'walkable') {
        preferenceContext = `Search preference: walkable.\n` +
          (userLocation ? `- Use near_coordinates with radius about ${radiusMiles} miles unless the prompt names a different anchor.\n` : '') +
          (metadata.anchorLabel ? `- Anchor hint: ${metadata.anchorLabel}\n` : '');
      } else {
        preferenceContext = `Search preference: spread out across the broader area.\n` +
          (metadata.anchorLabel ? `- Anchor hint: ${metadata.anchorLabel}\n` : '');
      }
    }
    const countContext = metadata?.requestedCount
      ? `User requested ${metadata.requestedCount} results. Prefer limit=${metadata.requestedCount} and return up to ${metadata.requestedCount} placeIds.`
      : 'Default to limit=10 when searching.';

    return `You are a travel assistant. ${locationContext}
${preferenceContext ? `\n${preferenceContext}` : ''}
${countContext ? `\n${countContext}` : ''}

=== TOOLS ===
- search_venues: Search for venues. Params: query, location, limit, optional near_coordinates + radius
- batch_search_venues: Search multiple types. Params: searches (array)
- search_events: Search events. Params: query, location, date
- finish: REQUIRED to return results. Params: result, mode, selected_venues

=== STRICT RULES ===
1. Default: DO MAXIMUM 2 SEARCHES then call finish
2. Default: After ANY successful search (venues found), IMMEDIATELY call finish
3. Exception: If the user asks for a route with MULTIPLE stops (e.g., "from X to Y to Z"),
   you MUST find all stops before finishing. Prefer ONE batch_search_venues call for all stops.
   In this case you may do up to 3 searches total.
4. Pass the placeIds from search results to finish's selected_venues array
5. If a search returns 0 results, try ONE broader search for that stop, then finish regardless

=== READING OBSERVATIONS ===
After search, you'll see: "Found X: [name|placeId|rating;name|placeId|rating;...]"
Extract the placeIds and include them in finish.

Example observation: "Found 3: [Starbucks|ChIJ123|4.2⭐;Starbucks Reserve|ChIJ456|4.5⭐]"
→ selected_venues: ["ChIJ123", "ChIJ456"]

=== MULTI-STOP EXAMPLE ===
User: "route from my location to Northeastern University to Starbucks near MIT"
Action: batch_search_venues
Parameters: {"searches":"[{\"query\":\"Northeastern University\",\"location\":\"Current location\"},{\"query\":\"Starbucks\",\"location\":\"MIT, Cambridge\"}]"}
Then finish with selected_venues in the same order as the route.

=== EXAMPLE ===
User: "find starbucks near hudson yards"

Iteration 1:
Action: search_venues
Parameters: {"query": "Starbucks", "location": "Hudson Yards, New York", "limit": "5"}

Observation: "Found 3: [Starbucks|ChIJxxx|4.2⭐;Starbucks|ChIJyyy|4.1⭐]"

Iteration 2:
Action: finish
Parameters: {
  "result": "Here are Starbucks locations near Hudson Yards:\\n1. Starbucks (4.2⭐)\\n2. Starbucks (4.1⭐)",
  "mode": "discovery",
  "selected_venues": ["ChIJxxx", "ChIJyyy"]
}

=== IF NO RESULTS ===
After 2 searches with 0 results:
Action: finish
Parameters: {
  "result": "I couldn't find Starbucks near Hudson Yards. Try searching for 'coffee shops' instead.",
  "mode": "discovery",
  "selected_venues": []
}

=== ITINERARY MODIFICATION ===
If the user asks to modify an existing itinerary (add/remove/replace):
1. ADJUST the list of selected venues based on the request.
2. In 'finish', the 'result' MUST be the COMPLETE updated itinerary.
   - RE-LIST ALL remaining stops with full descriptions.
   - Do NOT just say "I removed the stop".
   - Example: "Here is your updated itinerary:\n1. Place A\n2. Place B (new)\n3. Place C"
   - Ensure 'selected_venues' contains the updated list of placeIds in the correct order.

NEVER do more than 2-3 iterations. ALWAYS call finish.`;
  }
  // ============================================================================
  // HELPER: Clean alternatives map
  // ============================================================================

  private cleanAlternatives(selectedPlaceIds: string[]): void {
    const selectedSet = new Set(selectedPlaceIds);

    Object.keys(this.alternativesMap).forEach(placeId => {
      if (!selectedSet.has(placeId)) {
        delete this.alternativesMap[placeId];
      }
    });
  }
}

export const reactAgent = new ReActAgent();
