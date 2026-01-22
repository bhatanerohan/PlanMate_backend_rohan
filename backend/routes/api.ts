
import { Router, Request, Response } from 'express';
import { ReActAgent } from '../services/react-agent.js';
import type { EnrichedCandidate } from '../services/react-agent.js';
import { DEFAULT_SAFETY_CONFIG } from '../types/react-agent.js';
import { classifyIntent } from '../services/intent-classifier.js';
import { modificationAgent, type CurrentItinerary } from '../services/modification-agent.js';
import { geminiGroundingAgent } from '../services/gemini-grounding-agent.js';
import { venueSelector } from '../services/venue-selector.js';
import { getMapboxClient } from '../services/api-clients/mapbox.js';
import { getGooglePlacesClient } from '../services/api-clients/google-places.js';
import { outputLogger } from '../services/output-logger.js';
import { nearestNeighborOptimization, optimizeFromUserLocation, formatDistance, formatDuration } from '../services/utils/route_optimizer.js';

const router = Router();

// ============================================================================
// CORRIDOR DETECTION HELPERS
// ============================================================================

interface CorridorInfo {
  isCorridor: boolean;
  startLocation?: string;
  endLocation?: string;
  startCoords?: { lat: number; lng: number };
  endCoords?: { lat: number; lng: number };
}

async function detectCorridorQuery(prompt: string): Promise<CorridorInfo> {
  console.log('\n🔍 CORRIDOR DETECTION: Analyzing query...');
  console.log(`   Query: "${prompt}"`);
  
  const corridorPatterns = [
    /from\s+([a-z\s]+?)\s+to\s+([a-z\s]+?)(?:\s+in\s+|\s+around\s+|\s+near\s+|,|\.|!|\?|$)/i,
    /between\s+([a-z\s]+?)\s+and\s+([a-z\s]+?)(?:\s+in\s+|\s+around\s+|,|\.|!|\?|$)/i,
    /([a-z\s]+?)\s+to\s+([a-z\s]+?)\s+(?:route|walk|tour|trip)/i,
  ];
  
  for (const pattern of corridorPatterns) {
    const match = prompt.match(pattern);
    if (match) {
      let startLocation = match[1].trim();
      let endLocation = match[2].trim();
      
      const stopWords = ['plan', 'tourist', 'spots', 'places', 'the', 'a', 'an', 'some', 'best', 'top'];
      stopWords.forEach(word => {
        startLocation = startLocation.replace(new RegExp(`^${word}\\s+`, 'i'), '').trim();
        startLocation = startLocation.replace(new RegExp(`\\s+${word}$`, 'i'), '').trim();
        endLocation = endLocation.replace(new RegExp(`^${word}\\s+`, 'i'), '').trim();
        endLocation = endLocation.replace(new RegExp(`\\s+${word}$`, 'i'), '').trim();
      });
      
      if (startLocation.length < 3 || endLocation.length < 3) {
        console.log(`   ⚠️ Locations too short: "${startLocation}" → "${endLocation}"`);
        continue;
      }
      
      console.log(`   ✅ Corridor pattern matched!`);
      console.log(`   Start: "${startLocation}"`);
      console.log(`   End: "${endLocation}"`);
      
      const cityMatch = prompt.match(/\s+in\s+([a-z\s]+?)(?:,|\.|!|\?|$)/i);
      const contextCity = cityMatch ? cityMatch[1].trim() : '';
      console.log(`   Context city: "${contextCity || 'none'}"`);
      
      try {
        const placesClient = getGooglePlacesClient();
        
        const startQuery = contextCity ? `${startLocation}, ${contextCity}` : startLocation;
        const endQuery = contextCity ? `${endLocation}, ${contextCity}` : endLocation;
        
        console.log(`   Geocoding: "${startQuery}" and "${endQuery}"`);
        
        const [startResult, endResult] = await Promise.all([
          geocodeLocation(placesClient, startQuery),
          geocodeLocation(placesClient, endQuery)
        ]);
        
        if (startResult && endResult) {
          console.log(`   📍 Start coords: (${startResult.lat.toFixed(4)}, ${startResult.lng.toFixed(4)})`);
          console.log(`   📍 End coords: (${endResult.lat.toFixed(4)}, ${endResult.lng.toFixed(4)})`);
          
          const corridorDistKm = haversineDistanceKm(
            startResult.lat, startResult.lng,
            endResult.lat, endResult.lng
          );
          console.log(`   📏 Corridor distance: ${corridorDistKm.toFixed(2)} km`);
          
          if (corridorDistKm < 0.5) {
            console.log(`   ⚠️ Corridor too short, using cluster mode`);
            return { isCorridor: false };
          }
          
          console.log(`   ✅ CORRIDOR MODE ACTIVATED!`);
          return {
            isCorridor: true,
            startLocation,
            endLocation,
            startCoords: startResult,
            endCoords: endResult
          };
        } else {
          console.log(`   ⚠️ Geocoding failed`);
          if (!startResult) console.log(`      - Could not geocode: "${startQuery}"`);
          if (!endResult) console.log(`      - Could not geocode: "${endQuery}"`);
        }
      } catch (error) {
        console.error('   ❌ Geocoding error:', error);
      }
    }
  }
  
  console.log('   ℹ️ No corridor pattern, using cluster mode');
  return { isCorridor: false };
}

