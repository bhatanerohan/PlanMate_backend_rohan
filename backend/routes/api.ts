
import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
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
import { formatItineraryMessage } from '../services/itinerary-formatter.js';
import { enrichWithInstagramReels } from '../services/video-enrichment-agent.js';
import { startReelsJob, getReelsJobStatus } from '../services/reels-job-store.js';
import { createSharedTrip, getSharedTrip } from '../services/share.js';
import {
  getAuthenticatedUserFromRequest,
  getAuthCookieName,
  getAuthCookieOptions,
  revokeSessionFromRequest,
  signInWithGoogleCredential
} from '../services/auth.js';
import {
  saveAnalyticsEvent,
  trackModification,
  trackReelClick,
  getAllAnalytics,
  type AnalyticsEvent
} from '../services/analytics.js';
import { GoogleGenAI } from '@google/genai';

const router = Router();

// ============================================================================
// AUTH ROUTES
// ============================================================================

router.post('/auth/google', async (req: Request, res: Response) => {
  try {
    const credential = req.body?.credential;
    if (!credential || typeof credential !== 'string') {
      return res.status(400).json({ success: false, error: 'Google credential is required' });
    }

    const { user, sessionToken } = await signInWithGoogleCredential(credential);

    res.cookie(getAuthCookieName(), sessionToken, getAuthCookieOptions());
    return res.json({ success: true, user });
  } catch (error) {
    console.error('Google auth error:', error);
    return res.status(401).json({
      success: false,
      error: error instanceof Error ? error.message : 'Google sign-in failed'
    });
  }
});

router.get('/auth/me', async (req: Request, res: Response) => {
  try {
    const user = await getAuthenticatedUserFromRequest(req);
    if (!user) {
      return res.status(401).json({ success: false, authenticated: false });
    }

    return res.json({ success: true, authenticated: true, user });
  } catch (error) {
    console.error('Auth me error:', error);
    return res.status(500).json({ success: false, error: 'Failed to fetch authenticated user' });
  }
});

router.post('/auth/logout', async (req: Request, res: Response) => {
  try {
    await revokeSessionFromRequest(req);
    res.clearCookie(getAuthCookieName(), getAuthCookieOptions());
    return res.json({ success: true });
  } catch (error) {
    console.error('Logout error:', error);
    return res.status(500).json({ success: false, error: 'Failed to log out' });
  }
});

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
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
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
// HELPER: Determine walkable vs spread preference and radius
// ============================================================================
type GeoPreference = {
  mode: 'walkable' | 'spread';
  radiusKm: number;
  anchorLabel?: string;
  reason: string;
};

type GeoPreferenceOverride = 'auto' | 'walkable' | 'spread';

const WALKABLE_CUE_PATTERNS = [
  /\bwalkable\b/i,
  /\bwalking\b/i,
  /\bon\s+foot\b/i,
  /\bnearby\b/i,
  /\bclose\s+to\b/i,
  /\bwithin\s+\d+(\.\d+)?\s*(minutes?|mins?)\s*walk/i
];

const SPREAD_CUE_PATTERNS = [
  /\banywhere\b/i,
  /\bcity[-\s]?wide\b/i,
  /\bacross\s+(the\s+)?city\b/i,
  /\ball\s+over\b/i,
  /\bspread\s+out\b/i,
  /\bfar\s+apart\b/i
];

const NEAR_ME_PATTERNS = [
  /\bnear\s+me\b/i,
  /\baround\s+me\b/i,
  /\bclose\s+to\s+me\b/i,
  /\bnear\s+my\s+location\b/i,
  /\bcurrent\s+location\b/i,
  /\bmy\s+location\b/i,
  /\bhere\b/i
];
const ANYWHERE_FINE_PATTERN = /\banywhere\s+(is\s+)?fine\b/i;

function parseRadiusKm(prompt: string): number | null {
  const distanceMatch = prompt.match(/\bwithin\s+(\d+(?:\.\d+)?)\s*(miles?|mi|kilometers?|km|meters?|m)\b/i);
  if (distanceMatch) {
    const value = Number(distanceMatch[1]);
    const unit = distanceMatch[2].toLowerCase();
    if (unit.startsWith('mi')) return value * 1.609;
    if (unit.startsWith('km')) return value;
    if (unit.startsWith('m')) return value / 1000;
  }

  const walkMatch = prompt.match(/\b(\d+(?:\.\d+)?)\s*(minutes?|mins?)\s*walk\b/i);
  if (walkMatch) {
    const minutes = Number(walkMatch[1]);
    const kmPerMin = 5 / 60;
    return minutes * kmPerMin;
  }

  return null;
}

