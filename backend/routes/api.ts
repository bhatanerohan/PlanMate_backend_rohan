// backend/routes/api.ts

import { Router, Request, Response } from 'express';
import { ReActAgent } from '../services/react-agent.js';
import { DEFAULT_SAFETY_CONFIG } from '../types/react-agent.js';
import { classifyIntent } from '../services/intent-classifier.js';
import { planCreatorAgent } from '../services/plan-creator-agent.js';

const router = Router();

router.post('/plan', async (req: Request, res: Response) => {
  try {
    const { prompt, userLocation } = req.body;

    // Basic validation
    if (!prompt || typeof prompt !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'Prompt is required and must be a string'
      });
    }
    
    // Log user location if provided
    if (userLocation) {
      console.log(`📍 User location: ${userLocation.name || 'Unknown'} (${userLocation.lat}, ${userLocation.lng})`);
    } else {
      console.log(`📍 User location: Not provided`);
    }

    if (prompt.trim().length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Prompt cannot be empty'
      });
    }

    console.log(`\n${'='.repeat(80)}`);
    console.log(`📥 Received request: "${prompt}"`);
    console.log('='.repeat(80));

    // ============================================================================
    // STEP 1: ENHANCED INTENT CLASSIFICATION (Determines routing)
    // ============================================================================
    console.log('\n🔍 Running intent classification...');
    
    let classification;
    try {
      classification = await classifyIntent(prompt);
    } catch (error) {
      console.error('❌ Classification failed:', error);
      return res.status(500).json({
        success: false,
        error: 'Failed to process request. Please try again.'
      });
    }

    console.log(`📊 Classification result:`, {
      isRelevant: classification.isRelevant,
      routeTo: classification.routeTo,
      queryType: classification.queryType
    });

    // ============================================================================
    // STEP 2: REJECT IF NOT RELEVANT
    // ============================================================================
    if (!classification.isRelevant) {
      console.log(`⛔ Query rejected: ${classification.reasoning}`);
      
      return res.status(400).json({
        success: false,
        error: 'not_relevant',
        message: "I can only help with location-based queries like finding venues, planning routes, or discovering events."
      });
    }

    // ============================================================================
    // STEP 3: ROUTE TO APPROPRIATE AGENT(S)
    // ============================================================================
    
    let finalPrompt = prompt;
    let agentResponse;

    // ROUTE A: Itinerary Planning → Agent 1 → Agent 2
    if (classification.routeTo === 'agent1') {
      console.log('\n📍 Routing: Agent 1 (Plan Creator) → Agent 2 (ReAct)');
      console.log('─'.repeat(80));

      // Step 3A: Agent 1 creates the plan
      const plan = await planCreatorAgent.createPlan(prompt, userLocation);

      // Step 3B: Convert plan to natural language prompt for Agent 2
      const categorySearches = plan.stops.map(stop => stop.category).join(', ');
      finalPrompt = `Find ${plan.stops.length} venues in ${plan.location}: ${categorySearches}. ` +
                   `These should be close together for a ${plan.planType}. ` +
                   `Create an itinerary with these venues in a logical walking route.`;

      console.log(`\n📝 Converted plan to Agent 2 prompt:`);
      console.log(`   "${finalPrompt}"`);
      console.log('─'.repeat(80));

      // Step 3C: Agent 2 executes the plan
      console.log('\n🤖 Agent 2 (ReAct) starting...');
      const agent2 = new ReActAgent(DEFAULT_SAFETY_CONFIG);
      agentResponse = await agent2.execute(finalPrompt, userLocation, {
        isItinerary: true,
        originalPrompt: prompt
      });

      // DEBUG: Log Agent 2's response structure
      console.log(`\n🔍 Agent 2 Response:`, {
        success: agentResponse.success,
        hasState: !!agentResponse.state,
        hasFinishParams: !!agentResponse.state?.finishParameters,
        finishMode: agentResponse.state?.finishParameters?.mode,
        selectedVenueCount: agentResponse.state?.finishParameters?.selected_venue_ids?.length || 0,
        toolResultsCount: agentResponse.state?.toolResults?.length || 0
      });
    } 
    // ROUTE B: Direct to Agent 2 (explicit route or discovery)
    else if (classification.routeTo === 'agent2') {
      console.log('\n📍 Routing: Agent 2 (ReAct) directly');
      console.log(`   Query type: ${classification.queryType}`);
      console.log('─'.repeat(80));

      const agent2 = new ReActAgent(DEFAULT_SAFETY_CONFIG);
      agentResponse = await agent2.execute(prompt, userLocation);
    }
    else {
      // Should never happen if classifier works correctly
      return res.status(500).json({
        success: false,
        error: 'Invalid routing decision from classifier'
      });
    }

    // ============================================================================
    // STEP 4: PROCESS AGENT 2 RESPONSE
    // ============================================================================

    // Extract mode and selected venue IDs from agent's finish parameters
    let mode: 'discovery' | 'route' = 'discovery';
    let selectedVenueIds: Set<string> = new Set();

    // OVERRIDE: If this came from Agent 1, force route/itinerary mode
    if (classification.routeTo === 'agent1') {
      mode = 'route';
      console.log('🎨 Itinerary mode detected (from Agent 1)');
    }

    // Use finish parameters directly from state if available
    if (agentResponse.state.finishParameters) {
      // Only override mode if not from Agent 1
      if (classification.routeTo !== 'agent1') {
        mode = agentResponse.state.finishParameters.mode;
      }
      
      if (agentResponse.state.finishParameters.selected_venue_ids) {
        selectedVenueIds = new Set(agentResponse.state.finishParameters.selected_venue_ids);
      }
      console.log(`\n🎯 Mode: ${mode}, Selected venues: ${selectedVenueIds.size}`);
    } else {
      console.log('⚠️  No finish parameters in state');
    }

    // Validate placeIds exist in search results
    if (mode === 'route' && selectedVenueIds.size > 0) {
      const allPlaceIds = new Set<string>();
      
      agentResponse.state.toolResults.forEach(result => {
        // Handle individual search_venues
        if (result.action === 'search_venues' && result.success && result.data?.venues) {
          result.data.venues.forEach((v: any) => {
            if (v.placeId) allPlaceIds.add(v.placeId);
          });
        }
        
        // Handle batch_search_venues
        if (result.action === 'batch_search_venues' && result.success && result.data?.results) {
          result.data.results.forEach((searchResult: any) => {
            if (searchResult.success && searchResult.venues) {
              searchResult.venues.forEach((v: any) => {
                if (v.placeId) allPlaceIds.add(v.placeId);
              });
            }
          });
        }
      });
      
      console.log(`🔍 Total unique placeIds in search results: ${allPlaceIds.size}`);
      
      const missingPlaceIds: string[] = [];
      selectedVenueIds.forEach(id => {
        if (!allPlaceIds.has(id)) {
          missingPlaceIds.push(id);
        }
      });
      
      if (missingPlaceIds.length > 0) {
        console.warn(`⚠️  WARNING: ${missingPlaceIds.length} selected placeIds not found in search results`);
      } else {
        console.log(`✅ All selected placeIds found in search results`);
      }
    }

    // Extract venues based on mode
    const venues: any[] = [];
    const events: any[] = [];
    const routes: any[] = [];

    // SIMPLIFIED EXTRACTION: Just get all venues from search results
    agentResponse.state.toolResults.forEach(result => {
      if (result.success && result.data) {
        // Handle individual search_venues
        if (result.action === 'search_venues' && result.data.venues) {
          venues.push(...result.data.venues);
        }
        // Handle batch_search_venues
        if (result.action === 'batch_search_venues' && result.data.results) {
          result.data.results.forEach((searchResult: any) => {
            if (searchResult.success && searchResult.venues) {
              venues.push(...searchResult.venues);
            }
          });
        }
        // Handle events
        if (result.action === 'search_events' && result.data.events) {
          events.push(...result.data.events);
        }
      }
    });

    console.log(`📊 Extracted: ${venues.length} venues, ${events.length} events`);

    // For route/itinerary mode with selected venues, reorder based on selected_venue_ids
    if (mode === 'route' && selectedVenueIds.size > 0) {
      console.log(`🔄 Reordering ${venues.length} venues based on ${selectedVenueIds.size} selected IDs`);
      
      // Create a map of placeId -> venue for quick lookup
      const venueMap = new Map<string, any>();
      venues.forEach(v => {
        if (v.placeId) {
          venueMap.set(v.placeId, v);
        }
      });

      // Build ordered list based on selected_venue_ids
      const orderedVenues: any[] = [];
      selectedVenueIds.forEach(placeId => {
        if (placeId === 'user-location') {
          // Skip user-location for venue list (it's handled separately by frontend)
          return;
        }
        const venue = venueMap.get(placeId);
        if (venue) {
          orderedVenues.push(venue);
        } else {
          console.warn(`⚠️  PlaceId ${placeId} not found in venues`);
        }
      });

      // Replace venues array with ordered version
      venues.length = 0;
      venues.push(...orderedVenues);
      
      console.log(`✅ Reordered to ${venues.length} venues in correct sequence`);
    }

    console.log('\n' + '='.repeat(80));
    console.log('✅ REQUEST COMPLETED');
    console.log('='.repeat(80) + '\n');

    // SAFETY: Ensure arrays are always defined (never undefined)
    const responseData = {
      success: agentResponse.success,
      result: agentResponse.result,
      mode,
      queryType: classification.queryType,
      venues: venues || [],  // Ensure never undefined
      events: events || [],  // Ensure never undefined
      routes: routes || [],  // Ensure never undefined
      state: agentResponse.state,
      iterations: agentResponse.iterations,
      tokensUsed: agentResponse.tokensUsed,
      executionTimeMs: agentResponse.executionTimeMs,
      stoppedReason: agentResponse.stoppedReason,
      error: agentResponse.error
    };

    console.log(`📤 Response: ${responseData.venues.length} venues, ${responseData.events.length} events`);

    return res.json(responseData);

  } catch (error) {
    console.error('❌ API Error:', error);
    
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Internal server error'
    });
  }
});

router.get('/health', (req: Request, res: Response) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    service: 'PlanMate API'
  });
});

export default router;