async function geocodeLocation(
  placesClient: any, 
  locationName: string
): Promise<{ lat: number; lng: number } | null> {
  try {
    const results = await placesClient.textSearch({
      query: locationName,
      maxResults: 1
    });
    
    if (results && results.length > 0 && results[0].location) {
      console.log(`      ✓ Geocoded "${locationName}"`);
      return {
        lat: results[0].location.lat,
        lng: results[0].location.lng
      };
    }
    console.log(`      ✗ No results for "${locationName}"`);
  } catch (error) {
    console.warn(`      ✗ Error: ${error}`);
  }
  return null;
}

function haversineDistanceKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLng/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

// ============================================================================
// HELPER: Detect "specific place near X" queries and format alternatives
// ============================================================================
interface NearSearchTerms {
  query: string;
  near: string;
}

const NEAR_QUERY_STOP_WORDS = new Set([
  'find', 'search', 'show', 'me', 'the', 'a', 'an', 'any', 'some', 'best', 'top',
  'good', 'nice', 'cool', 'near', 'around', 'close', 'to', 'by', 'in', 'at', 'for',
  'with', 'of', 'my', 'your', 'nearest', 'closest', 'please'
]);
const GENERIC_QUERY_TOKENS = new Set([
  'coffee', 'cafes', 'cafe', 'restaurants', 'restaurant', 'bars', 'bar', 'pizza',
  'food', 'breakfast', 'lunch', 'dinner', 'dessert', 'ice', 'cream', 'park', 'parks',
  'hotel', 'hotels', 'museum', 'museums', 'shop', 'shops', 'store', 'stores'
]);

function extractNearSearchTerms(prompt: string): NearSearchTerms | null {
  const patterns = [
    /\b(.+?)\s+near\s+(.+?)(?:[?.!]|$)/i,
    /\b(.+?)\s+around\s+(.+?)(?:[?.!]|$)/i,
    /\b(.+?)\s+close\s+to\s+(.+?)(?:[?.!]|$)/i,
    /\b(.+?)\s+by\s+(.+?)(?:[?.!]|$)/i
  ];

  for (const pattern of patterns) {
    const match = prompt.match(pattern);
    if (match) {
      const query = match[1]?.trim();
      const near = match[2]?.trim();
      if (query && near) {
        return { query, near };
      }
    }
  }

  return null;
}

function normalizeQueryTokens(query: string): string[] {
  return query
    .toLowerCase()
    .replace(/[^a-z0-9\s&]/g, ' ')
    .split(/\s+/)
    .map(token => token.trim())
    .filter(token => token && token !== '&' && !NEAR_QUERY_STOP_WORDS.has(token));
}

function venueMatchesQuery(venueName: string, queryTokens: string[]): boolean {
  const name = venueName.toLowerCase();
  return queryTokens.every(token => name.includes(token));
}

function isGenericQueryTokens(queryTokens: string[]): boolean {
  return queryTokens.length === 1 && GENERIC_QUERY_TOKENS.has(queryTokens[0]);
}

function buildNearestAlternativesMessage(primary: any, alternatives: any[], nearLabel: string): string {
  let message = `Nearest match near ${nearLabel}:\n`;
  const rating = primary.rating ? ` (rating ${primary.rating})` : '';
  message += `1. **${primary.name}**${rating}\n`;
  if (primary.address) {
    message += `   ${primary.address}\n`;
  }

  if (alternatives.length > 0) {
    message += `\nOther nearby options:\n`;
    alternatives.forEach((alt, idx) => {
      const altRating = alt.rating ? ` (rating ${alt.rating})` : '';
      message += `${idx + 1}. **${alt.name}**${altRating}\n`;
      if (alt.address) {
        message += `   ${alt.address}\n`;
      }
    });
  }

  return message.trim();
}

