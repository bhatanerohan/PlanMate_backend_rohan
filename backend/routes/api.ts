// backend/routes/api.ts - Updated section for handling alternatives

import { Router, Request, Response } from 'express';
import { ReActAgent } from '../services/react-agent.js';
import { DEFAULT_SAFETY_CONFIG } from '../types/react-agent.js';
import { classifyIntent } from '../services/intent-classifier.js';
import { planCreatorAgent } from '../services/plan-creator-agent.js';
import { videoEnrichmentAgent } from '../services/video-enrichment-agent.js';
import { modificationAgent, type CurrentItinerary } from '../services/modification-agent.js';

const router = Router();

router.post('/plan', async (req: Request, res: Response) => {
  try {
    const { prompt, userLocation, currentItinerary } = req.body;

    // Basic validation
    if (!prompt || typeof prompt !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'Prompt is required and must be a string'
      });
    }
    
    if (userLocation) {
      console.log(`📍 User location: ${userLocation.name || 'Unknown'} (${userLocation.lat}, ${userLocation.lng})`);
    } else {
      console.log(`📍 User location: Not provided`);
    }

    if (currentItinerary) {
      console.log(`📋 Current itinerary: ${currentItinerary.venues?.length || 0} venues`);
    }

    if (prompt.trim().length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Prompt cannot be empty'
      });
    }

    console.log(`\n${'='.repeat(80)}`);
    console.log(`🔥 Received request: "${prompt}"`);
    console.log('='.repeat(80));

    // ============================================================================
    // STEP 1: ENHANCED INTENT CLASSIFICATION
    // ============================================================================
    console.log('\n🔍 Running intent classification...');
    
    let classification;
    try {
      classification = await classifyIntent(prompt, !!currentItinerary);
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
    let mode: 'discovery' | 'route' = 'discovery';
    let venues: any[] = [];
    let events: any[] = [];

    // ROUTE C: Modification → Agent 4
    if (classification.routeTo === 'agent4') {
      console.log('\n🔧 Routing: Agent 4 (Modification Agent)');
      console.log('─'.repeat(80));

      if (!currentItinerary || !currentItinerary.venues || currentItinerary.venues.length === 0) {
        return res.status(400).json({
          success: false,
          error: 'No current itinerary to modify. Please create an itinerary first.'
        });
      }

      const modificationResult = await modificationAgent.executeModification(
        prompt,
        currentItinerary as CurrentItinerary,
        userLocation
      );

      if (!modificationResult.success) {
        return res.status(400).json({
          success: false,
          error: modificationResult.error || 'Modification failed',
          message: modificationResult.message
        });
      }

      let finalVenues = modificationResult.updatedVenues;
      
      if (currentItinerary.hasUserLocation && currentItinerary.userLocationIndex !== undefined && userLocation) {
        console.log(`🔄 Preserving user-location at index ${currentItinerary.userLocationIndex}`);
        
        const userLocationVenue = {
          name: userLocation.name || 'Your Location',
          address: 'Current location',
          location: {
            lat: userLocation.lat,
            lng: userLocation.lng,
            coordinates: `${userLocation.lat},${userLocation.lng}`
          },
          placeId: 'user-location',
          rating: undefined,
          priceLevel: 'N/A',
          types: []
        };
        
        finalVenues = [...modificationResult.updatedVenues];
        finalVenues.splice(currentItinerary.userLocationIndex, 0, userLocationVenue);
        
        console.log(`   ✅ User-location inserted at position ${currentItinerary.userLocationIndex}`);
      }

      console.log('✅ Modification successful');
      
      // 🆕 PRESERVE: Keep existing alternatives from current itinerary
      // Build alternativesMap from currentItinerary if it exists
      const preservedAlternativesMap: Record<string, any[]> = {};
      
      if (currentItinerary && (currentItinerary as any).alternativesMap) {
        console.log('🔄 Preserving alternatives from current itinerary');
        Object.assign(preservedAlternativesMap, (currentItinerary as any).alternativesMap);
      }
      
      return res.json({
        success: true,
        result: modificationResult.message,
        mode: 'route',
        queryType: 'itinerary_modification',
        venues: finalVenues,
        events: [],
        routes: [],
        alternativesMap: preservedAlternativesMap,  // 🔧 FIX: Preserve alternatives
        iterations: 1,
        tokensUsed: 0,
        executionTimeMs: 0,
        stoppedReason: 'completed',
        isModification: true
      });
    }
    
    // ROUTE A: Itinerary Planning → Agent 1 → Agent 2
    else if (classification.routeTo === 'agent1') {
      console.log('\n🎨 Routing: Agent 1 (Plan Creator) → Agent 2 (ReAct)');
      console.log('─'.repeat(80));

      const plan = await planCreatorAgent.createPlan(prompt, userLocation);

      const categorySearches = plan.stops.map(stop => stop.category).join(', ');
      finalPrompt = `Find ${plan.stops.length} venues in ${plan.location}: ${categorySearches}. ` +
                   `These should be close together for a ${plan.planType}. ` +
                   `Create an itinerary with these venues in a logical walking route.`;

      console.log(`\n🔄 Converted plan to Agent 2 prompt:`);
      console.log(`   "${finalPrompt}"`);
      console.log('─'.repeat(80));

      console.log('\n🤖 Agent 2 (ReAct) starting...');
      const agent2 = new ReActAgent(DEFAULT_SAFETY_CONFIG);
      agentResponse = await agent2.execute(finalPrompt, userLocation, {
        isItinerary: true,
        originalPrompt: prompt
      });

      console.log(`\n📊 Agent 2 Response:`, {
        success: agentResponse.success,
        hasState: !!agentResponse.state,
        hasFinishParams: !!agentResponse.state?.finishParameters,
        finishMode: agentResponse.state?.finishParameters?.mode,
        selectedVenueCount: agentResponse.state?.finishParameters?.selected_venue_ids?.length || 0,
        alternativesCount: agentResponse.state?.finishParameters?.alternatives_map 
          ? Object.keys(agentResponse.state.finishParameters.alternatives_map).length 
          : 0,  // 🆕 NEW
        toolResultsCount: agentResponse.state?.toolResults?.length || 0
      });
    } 
    // ROUTE B: Direct to Agent 2 (explicit route or discovery)
    else if (classification.routeTo === 'agent2') {
      console.log('\n🎯 Routing: Agent 2 (ReAct) directly');
      console.log(`   Query type: ${classification.queryType}`);
      console.log('─'.repeat(80));

      const agent2 = new ReActAgent(DEFAULT_SAFETY_CONFIG);
      agentResponse = await agent2.execute(prompt, userLocation);
    }
    else {
      return res.status(500).json({
        success: false,
        error: 'Invalid routing decision from classifier'
      });
    }

    // ============================================================================
    // STEP 4: PROCESS AGENT 2 RESPONSE
    // ============================================================================

    if (classification.routeTo === 'agent1') {
      mode = 'route';
      console.log('🎨 Itinerary mode detected (from Agent 1)');
    }

    let selectedVenueIds: Set<string> = new Set();

    if (agentResponse.state.finishParameters) {
      if (classification.routeTo !== 'agent1') {
        mode = agentResponse.state.finishParameters.mode;
      }
      
      if (agentResponse.state.finishParameters.selected_venue_ids) {
        selectedVenueIds = new Set(agentResponse.state.finishParameters.selected_venue_ids);
      }
      console.log(`\n🎯 Mode: ${mode}, Selected venues: ${selectedVenueIds.size}`);
    }

    // 🆕 NEW: Extract alternatives map from finish parameters
    const alternativesMap = agentResponse.state.finishParameters?.alternatives_map || {};
    console.log(`\n🔄 Alternatives captured: ${Object.keys(alternativesMap).length} stops with alternatives`);
    if (Object.keys(alternativesMap).length > 0) {
      Object.entries(alternativesMap).forEach(([placeId, info]: [string, any]) => {
        console.log(`   ${placeId.substring(0, 20)}...: ${info.alternatives.length} alternatives (${info.searchQuery})`);
      });
    }

    // Extract venues and events
    agentResponse.state.toolResults.forEach(result => {
      if (result.success && result.data) {
        if (result.action === 'search_venues' && result.data.venues) {
          venues.push(...result.data.venues);
        }
        if (result.action === 'batch_search_venues' && result.data.results) {
          result.data.results.forEach((searchResult: any) => {
            if (searchResult.success && searchResult.venues) {
              venues.push(...searchResult.venues);
            }
          });
        }
        if (result.action === 'search_events' && result.data.events) {
          events.push(...result.data.events);
        }
      }
    });

    console.log(`📊 Extracted: ${venues.length} venues, ${events.length} events`);

    // ============================================================================
    // STEP 5: AGENT 3 - VIDEO ENRICHMENT
    // ============================================================================
    console.log('\n🎬 Running Agent 3: Video Enrichment...');
    
    let enrichedVenues = venues;
    try {
      enrichedVenues = await videoEnrichmentAgent.enrichVenues(
        venues, 
        mode,
        {
          maxVideosPerVenue: 3,
          skipRouteMode: true,
          skipUserLocation: true,
        }
      );

      const stats = videoEnrichmentAgent.getStats(enrichedVenues);
      console.log(`📊 Video enrichment stats:`, stats);
      
    } catch (error) {
      console.error('⚠️ Video enrichment failed, continuing without videos:', error);
      enrichedVenues = venues;
    }

    // Reorder for route mode
    if (mode === 'route' && selectedVenueIds.size > 0) {
      console.log(`🔄 Reordering ${enrichedVenues.length} venues based on ${selectedVenueIds.size} selected IDs`);
      
      const venueMap = new Map<string, any>();
      enrichedVenues.forEach(v => {
        if (v.placeId) {
          venueMap.set(v.placeId, v);
        }
      });

      const orderedVenues: any[] = [];
      selectedVenueIds.forEach(placeId => {
        if (placeId === 'user-location') {
          return;
        }
        const venue = venueMap.get(placeId);
        if (venue) {
          orderedVenues.push(venue);
        }
      });

      enrichedVenues.length = 0;
      enrichedVenues.push(...orderedVenues);
      
      console.log(`✅ Reordered to ${enrichedVenues.length} venues in correct sequence`);
    }

    // 🆕 NEW: Build simplified alternatives map for frontend
    // Map placeId → array of alternative venues (not nested object)
    const simplifiedAlternativesMap: Record<string, any[]> = {};
    Object.entries(alternativesMap).forEach(([placeId, info]: [string, any]) => {
      simplifiedAlternativesMap[placeId] = info.alternatives;
    });

    console.log('\n' + '='.repeat(80));
    console.log('✅ REQUEST COMPLETED');
    console.log('='.repeat(80) + '\n');

    const responseData = {
      success: agentResponse.success,
      result: agentResponse.result,
      mode,
      queryType: classification.queryType,
      venues: enrichedVenues || [],
      events: events || [],
      routes: [],
      alternativesMap: simplifiedAlternativesMap,  // 🆕 NEW: Include alternatives map
      state: agentResponse.state,
      iterations: agentResponse.iterations,
      tokensUsed: agentResponse.tokensUsed,
      executionTimeMs: agentResponse.executionTimeMs,
      stoppedReason: agentResponse.stoppedReason,
      error: agentResponse.error
    };

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