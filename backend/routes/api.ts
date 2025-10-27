// backend/routes/api.ts - SIMPLIFIED (Agent 1 Dormant, Direct to Gemini)

import { Router, Request, Response } from 'express';
import { ReActAgent } from '../services/react-agent.js';
import { DEFAULT_SAFETY_CONFIG } from '../types/react-agent.js';
import { classifyIntent } from '../services/intent-classifier.js';
import { planCreatorAgent } from '../services/plan-creator-agent.js';  // ✅ Keep imported but don't use
import { videoEnrichmentAgent } from '../services/video-enrichment-agent.js';
import { modificationAgent, type CurrentItinerary } from '../services/modification-agent.js';
import { geminiGroundingAgent } from '../services/gemini-grounding-agent.js';

const router = Router();

router.post('/plan', async (req: Request, res: Response) => {
  try {
    const { prompt, userLocation, currentItinerary } = req.body;

    if (!prompt || typeof prompt !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'Prompt is required and must be a string'
      });
    }
    
    if (userLocation) {
      console.log(`📍 User location: ${userLocation.name || 'Unknown'} (${userLocation.lat}, ${userLocation.lng})`);
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
    // STEP 1: INTENT CLASSIFICATION
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
      queryType: classification.queryType,
      useGeminiGrounding: classification.useGeminiGrounding
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
    
    let agentResponse;
    let mode: 'discovery' | 'route' = 'discovery';
    let venues: any[] = [];
    let events: any[] = [];

    // ============================================================================
    // ROUTE A: MODIFICATION → Agent 4 (no changes)
    // ============================================================================
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
      }

      const preservedAlternativesMap: Record<string, any[]> = {};
      if (currentItinerary && (currentItinerary as any).alternativesMap) {
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
        alternativesMap: preservedAlternativesMap,
        iterations: 1,
        tokensUsed: 0,
        executionTimeMs: 0,
        stoppedReason: 'completed',
        isModification: true
      });
    }
    
    // ============================================================================
    // ROUTE B: GEMINI GROUNDING (Planning + Discovery)
    // 🔧 SIMPLIFIED: Skip Agent 1, go directly to Gemini
    // ============================================================================
    
    if (classification.useGeminiGrounding && classification.routeTo === 'gemini') {
      console.log('\n🌟 SIMPLIFIED FLOW: Gemini (Plan + Ground) → Agent 2 (Enrich)');
      console.log('─'.repeat(80));
      console.log('⏭️  SKIPPING Agent 1 (Plan Creator is dormant)');
      
      // Call Gemini directly (handles both planning and grounding)
      console.log('\n🌟 Calling Gemini with grounding (planning + recommendations)...');
      const geminiResult = await geminiGroundingAgent.getRecommendations(
        prompt,
        userLocation
      );
      
      console.log(`✨ Gemini returned ${geminiResult.venues.length} recommendations`);
      if (geminiResult.plan) {
        console.log(`📋 Plan: ${geminiResult.plan.type}, ${geminiResult.plan.total_stops} stops`);
      }
      console.log(`   Grounding used: Maps=${geminiResult.grounding_used}, Search=${geminiResult.search_used}`);
      
      if (geminiResult.venues.length === 0) {
        console.warn('⚠️ Gemini returned no venues, falling back to direct Agent 2');
        
        // Fallback to direct Agent 2
        const agent2 = new ReActAgent(DEFAULT_SAFETY_CONFIG);
        agentResponse = await agent2.execute(prompt, userLocation);
        mode = 'discovery';
      } else {
        // Agent 2 enriches with Places API
        console.log('\n🤖 Agent 2 (ReAct) enriching with Google Places API...');
        const agent2 = new ReActAgent(DEFAULT_SAFETY_CONFIG);
        
        agentResponse = await agent2.executeWithGrounding(
          prompt,
          geminiResult.venues,
          userLocation,
          {
            isItinerary: classification.queryType === 'itinerary_planning',
            originalPrompt: prompt,
            geminiRecommendations: geminiResult.venues,
            useGroundingMode: true
          }
        );
        
        // Set mode based on query type
        mode = classification.queryType === 'itinerary_planning' ? 'route' : 'discovery';
      }
    }
    
    // ============================================================================
    // ROUTE C: DIRECT TO AGENT 2 (No grounding, specific routes)
    // ============================================================================
    else if (classification.routeTo === 'agent2') {
      console.log('\n🎯 Direct execution: Agent 2 only (no grounding)');
      console.log('─'.repeat(80));
      
      const agent2 = new ReActAgent(DEFAULT_SAFETY_CONFIG);
      agentResponse = await agent2.execute(prompt, userLocation);
      
      // Mode determined by finish parameters
      if (agentResponse.state.finishParameters?.mode) {
        mode = agentResponse.state.finishParameters.mode;
      }
    }
    
    // ============================================================================
    // FALLBACK: If no agent response yet, use direct Agent 2
    // ============================================================================
    else if (!agentResponse) {
      console.log('\n⚠️ No matching route, falling back to Agent 2');
      
      const agent2 = new ReActAgent(DEFAULT_SAFETY_CONFIG);
      agentResponse = await agent2.execute(prompt, userLocation);
    }

    // ============================================================================
    // STEP 4: PROCESS AGENT RESPONSE
    // ============================================================================

    if (!agentResponse) {
      throw new Error('No agent response received');
    }

    let selectedVenueIds: Set<string> = new Set();

    if (agentResponse.state.finishParameters) {
      if (agentResponse.state.finishParameters.mode) {
        mode = agentResponse.state.finishParameters.mode;
      }
      
      if (agentResponse.state.finishParameters.selected_venue_ids) {
        selectedVenueIds = new Set(agentResponse.state.finishParameters.selected_venue_ids);
      }
      console.log(`\n🎯 Mode: ${mode}, Selected venues: ${selectedVenueIds.size}`);
    }

    const alternativesMap = agentResponse.state.finishParameters?.alternatives_map || {};

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
      const venueMap = new Map<string, any>();
      enrichedVenues.forEach(v => {
        if (v.placeId) {
          venueMap.set(v.placeId, v);
        }
      });

      const orderedVenues: any[] = [];
      selectedVenueIds.forEach(placeId => {
        if (placeId === 'user-location') return;
        const venue = venueMap.get(placeId);
        if (venue) orderedVenues.push(venue);
      });

      enrichedVenues.length = 0;
      enrichedVenues.push(...orderedVenues);
    }

    const simplifiedAlternativesMap: Record<string, any[]> = {};
    Object.entries(alternativesMap).forEach(([placeId, info]: [string, any]) => {
      simplifiedAlternativesMap[placeId] = info.alternatives;
    });

    console.log('\n' + '='.repeat(80));
    console.log('✅ REQUEST COMPLETED (SIMPLIFIED FLOW)');
    console.log(`   Grounding used: ${classification.useGeminiGrounding}`);
    console.log(`   Agent 1: SKIPPED (dormant)`);
    console.log(`   Venues: ${enrichedVenues.length}`);
    console.log('='.repeat(80) + '\n');

    const responseData = {
      success: agentResponse.success,
      result: agentResponse.result,
      mode,
      queryType: classification.queryType,
      venues: enrichedVenues || [],
      events: events || [],
      routes: [],
      alternativesMap: simplifiedAlternativesMap,
      state: agentResponse.state,
      iterations: agentResponse.iterations,
      tokensUsed: agentResponse.tokensUsed,
      executionTimeMs: agentResponse.executionTimeMs,
      stoppedReason: agentResponse.stoppedReason,
      error: agentResponse.error,
      geminiGroundingUsed: classification.useGeminiGrounding
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