// ============================================================================
// HELPER: Build result message for chat display
// ============================================================================
function buildResultMessage(
  venues: any[],
  plan: any,
  selectionResult: any,
  wasOptimized: boolean = false
): string {
  let message = '';
  
  if (plan) {
    message += `🗺️ **${plan.type || 'Your Itinerary'}**\n`;
    message += `📍 ${venues.filter(v => v.placeId !== 'user-location').length} stops`;
    if (plan.estimated_duration) message += ` • ${plan.estimated_duration}`;
    message += '\n';
    if (plan.theme) message += `✨ ${plan.theme}\n`;
    message += '\n';
  } else {
    message += `🗺️ Here's your personalized itinerary!\n\n`;
  }
  
  let stopNumber = 1;
  venues.forEach((venue) => {
    if (venue.placeId === 'user-location') return;
    
    const rating = venue.rating ? `⭐ ${venue.rating}` : '';
    const price = venue.priceLevel || '';
    const priority = venue.priority === 'must_have' ? '🎯' : '✨';
    
    message += `${stopNumber}. ${priority} **${venue.name}** ${rating} ${price}\n`;
    if (venue.description) message += `   ${venue.description}\n`;
    if (venue.reasoning || venue.gemini_reasoning) {
      message += `   💡 ${venue.reasoning || venue.gemini_reasoning}\n`;
    }
    message += '\n';
    stopNumber++;
  });
  
  if (selectionResult?.reasoning) {
    message += `\n📍 ${selectionResult.reasoning}`;
  }
  
  if (wasOptimized) {
    message += `\n🚶 Route has been optimized for walkability.`;
  }
  
  return message;
}

// ============================================================================
// HELPER: Calculate and append route info
// ============================================================================
async function calculateAndAppendRouteInfo(
  result: string,
  venues: any[],
  mode: string
): Promise<{ enhancedResult: string; routes: any[] }> {
  if (mode !== 'route' || venues.length < 2) {
    return { enhancedResult: result, routes: [] };
  }

  try {
    const mapboxClient = getMapboxClient();
    const coordinates = venues
      .filter(v => v.location?.lat && v.location?.lng)
      .map(v => ({ lat: v.location.lat, lng: v.location.lng }));

    if (coordinates.length < 2) {
      return { enhancedResult: result, routes: [] };
    }

    console.log('📍 Calculating route distances...');
    
    const routeSegments: any[] = [];
    let totalDistance = 0;
    let totalDuration = 0;

    for (let i = 0; i < coordinates.length - 1; i++) {
      const from = coordinates[i];
      const to = coordinates[i + 1];
      
      try {
        const segment = await mapboxClient.getRoute([from, to], { mode: 'walking' });
        if (segment) {
          const distanceKm = segment.distance / 1000;
          const durationMin = segment.duration / 60;
          
          routeSegments.push({
            from: venues[i].name,
            to: venues[i + 1].name,
            distance: distanceKm,
            duration: durationMin,
            distanceFormatted: formatDistance(segment.distance),
            durationFormatted: formatDuration(segment.duration),
            geometry: segment.geometry
          });
          
          totalDistance += distanceKm;
          totalDuration += segment.duration;
        }
      } catch (segmentError) {
        console.warn(`   ⚠️ Could not calculate segment ${i + 1}`);
      }
    }

    if (routeSegments.length === 0) {
      return { enhancedResult: result, routes: [] };
    }

    const distanceLines = routeSegments.map(seg =>
      `${seg.from} → ${seg.to}: ${seg.distanceFormatted} (${seg.durationFormatted})`
    ).join('\n');

    const routeSummary = `\n\n**🚶 Route Details:**\n${distanceLines}\n\n**Total Distance:** ${formatDistance(totalDistance * 1000)}\n**Total Duration:** ${formatDuration(totalDuration)}`;

    console.log(`   ✅ Route calculated: ${formatDistance(totalDistance * 1000)}, ${formatDuration(totalDuration)}`);

    return {
      enhancedResult: result + routeSummary,
      routes: routeSegments
    };

  } catch (error) {
    console.error('   ❌ Route calculation failed:', error);
    return { enhancedResult: result, routes: [] };
  }
}

