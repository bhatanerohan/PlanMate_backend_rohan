// backend/routes/api.ts - SIMPLIFIED (Agent 1 Dormant, Direct to Gemini)

import { Router, Request, Response } from 'express';
import { ReActAgent } from '../services/react-agent.js';
import { DEFAULT_SAFETY_CONFIG } from '../types/react-agent.js';
import { classifyIntent } from '../services/intent-classifier.js';
import { planCreatorAgent } from '../services/plan-creator-agent.js';  // ✅ Keep imported but don't use
import { VideoEnrichmentAgent } from '../services/video-enrichment-agent.js';
import { modificationAgent, type CurrentItinerary } from '../services/modification-agent.js';
import { geminiGroundingAgent } from '../services/gemini-grounding-agent.js';
import { getMapboxClient } from '../services/api-clients/mapbox.js';
import { outputLogger } from '../services/output-logger.js';


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
        // Check if user location already exists in the updated venues
        const hasUserLocationInVenues = finalVenues.some(v => v.placeId === 'user-location');
        
        if (!hasUserLocationInVenues) {
          console.log('📍 Re-inserting user location venue at index', currentItinerary.userLocationIndex);
          
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
        } else {
          console.log('✅ User location already exists in venues, skipping insertion');
        }
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
    // Minimal change: skip calling Agent 3 when explicitly disabled via env var
    console.log('\n🎬 Running Agent 3: Video Enrichment...');

    let enrichedVenues = venues;

    if (process.env.ENABLE_YOUTUBE_ENRICHMENT === 'false') {
      console.log('   ⏭️  Skipping Agent 3: video enrichment disabled via ENABLE_YOUTUBE_ENRICHMENT=false');
      enrichedVenues = venues;
    } else {
      try {
        enrichedVenues = await VideoEnrichmentAgent.enrichVenues(
          venues,
          mode,
          {
            maxVideosPerVenue: 3,
            skipRouteMode: true,
            skipUserLocation: true,
          }
        );

        const stats = VideoEnrichmentAgent.getStats(enrichedVenues);
        console.log(`📊 Video enrichment stats:`, stats);

      } catch (error) {
        console.error('⚠️ Video enrichment failed, continuing without videos:', error);
        enrichedVenues = venues;
      }
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

    if (mode === 'route' && enrichedVenues.length >= 2) {
      console.log(`\n📏 Filtering venues by distance (max 50km)...`);
      console.log(`   Before: ${enrichedVenues.length} venues`);
      
      const filteredVenues = [enrichedVenues[0]]; // Keep first venue
      
      for (let i = 1; i < enrichedVenues.length; i++) {
        const prev = filteredVenues[filteredVenues.length - 1];
        const current = enrichedVenues[i];
        
        if (!prev.location || !current.location) continue;
        
        const distance = calculateDistance(
          prev.location.lat,
          prev.location.lng,
          current.location.lat,
          current.location.lng
        );
        
        if (distance <= 200) {
          filteredVenues.push(current);
        } else {
          console.log(`   🚫 Removed "${current.name}" - ${distance.toFixed(1)}km from "${prev.name}"`);
        }
      }
      
      enrichedVenues = filteredVenues;
      console.log(`   After: ${enrichedVenues.length} venues\n`);
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

    function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
      const R = 6371; // Earth radius in km
      const dLat = toRad(lat2 - lat1);
      const dLon = toRad(lon2 - lon1);
      const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
      return R * c;
    }
    
    function toRad(degrees: number): number {
      return degrees * (Math.PI / 180);
    }
    
    function formatDistance(meters: number): string {
      const km = meters / 1000;
      if (km < 1) {
        return `${Math.round(meters)}m`;
      }
      return `${km.toFixed(1)}km`;
    }
    
    function formatDuration(seconds: number): string {
      const minutes = Math.round(seconds / 60);
      if (minutes < 60) {
        return `${minutes} min`;
      }
      const hours = Math.floor(minutes / 60);
      const remainingMinutes = minutes % 60;
      return `${hours}h ${remainingMinutes}m`;
    }
// 🆕 Filter venues that are too far apart
function filterVenuesByDistance(
  waypoints: Array<{ lat: number; lng: number; name: string }>,
  maxDistanceKm: number = 50
): Array<{ lat: number; lng: number; name: string }> {
  if (waypoints.length <= 1) return waypoints;

  const filtered = [waypoints[0]];
  
  for (let i = 1; i < waypoints.length; i++) {
    const prev = filtered[filtered.length - 1];
    const current = waypoints[i];
    
    const distance = calculateDistance(
      prev.lat, prev.lng,
      current.lat, current.lng
    );
    
    if (distance <= maxDistanceKm) {
      filtered.push(current);
    } else {
      console.log(`   🚫 Removing "${current.name}" - ${distance.toFixed(1)}km from "${prev.name}"`);
    }
  }
  
  return filtered;
}
    
    async function calculateAndAppendRouteInfo(
      result: string,
      venues: any[],
      mode: string
    ): Promise<{ enhancedResult: string; routes: any[] }> {
      if (mode !== 'route' || venues.length < 2) {
        return { enhancedResult: result, routes: [] };
      }
    
      try {
        console.log('\n🗺️  Calculating Mapbox routes...');
        
        // Prepare waypoints from venues
        let waypoints = venues
          .filter(v => v.location && v.location.lat && v.location.lng)
          .map(v => ({
            lat: v.location.lat,
            lng: v.location.lng,
            name: v.name
          }));
    
        // 🆕 Filter out venues that are too far apart
        waypoints = filterVenuesByDistance(waypoints, 50);
        
        if (waypoints.length < 2) {
          console.log('   ⚠️  Not enough nearby waypoints for route calculation');
          return { enhancedResult: result, routes: [] };
        }
    
        // Call Mapbox to calculate the route
        const mapboxClient = getMapboxClient();
        const mapboxRoute = await mapboxClient.getRoute(
          waypoints.map(wp => ({ lat: wp.lat, lng: wp.lng })),
          { mode: 'walking', steps: false }
        );
    
        // Parse legs from Mapbox response to get segment-by-segment data
        // Note: Mapbox returns legs array with distance/duration for each segment
        const routeSegments: any[] = [];
        let totalDistance = 0;
        let totalDuration = 0;
    
        // If Mapbox returns legs data, use it; otherwise calculate from waypoints
        // For now, we'll calculate approximate segments
        for (let i = 0; i < waypoints.length - 1; i++) {
          const segmentDistance = calculateDistance(
            waypoints[i].lat, waypoints[i].lng,
            waypoints[i + 1].lat, waypoints[i + 1].lng
          );
          const segmentDuration = Math.round((segmentDistance / 4.8) * 3600); // ~4.8 km/h walking speed
          
          totalDistance += segmentDistance;
          totalDuration += segmentDuration;
    
          routeSegments.push({
            from: waypoints[i].name,
            to: waypoints[i + 1].name,
            distance: segmentDistance,
            distanceFormatted: formatDistance(segmentDistance * 1000), // convert to meters
            duration: segmentDuration,
            durationFormatted: formatDuration(segmentDuration)
          });
        }
    
        // Build distance summary text
        const distanceLines = routeSegments.map((seg, idx) => 
          `${idx + 1}. ${seg.from} → ${seg.to}: ${seg.distanceFormatted} (${seg.durationFormatted})`
        ).join('\n');
    
        const routeSummary = `\n\n**🚶 Route Details:**\n${distanceLines}\n\n**Total Distance:** ${formatDistance(totalDistance * 1000)}\n**Total Duration:** ${formatDuration(totalDuration)}`;
    
        console.log('   ✅ Route calculation complete');
        console.log(`   Total: ${formatDistance(totalDistance * 1000)}, ${formatDuration(totalDuration)}`);
    
        return {
          enhancedResult: result + routeSummary,
          routes: routeSegments
        };
    
      } catch (error) {
        console.error('   ❌ Route calculation failed:', error);
        // Gracefully fail - return original result without route info
        return { enhancedResult: result, routes: [] };
      }
    }

    const { enhancedResult, routes: calculatedRoutes } = await calculateAndAppendRouteInfo(
      agentResponse.result || 'Your plan is ready!',
      enrichedVenues || [],
      mode
    );

    try {
      await outputLogger.saveOutput({
        prompt,
        userLocation,
        result: enhancedResult,
        venues: enrichedVenues || [],
        events: events || [],
        mode,
        queryType: classification.queryType,
        alternativesMap: simplifiedAlternativesMap,
        routes: calculatedRoutes,
        executionTimeMs: agentResponse.executionTimeMs,
        tokensUsed: agentResponse.tokensUsed,
        iterations: agentResponse.iterations
      });
    } catch (logError) {
      // Don't fail the request if logging fails
      console.error('⚠️ Failed to save output log:', logError);
    }
    
    // ============================================================================
    // Return final response
    // ============================================================================
    return res.json({
      success: agentResponse.success,
      result: enhancedResult,                    // ✅ 1. Enhanced with distance info
      mode,
      queryType: classification.queryType,
      venues: enrichedVenues || [],
      events: events || [],
      routes: calculatedRoutes,                  // ✅ 2. Calculated routes
      alternativesMap: simplifiedAlternativesMap,
      state: agentResponse.state,
      iterations: agentResponse.iterations,
      tokensUsed: agentResponse.tokensUsed,
      executionTimeMs: agentResponse.executionTimeMs,
      stoppedReason: agentResponse.stoppedReason,
      error: agentResponse.error,
      geminiGroundingUsed: classification.useGeminiGrounding
    });

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