function extractAreaHint(prompt: string): string | null {
  const nearTerms = extractNearSearchTerms(prompt);
  if (nearTerms?.near) {
    return nearTerms.near;
  }

  const match = prompt.match(/\b(?:in|around|within)\s+([a-z0-9\s&'".-]+?)(?:,|\.|!|\?|$)/i);
  if (!match) return null;

  const candidate = match[1].trim();
  if (!candidate) return null;
  if (/\b(minutes?|mins?|hours?|miles?|km)\b/i.test(candidate)) return null;
  if (candidate.length < 3) return null;

  return candidate;
}

function isUserLocationReference(label: string): boolean {
  const normalized = label.trim().toLowerCase();
  return normalized === 'me' ||
    normalized === 'here' ||
    normalized === 'my location' ||
    normalized === 'current location';
}

function deriveGeoPreference(
  prompt: string,
  userLocation?: { lat: number; lng: number; name: string }
): GeoPreference {
  const radiusKm = parseRadiusKm(prompt);
  const hasWalkableCue = WALKABLE_CUE_PATTERNS.some(pattern => pattern.test(prompt));
  const hasSpreadCue = SPREAD_CUE_PATTERNS.some(pattern => pattern.test(prompt));
  const hasNearMeCue = NEAR_ME_PATTERNS.some(pattern => pattern.test(prompt));
  const hasAnywhereFine = ANYWHERE_FINE_PATTERN.test(prompt);
  const areaHint = extractAreaHint(prompt);

  let mode: 'walkable' | 'spread' = 'spread';
  let reason = 'default';

  if (hasSpreadCue && (!hasWalkableCue || hasAnywhereFine)) {
    mode = 'spread';
    reason = 'spread cue';
  } else if (hasWalkableCue || radiusKm !== null || hasNearMeCue) {
    mode = 'walkable';
    reason = 'walkable cue';
  } else if (areaHint) {
    mode = 'walkable';
    reason = 'area anchor';
  } else if (userLocation && Number.isFinite(userLocation.lat) && Number.isFinite(userLocation.lng)) {
    mode = 'walkable';
    reason = 'user location default';
  }

  const anchorLabel = areaHint && !isUserLocationReference(areaHint) ? areaHint : undefined;

  return {
    mode,
    radiusKm: radiusKm || 1.5,
    anchorLabel,
    reason
  };
}

function normalizeGeoPreferenceOverride(value: any): GeoPreferenceOverride | undefined {
  if (!value) return undefined;
  const normalized = String(value).trim().toLowerCase();
  if (normalized === 'auto') return 'auto';
  if (normalized === 'walkable' || normalized === 'tight') return 'walkable';
  if (normalized === 'spread' || normalized === 'wide' || normalized === 'explore' || normalized === 'exploration') {
    return 'spread';
  }
  return undefined;
}

function applyGeoPreferenceOverride(
  derived: GeoPreference,
  override?: GeoPreferenceOverride
): GeoPreference {
  if (!override || override === 'auto') return derived;
  return {
    ...derived,
    mode: override,
    reason: 'user override'
  };
}

// ============================================================================
// HELPER: Anchor discovery searches to itinerary stops when user says "nearby"
// ============================================================================
type ItineraryAnchor = { lat: number; lng: number; name: string };

function deriveItineraryAnchor(prompt: string, itinerary?: CurrentItinerary | null): ItineraryAnchor | null {
  if (!itinerary?.venues || itinerary.venues.length === 0) return null;

  const venues = itinerary.venues;
  const normalizedPrompt = prompt.toLowerCase();
  const hasNearbyCue = /\bnearby\b/i.test(prompt) ||
    /\bclose\s+by\b/i.test(prompt) ||
    NEAR_ME_PATTERNS.some(pattern => pattern.test(prompt));
  const hasNearCue = /\bnear\b/i.test(prompt) ||
    /\baround\b/i.test(prompt) ||
    /\bclose\s+to\b/i.test(prompt) ||
    /\bby\b/i.test(prompt);

  const isUserLocationVenue = (venue: any): boolean =>
    !!venue && (venue.placeId === 'user-location' || venue.isUserLocation);

  const nonUserVenues = venues.filter(v =>
    v?.location &&
    Number.isFinite(v.location.lat) &&
    Number.isFinite(v.location.lng) &&
    !isUserLocationVenue(v)
  );

  const pickVenue = (venue: any): ItineraryAnchor | null => {
    if (!venue?.location || !Number.isFinite(venue.location.lat) || !Number.isFinite(venue.location.lng)) return null;
    return { lat: venue.location.lat, lng: venue.location.lng, name: venue.name || 'Itinerary stop' };
  };

  // Explicit stop number reference (e.g., "near stop 5")
  const stopMatch = prompt.match(/(?:stop\s*(?:number\s*)?|#)?(\d+)(?:th|st|nd|rd)?\s*(?:stop)?/i);
  if (stopMatch) {
    const idx = parseInt(stopMatch[1], 10) - 1;
    if (idx >= 0 && idx < venues.length) {
      const anchor = pickVenue(venues[idx]);
      if (anchor) return anchor;
    }
  }

  // Explicit venue name reference (when "near/around/by" is used)
  if (hasNearCue) {
    const sortedByNameLength = [...nonUserVenues].sort(
      (a, b) => (b.name?.length || 0) - (a.name?.length || 0)
    );
    for (const venue of sortedByNameLength) {
      const name = String(venue.name || '').toLowerCase();
      if (name.length >= 3 && normalizedPrompt.includes(name)) {
        const anchor = pickVenue(venue);
        if (anchor) return anchor;
      }
    }
  }

  // "nearby" with an existing itinerary → anchor to last non-user stop
  if (hasNearbyCue && nonUserVenues.length > 0) {
    const anchor = pickVenue(nonUserVenues[nonUserVenues.length - 1]);
    if (anchor) return anchor;
  }

  return null;
}

// ============================================================================
// HELPER: Parse requested result count from prompt
// ============================================================================
function parseRequestedCount(prompt: string): number | null {
  const patterns = [
    /\btop\s+(\d+)\b/i,
    /\bshow\s+me\s+(\d+)\b/i,
    /\b(\d+)\s+(?:places|venues|spots|restaurants|cafes|coffee\s+shops|bars|museums)\b/i
  ];

  for (const pattern of patterns) {
    const match = prompt.match(pattern);
    if (match) {
      const count = Number(match[1]);
      if (Number.isFinite(count) && count >= 1 && count <= 20) {
        return count;
      }
    }
  }

  return null;
}

// ============================================================================
// HELPER: Build alternatives map from tool results (Agent 2 path)
// ============================================================================
function buildAlternativesFromToolResults(
  toolResults: any[],
  selectedVenueIds: string[] | undefined
): Record<string, any[]> {
  const alternativesMap: Record<string, any[]> = {};
  const selectedSet = new Set(selectedVenueIds || []);
  const assignedAlternativeIds = new Set<string>();

  const collect = (venues: any[]) => {
    if (!Array.isArray(venues) || venues.length < 2) return;
    let primary = venues[0];
    if (selectedSet.size > 0) {
      const match = venues.find(v => v?.placeId && selectedSet.has(v.placeId));
      if (match) primary = match;
    }
    if (!primary?.placeId) return;

    const alternatives = venues.filter(v => v?.placeId && v.placeId !== primary.placeId);
    const uniqueAlternatives = alternatives.filter(v => {
      if (!v.placeId || assignedAlternativeIds.has(v.placeId)) return false;
      assignedAlternativeIds.add(v.placeId);
      return true;
    });

    if (uniqueAlternatives.length > 0) {
      alternativesMap[primary.placeId] = uniqueAlternatives;
    }
  };

  toolResults.forEach(result => {
    if (!result?.success || !result?.data) return;
    if (result.action === 'search_venues' && Array.isArray(result.data.venues)) {
      collect(result.data.venues);
    }
    if (result.action === 'batch_search_venues' && Array.isArray(result.data.results)) {
      result.data.results.forEach((searchResult: any) => {
        if (searchResult?.success && Array.isArray(searchResult.venues)) {
          collect(searchResult.venues);
        }
      });
    }
  });

  if (selectedSet.size > 0) {
    Object.keys(alternativesMap).forEach(placeId => {
      if (!selectedSet.has(placeId)) {
        delete alternativesMap[placeId];
      }
    });
  }

  return alternativesMap;
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
    const { prompt, userLocation, currentItinerary, geoPreference: geoPreferenceOverride, deviceType } = req.body;

    // Generate session ID for analytics tracking
    const sessionId = uuidv4();

    // Detect device type from request body or User-Agent header
    const detectedDeviceType: 'mobile' | 'desktop' = deviceType ||
      (req.headers['user-agent']?.toLowerCase().includes('mobile') ? 'mobile' : 'desktop');

    if (!prompt || typeof prompt !== 'string' || prompt.trim().length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Prompt is required and must be a non-empty string'
      });
    }

    console.log(`\n${'='.repeat(80)}`);
    console.log(`📥 Received: "${prompt}"`);
    console.log(`📊 Session: ${sessionId} | Device: ${detectedDeviceType}`);
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
    const startClassification = Date.now();

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

    const classificationDuration = Date.now() - startClassification;
    console.log(`⏱️ [Perf] Intent Classification: ${classificationDuration}ms`);

    if (!classification.isRelevant) {
      return res.status(400).json({
        success: false,
        error: 'not_relevant',
        message: classification.reasoning || "I can only help with location-based queries."
      });
    }

    const geoPreference = applyGeoPreferenceOverride(
      deriveGeoPreference(prompt, userLocation),
      normalizeGeoPreferenceOverride(geoPreferenceOverride)
    );
    const requestedCount = parseRequestedCount(prompt) ?? undefined;
    console.log(`\n📍 Geo preference: ${geoPreference.mode} (${geoPreference.reason})`);

    const itineraryAnchor = deriveItineraryAnchor(prompt, currentItinerary);
    const searchAnchorLocation = itineraryAnchor
      ? { lat: itineraryAnchor.lat, lng: itineraryAnchor.lng, name: itineraryAnchor.name }
      : userLocation;
    if (itineraryAnchor) {
      console.log(`📌 Using itinerary anchor for nearby search: ${itineraryAnchor.name} (${itineraryAnchor.lat}, ${itineraryAnchor.lng})`);
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

      const perfStats: Record<string, number> = {
        intent_classification: classificationDuration
      };
      const flowStart = Date.now();

      // ----------------------------------------------------------------------
      // STEP 2: GEMINI - Get 15-20 candidates with categories
      // ----------------------------------------------------------------------
      console.log('\n🔍 STEP 2: Calling Gemini for 15-20 CANDIDATES...');
      const startGemini = Date.now();

      const geminiResult = await geminiGroundingAgent.getRecommendations(prompt, userLocation);

      perfStats['gemini_generation'] = Date.now() - startGemini;
      console.log(`⏱️ [Perf] Gemini Generation: ${perfStats['gemini_generation']}ms`);

      if (!geminiResult.venues || geminiResult.venues.length === 0) {
        console.warn('⚠️ Gemini returned no venues, falling back to direct Agent 2');

        const agent2 = new ReActAgent(DEFAULT_SAFETY_CONFIG);
        agentResponse = await agent2.execute(prompt, searchAnchorLocation, {
          isItinerary: classification.queryType === 'itinerary_planning',
          originalPrompt: prompt,
          searchPreference: geoPreference.mode,
          searchRadiusKm: geoPreference.radiusKm,
          anchorLabel: geoPreference.anchorLabel,
          requestedCount
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
        const startEnrich = Date.now();

        const reactAgent = new ReActAgent(DEFAULT_SAFETY_CONFIG);
        const enrichmentResult = await reactAgent.enrichAllCandidates(
          geminiResult.venues,
          prompt,
          userLocation
        );

        perfStats['enrichment'] = Date.now() - startEnrich;
        console.log(`⏱️ [Perf] Google Places Enrichment: ${perfStats['enrichment']}ms`);

        console.log(`   ✅ Enriched ${enrichmentResult.candidates.length} candidates`);
        console.log(`   🎯 Must-have found: ${enrichmentResult.must_have_count}`);
        console.log(`   ✨ Nice-to-have found: ${enrichmentResult.nice_to_have_count}`);

        // ----------------------------------------------------------------------
        // STEP 4: CORRIDOR DETECTION + VENUE SELECTION
        // ----------------------------------------------------------------------
        console.log('\n🎯 STEP 4: Selecting optimal venues...');
        const startSelection = Date.now();

        // 🆕 Detect corridor query FIRST
        const corridorInfo = await detectCorridorQuery(prompt);
        let selectionAnchorCoords: { lat: number; lng: number } | undefined;
        if (geoPreference.mode === 'walkable') {
          if (geoPreference.anchorLabel && !isUserLocationReference(geoPreference.anchorLabel)) {
            try {
              const placesClient = getGooglePlacesClient();
              selectionAnchorCoords = await geocodeLocation(placesClient, geoPreference.anchorLabel) || undefined;
            } catch (anchorError) {
              console.warn('⚠️ Anchor geocode failed:', anchorError);
            }
          } else if (userLocation && Number.isFinite(userLocation.lat) && Number.isFinite(userLocation.lng)) {
            selectionAnchorCoords = { lat: userLocation.lat, lng: userLocation.lng };
          }
        }

        let selectionResult;

        if (corridorInfo.isCorridor && corridorInfo.startCoords && corridorInfo.endCoords) {
          // CORRIDOR MODE
          console.log('   📍 Mode: CORRIDOR');

          selectionResult = await venueSelector.selectVenuesWithMode(
            enrichmentResult.candidates,
            {
              userRequestedCount: requestedCount || geminiResult.plan?.total_stops || 6,
              corridorStart: corridorInfo.startCoords,
              corridorEnd: corridorInfo.endCoords,
              isCorridorQuery: true,
              userPrompt: prompt,  // 🆕 Add this
              selectionPreference: geoPreference.mode
            }
          );
        } else {
          // CLUSTER MODE
          console.log('   📍 Mode: CLUSTER');

          selectionResult = await venueSelector.selectVenues(
            enrichmentResult.candidates,
            requestedCount || geminiResult.plan?.total_stops || 6,
            prompt,  // 🆕 Add this
            geoPreference.mode,
            selectionAnchorCoords,
            geoPreference.radiusKm
          );
        }

        perfStats['venue_selection'] = Date.now() - startSelection;
        console.log(`⏱️ [Perf] Venue Selection: ${perfStats['venue_selection']}ms`);

        if (selectionResult.selectedVenues.length === 0) {
          return res.status(500).json({
            success: false,
            error: 'Could not find suitable venues. Please try again.'
          });
        }

        console.log(`   ✅ Selected ${selectionResult.selectedVenues.length} venues`);
        console.log(`   📍 Cluster radius: ${selectionResult.clusterRadiusKm.toFixed(2)}km`);

        // ----------------------------------------------------------------------
        // STEP 5: ROUTE OPTIMIZATION + INSTAGRAM REELS (PARALLEL)
        // ----------------------------------------------------------------------
        console.log('\n🗺️ STEP 5: Optimizing route...');
        const startOptimization = Date.now();

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

        perfStats['route_optimization'] = Date.now() - startOptimization;
        console.log(`⏱️ [Perf] Route Optimization: ${perfStats['route_optimization']}ms`);

        // Add user location at start (AFTER optimization) - ONLY if includeUserLocation is true
        const shouldIncludeUserLocation = classification.includeUserLocation ?? true; // Default to true for backward compat
        console.log(`📍 Include user location in route: ${shouldIncludeUserLocation}`);

        if (userLocation && shouldIncludeUserLocation) {
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

        // ----------------------------------------------------------------------
        // AWAIT INSTAGRAM REELS (started in parallel earlier)
        // ----------------------------------------------------------------------


        // Apply reels to finalVenues (which may be reordered)




        // DEBUG LOGGING


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

        const formattedResult = await formatItineraryMessage({
          prompt,
          plan: geminiResult.plan,
          venues: finalVenues,
          routes
        });
        const finalResultMessage = formattedResult || enhancedResult;

        const totalTime = Date.now() - flowStart;
        perfStats['total_end_to_end'] = totalTime;

        console.log('\n' + '═'.repeat(60));
        console.log('⚡ PERFORMANCE SUMMARY');
        console.log('═'.repeat(60));
        console.log(`Classification:     ${(perfStats['intent_classification'] / 1000).toFixed(2)}s`);
        console.log(`Gemini Generation:  ${(perfStats['gemini_generation'] / 1000).toFixed(2)}s`);
        console.log(`Enrichment:         ${(perfStats['enrichment'] / 1000).toFixed(2)}s`);
        console.log(`Venue Selection:    ${(perfStats['venue_selection'] / 1000).toFixed(2)}s`);
        console.log(`Route Optimization: ${(perfStats['route_optimization'] / 1000).toFixed(2)}s`);
        console.log(`Video Enrichment:   ${(perfStats['video_enrichment'] / 1000).toFixed(2)}s`);
        console.log('─'.repeat(60));
        console.log(`TOTAL DURATION:     ${(totalTime / 1000).toFixed(2)}s`);
        console.log('═'.repeat(60) + '\n');

        // Save analytics event
        try {
          const analyticsEvent: AnalyticsEvent = {
            session_id: sessionId,
            device_type: detectedDeviceType,
            user_prompt: prompt,
            query_type: classification.queryType === 'itinerary_planning' ? 'planning' : 'discovery',
            timing: {
              intent_classification: perfStats['intent_classification'] || 0,
              plan_creation: perfStats['gemini_generation'] || 0,
              venue_enrichment: perfStats['enrichment'] || 0,
              route_optimization: perfStats['route_optimization'] || 0,
              video_enrichment: perfStats['video_enrichment'] || 0,
              total: totalTime
            },
            gemini: {
              input_tokens: (geminiResult as any).tokensUsed?.input || 0,
              output_tokens: (geminiResult as any).tokensUsed?.output || 0,
              raw_output: geminiResult.venues || []
            },
            final_output: {
              venues: finalVenues.filter(v => v.placeId !== 'user-location'),
              alternatives: [],
              venue_count: finalVenues.filter(v => v.placeId !== 'user-location').length
            },
            modifications: { count: 0, prompts: [] },
            clicked_reels: false
          };
          await saveAnalyticsEvent(analyticsEvent);
        } catch (analyticsError) {
          console.warn('⚠️ Failed to save analytics:', analyticsError);
        }

        try {
          await outputLogger.saveOutput({
            prompt,
            userLocation,
            result: finalResultMessage,
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

        // 🆕 Fire-and-forget: kick off Apify reels job in background
        startReelsJob(sessionId, finalVenues);

        return res.json({
          success: true,
          session_id: sessionId,
          result: finalResultMessage,
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
            isUserLocation: v.isUserLocation,
            instagramReels: v.instagramReels || []
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
      agentResponse = await reactAgent.execute(prompt, searchAnchorLocation, {
        isItinerary: classification.queryType === 'explicit_route',
        originalPrompt: prompt,
        searchPreference: geoPreference.mode,
        searchRadiusKm: geoPreference.radiusKm,
        anchorLabel: geoPreference.anchorLabel,
        requestedCount
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

    if (mode === 'route' && enrichedVenues.length > 1 && (!selectedVenueIds || selectedVenueIds.length === 0)) {
      try {
        const userLat = Number(userLocation?.lat);
        const userLng = Number(userLocation?.lng);
        const hasUserLocationCoords =
          !!userLocation && Number.isFinite(userLat) && Number.isFinite(userLng);

        const venueCoordinates = enrichedVenues.map(v => ({
          lat: Number(v?.location?.lat),
          lng: Number(v?.location?.lng)
        }));
        const venuesHaveCoords = venueCoordinates.every(
          coord => Number.isFinite(coord.lat) && Number.isFinite(coord.lng)
        );

        if (!venuesHaveCoords) {
          console.log('   ⚠️ Route optimization skipped: missing venue coordinates');
        } else if (hasUserLocationCoords) {
          const coordinates = [{ lat: userLat, lng: userLng }, ...venueCoordinates];
          const optimizedResult = optimizeFromUserLocation(coordinates, 0);
          const venueOrder = optimizedResult.optimizedOrder
            .filter(idx => idx !== 0)
            .map(idx => idx - 1);

          if (venueOrder.length === enrichedVenues.length) {
            const originalVenues = [...enrichedVenues];
            enrichedVenues = venueOrder.map(idx => originalVenues[idx]);
            console.log('   ✅ Route optimized via Multi-Start Nearest Neighbor (Agent 2)');
          }
        } else {
          const optimizedResult = nearestNeighborOptimization(venueCoordinates);
          const venueOrder = optimizedResult.optimizedOrder;

          if (venueOrder.length === enrichedVenues.length) {
            const originalVenues = [...enrichedVenues];
            enrichedVenues = venueOrder.map(idx => originalVenues[idx]);
            console.log('   ✅ Route optimized via Multi-Start Nearest Neighbor (Agent 2)');
          }
        }
      } catch (optimizationError) {
        console.warn('   ⚠️ Route optimization failed, using original order:', optimizationError);
      }
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
    if (Object.keys(simplifiedAlternativesMap).length === 0 && agentResponse?.state?.toolResults) {
      simplifiedAlternativesMap = buildAlternativesFromToolResults(
        agentResponse.state.toolResults,
        selectedVenueIds
      );
    }

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

    if (requestedCount && enrichedVenues.length > requestedCount && !selectedVenueIds?.length) {
      enrichedVenues = enrichedVenues.slice(0, requestedCount);
    }

    const { enhancedResult, routes: calculatedRoutes } = await calculateAndAppendRouteInfo(
      resultMessage,
      enrichedVenues,
      mode
    );

    let finalResultMessage = enhancedResult;
    if (mode === 'route') {
      const formattedResult = await formatItineraryMessage({
        prompt,
        venues: enrichedVenues,
        routes: calculatedRoutes
      });
      if (formattedResult) {
        finalResultMessage = formattedResult;
      }
    }

    try {
      await outputLogger.saveOutput({
        prompt,
        userLocation,
        result: finalResultMessage,
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

    // 🆕 Fire-and-forget: kick off Apify reels job in background
    startReelsJob(sessionId, enrichedVenues);

    return res.json({
      success: agentResponse?.success ?? false,
      result: finalResultMessage,
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
// SHARE TRIP ENDPOINTS
// ============================================================================

router.post('/share-trip', async (req: Request, res: Response) => {
  try {
    const payload = req.body?.payload;
    if (!payload || !Array.isArray(payload.venues) || payload.venues.length === 0) {
      return res.status(400).json({ success: false, error: 'payload with venues is required' });
    }

    const authenticatedUser = await getAuthenticatedUserFromRequest(req);
    const normalizedPayload = {
      ...payload,
      createdBy: authenticatedUser?.name || authenticatedUser?.email || payload.createdBy
    };

    const shareId = await createSharedTrip(normalizedPayload);
    return res.json({ success: true, shareId });
  } catch (error) {
    console.error('❌ Share trip error:', error);
    return res.status(500).json({ success: false, error: 'Failed to create share link' });
  }
});

router.get('/share-trip/:id', async (req: Request, res: Response) => {
  try {
    const shareId = req.params.id;
    if (!shareId) {
      return res.status(400).json({ success: false, error: 'shareId is required' });
    }

    const payload = await getSharedTrip(shareId);
    if (!payload) {
      return res.status(404).json({ success: false, error: 'Share link not found' });
    }

    return res.json({ success: true, payload });
  } catch (error) {
    console.error('❌ Share fetch error:', error);
    return res.status(500).json({ success: false, error: 'Failed to fetch share link' });
  }
});

// ============================================================================
// ANALYTICS ENDPOINTS
// ============================================================================

/**
 * Track itinerary modifications
 */
router.post('/analytics/modification', async (req: Request, res: Response) => {
  try {
    const { session_id, prompt } = req.body;
    if (!session_id || !prompt) {
      return res.status(400).json({ success: false, error: 'session_id and prompt required' });
    }
    await trackModification(session_id, prompt);
    res.json({ success: true });
  } catch (error) {
    console.error('Analytics modification error:', error);
    res.status(500).json({ success: false, error: 'Failed to track modification' });
  }
});

/**
 * Track reel clicks with details and watch time
 */
router.post('/analytics/reel-click', async (req: Request, res: Response) => {
  try {
    const { session_id, reel_id, reel_url, watch_time_seconds } = req.body;
    if (!session_id) {
      return res.status(400).json({ success: false, error: 'session_id required' });
    }
    await trackReelClick(session_id, reel_id, reel_url, watch_time_seconds);
    res.json({ success: true });
  } catch (error) {
    console.error('Analytics reel-click error:', error);
    res.status(500).json({ success: false, error: 'Failed to track reel click' });
  }
});

/**
 * Export all analytics data
 */
router.get('/analytics/export', async (req: Request, res: Response) => {
  try {
    const data = await getAllAnalytics();
    res.json({ success: true, count: data.length, data });
  } catch (error) {
    console.error('Analytics export error:', error);
    res.status(500).json({ success: false, error: 'Failed to export analytics' });
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

// ============================================================================
// REELS STATUS ENDPOINT: /reels-status/:sessionId (Polling)
// ============================================================================
router.get('/reels-status/:sessionId', (req: Request, res: Response) => {
  const { sessionId } = req.params;
  if (!sessionId) {
    return res.status(400).json({ success: false, error: 'sessionId is required' });
  }

  const result = getReelsJobStatus(sessionId);
  return res.json({ success: true, ...result });
});

// ============================================================================
// REELS ENDPOINT: /reels (Lazy Loading — fallback)
// ============================================================================
router.post('/reels', async (req: Request, res: Response) => {
  try {
    const { venues } = req.body; // Array of { placeId, name, address }

    if (!venues || !Array.isArray(venues) || venues.length === 0) {
      return res.status(400).json({ success: false, error: 'venues array required' });
    }

    console.log(`📸 Fetching Instagram Reels for ${venues.length} venues...`);

    const enrichedVenues = await enrichWithInstagramReels(venues, { maxReelsPerVenue: 5 });

    // Build a map of placeId -> reels
    const reelsMap: Record<string, any[]> = {};
    for (const venue of enrichedVenues) {
      if (venue.instagramReels && venue.instagramReels.length > 0) {
        reelsMap[venue.placeId] = venue.instagramReels;
      }
    }

    return res.json({ success: true, reelsMap });
  } catch (error) {
    console.error('❌ Reels endpoint error:', error);
    return res.status(500).json({ success: false, error: 'Failed to fetch reels' });
  }
});

// ============================================================================
// VENUE CHAT ENDPOINT (Grounding with Google Search + Nearby Places)
// ============================================================================
router.post('/venue-chat', async (req: Request, res: Response) => {
  try {
    const { venue, question, history } = req.body;

    if (!venue || !question) {
      return res.status(400).json({ success: false, error: 'Venue and question are required' });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      console.error('❌ GEMINI_API_KEY missing');
      return res.status(500).json({ success: false, error: 'Server configuration error' });
    }

    const ai = new GoogleGenAI({ apiKey });

    console.log(`\n💬 VENUE CHAT: "${question}" about "${venue.name}"`);

    // Build venue location string for Places API searches
    const venueLocationStr = venue.location
      ? `${venue.location.lat},${venue.location.lng}`
      : undefined;

    // Build system prompt with venue context
    // Instruct Gemini to return structured JSON so we can extract mentioned places
    const systemPrompt = `You are a helpful, knowledgeable venue guide for ${venue.name}.
    
VENUE DETAILS:
- Name: ${venue.name}
- Address: ${venue.address || 'Unknown'}
- Category: ${venue.category || 'Unknown'}
- Rating: ${venue.rating || 'N/A'}
- Price Level: ${venue.priceLevel || 'N/A'}
- Description: ${venue.description || 'N/A'}
${venue.location ? `- Coordinates: ${venue.location.lat}, ${venue.location.lng}` : ''}

YOUR GOAL:
Answer the user's question about this specific venue accurately using Google Search.
Be concise (2-3 sentences usually).
Never hallucinate details. If you can't find the answer via search, admit it.
Focus on current, factual info (hours, tickets, parking, restrictions, etc.).

IMPORTANT RESPONSE FORMAT:
You MUST respond with valid JSON in this exact format:
{
  "answer": "Your text answer here...",
  "mentioned_places": ["Exact Place Name 1", "Exact Place Name 2"]
}

RULES FOR mentioned_places:
- If your answer mentions ANY specific nearby places, restaurants, parks, attractions, restrooms, cinemas, etc. by name, list their EXACT names in mentioned_places.
- Use the official/Google Maps name of each place so it can be looked up.
- If no specific places are mentioned, use an empty array: []
- Do NOT include the venue itself (${venue.name}) in this list.

USER QUESTION: "${question}"
`;

    // Construct message history for context
    const contents = [];

    // Add history if present (limit to last 10 messages to save context)
    if (history && Array.isArray(history)) {
      const recentHistory = history.slice(-10);
      for (const msg of recentHistory) {
        contents.push({
          role: msg.role === 'user' ? 'user' : 'model',
          parts: [{ text: msg.text }]
        });
      }
    }

    // Add current turn
    contents.push({
      role: 'user',
      parts: [{ text: systemPrompt }]
    });

    const config: any = {
      tools: [{ googleSearch: {} }]
    };

    console.log('   🔍 Calling Gemini with Google Search...');
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents,
      config
    });

    const rawText = response.text || '';

    // Extract sources from grounding metadata
    const sources: { title: string, url: string }[] = [];
    const groundingMetadata = response.candidates?.[0]?.groundingMetadata;

    if (groundingMetadata?.groundingChunks) {
      groundingMetadata.groundingChunks.forEach((chunk: any) => {
        if (chunk.web?.uri && chunk.web?.title) {
          sources.push({
            title: chunk.web.title,
            url: chunk.web.uri
          });
        }
      });
    }

    // Deduplicate sources
    const uniqueSources = sources.filter((v, i, a) => a.findIndex(t => t.url === v.url) === i).slice(0, 3);

    // Parse Gemini's structured response
    let answerText = rawText;
    let mentionedPlaces: string[] = [];

    try {
      // Clean markdown code blocks if present
      let cleanJson = rawText.replace(/```json\s*|\s*```/g, '').trim();
      const firstBrace = cleanJson.indexOf('{');
      const lastBrace = cleanJson.lastIndexOf('}');
      if (firstBrace !== -1 && lastBrace > firstBrace) {
        cleanJson = cleanJson.substring(firstBrace, lastBrace + 1);
      }

      const parsed = JSON.parse(cleanJson);
      if (parsed.answer) {
        answerText = parsed.answer;
      }
      if (Array.isArray(parsed.mentioned_places)) {
        mentionedPlaces = parsed.mentioned_places.filter(
          (p: any) => typeof p === 'string' && p.trim().length > 0
        );
      }
    } catch (parseErr) {
      // Gemini didn't return valid JSON — use raw text as the answer
      console.log('   ⚠️ Could not parse structured response, using raw text');
      answerText = rawText;
    }

    console.log(`   ✅ Answer: "${answerText.substring(0, 60)}..."`);
    console.log(`   📍 Mentioned places: ${mentionedPlaces.length > 0 ? mentionedPlaces.join(', ') : 'none'}`);
    console.log(`   🔗 Sources: ${uniqueSources.length}`);

    // Resolve mentioned places via Google Places API
    const nearbyPlaces: { name: string; address: string; location: { lat: number; lng: number }; placeId: string; type?: string }[] = [];

    if (mentionedPlaces.length > 0) {
      try {
        const placesClient = getGooglePlacesClient();

        // Resolve all mentioned places in parallel
        const placePromises = mentionedPlaces.map(async (placeName) => {
          try {
            // Search near the venue's location for better results
            const searchQuery = venueLocationStr
              ? `${placeName} near ${venue.address || venue.name}`
              : placeName;

            const results = await placesClient.textSearch({
              query: searchQuery,
              location: venueLocationStr,
              radius: 5000, // 5km radius around the venue
              maxResults: 1
            });

            if (results && results.length > 0) {
              const place = results[0];
              console.log(`      ✅ Resolved "${placeName}" → ${place.name} (${place.location.lat}, ${place.location.lng})`);
              return {
                name: place.name,
                address: place.address,
                location: place.location,
                placeId: place.placeId,
                type: place.types?.[0]
              };
            } else {
              console.log(`      ⚠️ No results for "${placeName}"`);
              return null;
            }
          } catch (err) {
            console.warn(`      ❌ Failed to resolve "${placeName}":`, err);
            return null;
          }
        });

        const resolvedPlaces = await Promise.all(placePromises);
        resolvedPlaces.forEach(p => {
          if (p) nearbyPlaces.push(p);
        });

        console.log(`   📌 Resolved ${nearbyPlaces.length}/${mentionedPlaces.length} nearby places`);
      } catch (placesError) {
        console.error('   ❌ Places resolution error:', placesError);
      }
    }

    return res.json({
      success: true,
      answer: answerText,
      sources: uniqueSources,
      nearbyPlaces: nearbyPlaces.length > 0 ? nearbyPlaces : undefined
    });

  } catch (error) {
    console.error('❌ Venue chat error:', error);
    return res.status(500).json({ success: false, error: 'Failed to get answer' });
  }
});

export default router;