// ============================================================================
// MAIN ROUTE: /plan
// ============================================================================
router.post('/plan', async (req: Request, res: Response) => {
  try {
    const { prompt, userLocation, currentItinerary } = req.body;

    if (!prompt || typeof prompt !== 'string' || prompt.trim().length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Prompt is required and must be a non-empty string'
      });
    }

    console.log(`\n${'='.repeat(80)}`);
    console.log(`📥 Received: "${prompt}"`);
    if (userLocation) {
      console.log(`📍 User location: ${userLocation.name} (${userLocation.lat}, ${userLocation.lng})`);
    }
    if (currentItinerary) {
      console.log(`📋 Current itinerary: ${currentItinerary.venues?.length || 0} venues`);
    }
    console.log('='.repeat(80));

    // ========================================================================
    // STEP 1: INTENT CLASSIFICATION
    // ========================================================================
    console.log('\n🔍 Classifying intent...');
    
    let classification;
    try {
      classification = await classifyIntent(prompt, !!currentItinerary);
    } catch (classError) {
      console.error('❌ Classification failed:', classError);
      return res.status(500).json({
        success: false,
        error: 'Failed to classify intent'
      });
    }

    if (!classification.isRelevant) {
      return res.status(400).json({
        success: false,
        error: 'not_relevant',
        message: classification.reasoning || "I can only help with location-based queries."
      });
    }

    let agentResponse: any = null;
    let mode: 'route' | 'discovery' = 'discovery';
    let events: any[] = [];

    // ========================================================================
    // ROUTE A: MODIFICATION (Agent 4)
    // ========================================================================
    if (classification.queryType === 'itinerary_modification' && classification.routeTo === 'agent4') {
      console.log('\n🔄 MODIFICATION FLOW');
      console.log('─'.repeat(80));

      if (!currentItinerary || !currentItinerary.venues || currentItinerary.venues.length === 0) {
        return res.status(400).json({
          success: false,
          error: 'No itinerary to modify. Please create an itinerary first.'
        });
      }

      const modificationResult = await modificationAgent.executeModification(
        prompt,
        currentItinerary,
        userLocation
      );

      if (!modificationResult.success) {
        return res.status(400).json({
          success: false,
          error: modificationResult.message || 'Modification failed'
        });
      }

      let finalVenues = modificationResult.updatedVenues || currentItinerary.venues;

      if (userLocation && finalVenues.length > 0) {
        const hasUserLocation = finalVenues.some((v: any) => v.placeId === 'user-location');
        if (!hasUserLocation) {
          const userLocationVenue: EnrichedCandidate = {
            placeId: 'user-location',
            name: 'Your Location',
            address: userLocation.name,
            location: { lat: userLocation.lat, lng: userLocation.lng },
            isUserLocation: true,
            description: 'User provided location',
            category: 'user_location',
            priority: 'nice_to_have',
            enriched: false,
            enrichmentSource: 'gemini_only'
          };
          finalVenues = [userLocationVenue, ...finalVenues];
        }
      }

      const preservedAlternativesMap: Record<string, any[]> = {};
      if ((currentItinerary as any).alternativesMap) {
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

    // ========================================================================
    // ROUTE B: GEMINI GROUNDING (NEW CANDIDATE FLOW)
    // ========================================================================
    if (classification.useGeminiGrounding && classification.routeTo === 'gemini') {
      console.log('\n⚡ NEW CANDIDATE FLOW: Gemini → Enrich All → Venue Selector → Mapbox');
      console.log('─'.repeat(80));

      // ----------------------------------------------------------------------
      // STEP 2: GEMINI - Get 15-20 candidates with categories
      // ----------------------------------------------------------------------
      console.log('\n🔍 STEP 2: Calling Gemini for 15-20 CANDIDATES...');
      
      const geminiResult = await geminiGroundingAgent.getRecommendations(prompt, userLocation);
      
      if (!geminiResult.venues || geminiResult.venues.length === 0) {
        console.warn('⚠️ Gemini returned no venues, falling back to direct Agent 2');
        
        const agent2 = new ReActAgent(DEFAULT_SAFETY_CONFIG);
        agentResponse = await agent2.execute(prompt, userLocation, {
          isItinerary: classification.queryType === 'itinerary_planning',
          originalPrompt: prompt
        });
        mode = 'discovery';
        
      } else {
        console.log(`   ✅ Gemini returned ${geminiResult.venues.length} candidates`);
        console.log(`   🎯 Must-have: ${geminiResult.must_have_count}`);
        console.log(`   ✨ Nice-to-have: ${geminiResult.nice_to_have_count}`);

        // ----------------------------------------------------------------------
        // STEP 3: ENRICH ALL CANDIDATES via Google Places API
        // ----------------------------------------------------------------------
        console.log('\n📍 STEP 3: Enriching ALL candidates via Google Places...');
        
        const reactAgent = new ReActAgent(DEFAULT_SAFETY_CONFIG);
        const enrichmentResult = await reactAgent.enrichAllCandidates(
          geminiResult.venues,
          prompt,
          userLocation
        );

        console.log(`   ✅ Enriched ${enrichmentResult.candidates.length} candidates`);
        console.log(`   🎯 Must-have found: ${enrichmentResult.must_have_count}`);
        console.log(`   ✨ Nice-to-have found: ${enrichmentResult.nice_to_have_count}`);

        // ----------------------------------------------------------------------
        // STEP 4: CORRIDOR DETECTION + VENUE SELECTION
        // ----------------------------------------------------------------------
        console.log('\n🎯 STEP 4: Selecting optimal venues...');
        
        // 🆕 Detect corridor query FIRST
        const corridorInfo = await detectCorridorQuery(prompt);
        
        let selectionResult;
        
        if (corridorInfo.isCorridor && corridorInfo.startCoords && corridorInfo.endCoords) {
          // CORRIDOR MODE
          console.log('   📍 Mode: CORRIDOR');
          
          selectionResult = await venueSelector.selectVenuesWithMode(
            enrichmentResult.candidates,
            {
              userRequestedCount: geminiResult.plan?.total_stops || 6,
              corridorStart: corridorInfo.startCoords,
              corridorEnd: corridorInfo.endCoords,
              isCorridorQuery: true,
              userPrompt: prompt  // 🆕 Add this
            }
          );
        } else {
          // CLUSTER MODE
          console.log('   📍 Mode: CLUSTER');
          
          selectionResult = await venueSelector.selectVenues(
            enrichmentResult.candidates,
            geminiResult.plan?.total_stops || 6,
            prompt  // 🆕 Add this
          );
        }

        if (selectionResult.selectedVenues.length === 0) {
          return res.status(500).json({
            success: false,
            error: 'Could not find suitable venues. Please try again.'
          });
        }

        console.log(`   ✅ Selected ${selectionResult.selectedVenues.length} venues`);
        console.log(`   📍 Cluster radius: ${selectionResult.clusterRadiusKm.toFixed(2)}km`);

        // ----------------------------------------------------------------------
        // STEP 5: ROUTE OPTIMIZATION
        // ----------------------------------------------------------------------
        console.log('\n🗺️ STEP 5: Optimizing route order...');

        let finalVenues = selectionResult.selectedVenues;
        let optimizationApplied = false;
        let optimizationStats = { distance: 0, duration: 0, startingPoint: 0 };

        // 🆕 Skip NN for corridor mode (already geographically ordered)
        if (selectionResult.selectionMode === 'corridor') {
          console.log('   🛤️ Corridor mode: venues already in geographic order');
          console.log(`   Route: ${finalVenues.map(v => v.name).join(' → ')}`);
          optimizationApplied = true;
          
        } else {
          // CLUSTER MODE: Apply Nearest Neighbor
          try {
            const userLat = Number(userLocation?.lat);
            const userLng = Number(userLocation?.lng);
            const hasUserLocationCoords =
              !!userLocation && Number.isFinite(userLat) && Number.isFinite(userLng);
            const venueCoordinates = finalVenues.map(v => ({
              lat: Number(v?.location?.lat),
              lng: Number(v?.location?.lng)
            }));
            const venuesHaveCoords = venueCoordinates.every(
              coord => Number.isFinite(coord.lat) && Number.isFinite(coord.lng)
            );

            if (!venuesHaveCoords) {
              console.log('   Warning: one or more venues missing coordinates; skipping optimization');
            } else if (hasUserLocationCoords) {
              const coordinates = [
                { lat: userLat, lng: userLng },  // Index 0 = user
                ...venueCoordinates
              ];

              const optimizedResult = optimizeFromUserLocation(coordinates, 0);  // Fixed start at index 0

              const venueOrder = optimizedResult.optimizedOrder
                .filter(idx => idx !== 0)
                .map(idx => idx - 1);

              if (venueOrder.length === finalVenues.length) {
                const originalVenues = [...finalVenues];
                const reorderedVenues = venueOrder.map(idx => originalVenues[idx]);
              
                console.log(`   ✅ Route optimized via Multi-Start Nearest Neighbor`);
                console.log(`   Best starting point: venue ${optimizedResult.startingPoint}`);
                console.log(`   Original: ${originalVenues.map(v => v.name).join(' → ')}`);
                console.log(`   Optimized: ${reorderedVenues.map(v => v.name).join(' → ')}`);
                console.log(`   Total distance: ${formatDistance(optimizedResult.totalDistance)}`);
                console.log(`   Est. walking time: ${formatDuration(optimizedResult.totalDuration)}`);
              
                if (optimizedResult.improvement) {
                  console.log(`   Improvement: ${optimizedResult.improvement.percentImproved.toFixed(1)}% shorter`);
                }
              
                finalVenues = reorderedVenues;
                optimizationApplied = true;
                optimizationStats = {
                  distance: optimizedResult.totalDistance,
                  duration: optimizedResult.totalDuration,
                  startingPoint: optimizedResult.startingPoint
                };
              }
            } else {
              const optimizedResult = nearestNeighborOptimization(venueCoordinates);
              const venueOrder = optimizedResult.optimizedOrder;

              if (venueOrder.length === finalVenues.length) {
                const originalVenues = [...finalVenues];
                const reorderedVenues = venueOrder.map(idx => originalVenues[idx]);

                console.log('   ✅ Route optimized via Multi-Start Nearest Neighbor (no user location)');
                console.log(`   Best starting point: venue ${optimizedResult.startingPoint}`);
                console.log(`   Original: ${originalVenues.map(v => v.name).join(' → ')}`);
                console.log(`   Optimized: ${reorderedVenues.map(v => v.name).join(' → ')}`);
                console.log(`   Total distance: ${formatDistance(optimizedResult.totalDistance)}`);
                console.log(`   Est. walking time: ${formatDuration(optimizedResult.totalDuration)}`);

                if (optimizedResult.improvement) {
                  console.log(`   Improvement: ${optimizedResult.improvement.percentImproved.toFixed(1)}% shorter`);
                }

                finalVenues = reorderedVenues;
                optimizationApplied = true;
                optimizationStats = {
                  distance: optimizedResult.totalDistance,
                  duration: optimizedResult.totalDuration,
                  startingPoint: optimizedResult.startingPoint
                };
              }
            }
          } catch (optimizationError) {
            console.warn('   ⚠️ Route optimization failed, using original order:', optimizationError);
          }
        }

        // Add user location at start (AFTER optimization)
        if (userLocation) {
          const userLocationVenue: EnrichedCandidate = {
            placeId: 'user-location',
            name: 'Your Location',
            address: userLocation.name,
            location: { lat: userLocation.lat, lng: userLocation.lng },
            isUserLocation: true,
            priority: 'nice_to_have',
            description: 'User provided location',
            category: 'user_location',
            enriched: false,
            enrichmentSource: 'gemini_only'
          };
          finalVenues = [userLocationVenue, ...finalVenues];
        }

        const resultMessage = buildResultMessage(
          finalVenues, 
          geminiResult.plan, 
          selectionResult, 
          optimizationApplied
        );

        const { enhancedResult, routes } = await calculateAndAppendRouteInfo(
          resultMessage,
          finalVenues,
          'route'
        );

        try {
          await outputLogger.saveOutput({
            prompt,
            userLocation,
            result: enhancedResult,
            venues: finalVenues,
            events: [],
            mode: 'route',
            queryType: classification.queryType,
            routes,
            executionTimeMs: 0,
            tokensUsed: 0,
            iterations: 1
          });
        } catch (logError) {
          console.warn('⚠️ Failed to save output log:', logError);
        }

        console.log('\n' + '='.repeat(80));
        console.log('✅ REQUEST COMPLETED (NEW CANDIDATE FLOW)');
        console.log(`   Candidates: ${enrichmentResult.candidates.length} → Selected: ${selectionResult.selectedVenues.length}`);
        console.log(`   Mode: ${selectionResult.selectionMode || 'cluster'}`);
        console.log(`   Cluster radius: ${selectionResult.clusterRadiusKm.toFixed(2)}km`);
        console.log('='.repeat(80) + '\n');

        return res.json({
          success: true,
          result: enhancedResult,
          mode: 'route',
          queryType: classification.queryType,
          venues: finalVenues.map(v => ({
            placeId: v.placeId,
            name: v.name,
            address: v.address,
            location: v.location,
            rating: v.rating,
            userRatingCount: v.userRatingCount,
            priceLevel: v.priceLevel,
            photos: v.photos,
            photoUrl: v.photos?.[0] || v.photoUrl,
            description: v.description,
            category: v.category,
            reasoning: v.reasoning,
            priority: v.priority,
            isUserLocation: v.isUserLocation
          })),
          events: [],
          routes,
          alternativesMap: selectionResult.alternativesMap,
          geminiGroundingUsed: true,
          venueSelectionStats: {
            totalCandidates: enrichmentResult.candidates.length,
            mustHavesAvailable: enrichmentResult.must_have_count,
            niceToHavesAvailable: enrichmentResult.nice_to_have_count,
            mustHavesSelected: selectionResult.mustHavesSelected,
            niceToHavesSelected: selectionResult.niceToHavesSelected,
            clusterRadiusKm: selectionResult.clusterRadiusKm,
            selectionMode: selectionResult.selectionMode || 'cluster'
          }
        });
      }
    }

    // ========================================================================
    // ROUTE C: DIRECT AGENT 2
    // ========================================================================
    if (!agentResponse) {
      console.log('\n🤖 DIRECT AGENT 2 FLOW');
      console.log('─'.repeat(80));
      
      const reactAgent = new ReActAgent(DEFAULT_SAFETY_CONFIG);
      agentResponse = await reactAgent.execute(prompt, userLocation, {
        isItinerary: classification.queryType === 'explicit_route',
        originalPrompt: prompt
      });
      
      mode = classification.queryType === 'explicit_route' ? 'route' : 'discovery';
    }

    // ========================================================================
    // BUILD FINAL RESPONSE (for Agent 2 direct path)
    // ========================================================================
    let enrichedVenues: any[] = [];
    
    if (agentResponse?.state?.toolResults) {
      agentResponse.state.toolResults.forEach((result: any) => {
        if (result.success && result.data) {
          if (result.action === 'search_venues' && result.data.venues) {
            enrichedVenues.push(...result.data.venues);
          }
          if (result.action === 'batch_search_venues' && result.data.results) {
            result.data.results.forEach((searchResult: any) => {
              if (searchResult.success && searchResult.venues) {
                enrichedVenues.push(...searchResult.venues);
              }
            });
          }
        }
      });
    }

    const selectedVenueIds = agentResponse?.state?.finishParameters?.selected_venue_ids;
    if (selectedVenueIds && selectedVenueIds.length > 0) {
      const venueMap = new Map<string, any>();
      enrichedVenues.forEach(v => {
        if (v.placeId) venueMap.set(v.placeId, v);
      });

      const orderedVenues: any[] = [];
      selectedVenueIds.forEach((placeId: string) => {
        if (placeId === 'user-location') return;
        const venue = venueMap.get(placeId);
        if (venue) orderedVenues.push(venue);
      });

      enrichedVenues = orderedVenues;
    }

    if (userLocation && enrichedVenues.length > 0 && mode === 'route') {
      const hasUserLocation = enrichedVenues.some(v => v.placeId === 'user-location');
      if (!hasUserLocation) {
        enrichedVenues.unshift({
          placeId: 'user-location',
          name: 'Your Location',
          address: userLocation.name,
          location: { lat: userLocation.lat, lng: userLocation.lng },
          isUserLocation: true,
          description: 'User provided location',
          category: 'user_location',
          priority: 'nice_to_have',
          enriched: false,
          enrichmentSource: 'gemini_only'
        });
      }
    }

    const alternativesMap = agentResponse?.state?.finishParameters?.alternatives_map || {};
    let simplifiedAlternativesMap: Record<string, any[]> = {};
    Object.entries(alternativesMap).forEach(([placeId, info]: [string, any]) => {
      simplifiedAlternativesMap[placeId] = info.alternatives || info;
    });

    let resultMessage = agentResponse?.result || 'Your plan is ready!';

    if (mode === 'discovery' && classification.queryType === 'discovery') {
      const nearTerms = extractNearSearchTerms(prompt);
      if (nearTerms && enrichedVenues.length > 1) {
        const queryTokens = normalizeQueryTokens(nearTerms.query);
        if (queryTokens.length > 0 && !isGenericQueryTokens(queryTokens)) {
          const matchingVenues = enrichedVenues.filter(v =>
            v?.name && venueMatchesQuery(v.name, queryTokens)
          );
          const matchRatio = matchingVenues.length / enrichedVenues.length;

          if (matchingVenues.length >= 2 && matchRatio >= 0.6) {
            const nearLabel = nearTerms.near;
            const nearLower = nearLabel.toLowerCase();
            const useUserLocationRef =
              (nearLower === 'me' || nearLower === 'here' || nearLower === 'my location' || nearLower === 'current location') &&
              userLocation &&
              Number.isFinite(userLocation.lat) &&
              Number.isFinite(userLocation.lng);

            let referenceCoords = useUserLocationRef
              ? { lat: userLocation.lat, lng: userLocation.lng }
              : null;

            if (!referenceCoords) {
              const placesClient = getGooglePlacesClient();
              referenceCoords = await geocodeLocation(placesClient, nearLabel);
              if (!referenceCoords && userLocation?.name) {
                referenceCoords = await geocodeLocation(placesClient, `${nearLabel}, ${userLocation.name}`);
              }
            }

            if (referenceCoords) {
              const withDistance = matchingVenues
                .map(v => {
                  const lat = Number(v?.location?.lat);
                  const lng = Number(v?.location?.lng);
                  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
                  return {
                    venue: v,
                    distanceKm: haversineDistanceKm(referenceCoords.lat, referenceCoords.lng, lat, lng)
                  };
                })
                .filter(Boolean) as Array<{ venue: any; distanceKm: number }>;

              if (withDistance.length >= 2) {
                withDistance.sort((a, b) => a.distanceKm - b.distanceKm);
                const primaryVenue = withDistance[0].venue;
                if (primaryVenue?.placeId) {
                  const seenPlaceIds = new Set<string>([primaryVenue.placeId]);
                  const uniqueAlternatives: any[] = [];

                  withDistance.slice(1).forEach(item => {
                    const alt = item.venue;
                    if (alt.placeId && !seenPlaceIds.has(alt.placeId)) {
                      uniqueAlternatives.push(alt);
                      seenPlaceIds.add(alt.placeId);
                    }
                  });

                  enrichedVenues = [primaryVenue];
                  simplifiedAlternativesMap = { [primaryVenue.placeId]: uniqueAlternatives };
                  resultMessage = buildNearestAlternativesMessage(primaryVenue, uniqueAlternatives, nearLabel);

                  if (agentResponse?.state?.finishParameters) {
                    agentResponse.state.finishParameters.selected_venue_ids = [primaryVenue.placeId];
                  }
                }
              }
            }
          }
        }
      }
    }

    const { enhancedResult, routes: calculatedRoutes } = await calculateAndAppendRouteInfo(
      resultMessage,
      enrichedVenues,
      mode
    );

    try {
      await outputLogger.saveOutput({
        prompt,
        userLocation,
        result: enhancedResult,
        venues: enrichedVenues,
        events: events,
        mode,
        queryType: classification.queryType,
        alternativesMap: simplifiedAlternativesMap,
        routes: calculatedRoutes,
        executionTimeMs: agentResponse?.executionTimeMs,
        tokensUsed: agentResponse?.tokensUsed,
        iterations: agentResponse?.iterations
      });
    } catch (logError) {
      console.warn('⚠️ Failed to save output log:', logError);
    }

    console.log('\n' + '='.repeat(80));
    console.log('✅ REQUEST COMPLETED');
    console.log(`   Venues: ${enrichedVenues.length}`);
    console.log('='.repeat(80) + '\n');

    return res.json({
      success: agentResponse?.success ?? false,
      result: enhancedResult,
      mode,
      queryType: classification.queryType,
      venues: enrichedVenues,
      events: events,
      routes: calculatedRoutes,
      alternativesMap: simplifiedAlternativesMap,
      state: agentResponse?.state,
      iterations: agentResponse?.iterations,
      tokensUsed: agentResponse?.tokensUsed,
      executionTimeMs: agentResponse?.executionTimeMs,
      stoppedReason: agentResponse?.stoppedReason,
      error: agentResponse?.error,
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

// ============================================================================
// HEALTH CHECK
// ============================================================================
router.get('/health', (req: Request, res: Response) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    service: 'PlanMate API'
  });
});

export default router;
