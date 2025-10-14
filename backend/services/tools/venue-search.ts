// backend/services/tools/venue-search.ts

import { Tool } from './base-tool.js';
import type { ToolName, ToolDefinition, ToolResult, ToolExecutionContext } from '../../types/tools.js';
import { getGooglePlacesClient, GooglePlacesClient } from '../api-clients/google-places.js';

/**
 * Venue Search Tool
 * Searches for venues using Google Places API
 * Features:
 * - 3-tier progressive search: 1 mile → 5 miles → entire city
 * - Never substitutes with different venues
 */
export class VenueSearchTool extends Tool {
  name: ToolName = 'search_venues';
  description = 'Search for venues like restaurants, cafes, parks, gyms, etc.';

  getDefinition(): ToolDefinition {
    return {
      name: this.name,
      description: this.description,
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'Search query (e.g., "coffee shops", "italian restaurants", "parks")'
          },
          location: {
            type: 'string',
            description: 'Location to search in (e.g., "Boston", "New York")'
          },
          near_coordinates: {
            type: 'string',
            description: 'Optional: Search near specific coordinates for geographic optimization. Format: "latitude,longitude" (e.g., "42.365,-71.054"). Use this for second and subsequent searches to find venues close to your previous choice.'
          },
          radius: {
            type: 'string',
            description: 'Optional: Search radius when using near_coordinates (e.g., "0.5 miles", "1 mile"). Recommended: 0.3-0.5 miles for nearby, 0.5-1 mile for general area.'
          },
          limit: {
            type: 'string',
            description: 'Maximum number of results (optional, default 10)'
          }
        },
        required: ['query', 'location']
      }
    };
  }

  async execute(parameters: Record<string, any>, context?: ToolExecutionContext): Promise<ToolResult> {
    const startTime = Date.now();

    // Validate parameters
    const validation = this.validate(parameters);
    if (!validation.valid) {
      return this.error(validation.error!);
    }

    const { query, location, near_coordinates, radius, limit } = parameters;

    try {
      // Get Google Places client
      const placesClient = getGooglePlacesClient();

      let places: any[] = [];
      let searchType = 'broad';
      let radiusUsed: number | undefined;
      let radiusExpanded = false;
      
      // GEOGRAPHIC OPTIMIZATION: Use coordinates if provided
      if (near_coordinates) {
        // Parse coordinates
        const coords = this.parseCoordinates(near_coordinates as string);
        if (!coords) {
          return this.error('Invalid coordinates format. Use "latitude,longitude" (e.g., "42.365,-71.054")');
        }

        const requestedRadius = this.parseRadius(radius as string | undefined);
        
        console.log(`🔍 [VenueSearchTool] Geographic search: "${query}" near (${coords.lat}, ${coords.lng})`);

        // ========================================================================
        // 3-TIER PROGRESSIVE SEARCH: 1 mile → 5 miles → entire city
        // ========================================================================

        // TIER 1: Try 1 mile (or requested radius if smaller)
        const tier1Radius = Math.min(requestedRadius, 1609); // 1 mile = 1609 meters
        console.log(`   🎯 TIER 1: Searching within ${(tier1Radius / 1609.34).toFixed(1)} miles...`);
        
        places = await placesClient.nearbySearch(coords.lat, coords.lng, {
          query,
          radius: tier1Radius,
          maxResults: parseInt(limit as string) || 10
        });

        if (places.length > 0) {
          radiusUsed = tier1Radius;
          console.log(`   ✅ Found ${places.length} venues at tier 1`);
        } else {
          console.log(`   ⚠️ No results in tier 1, expanding to tier 2...`);

          // TIER 2: Try 5 miles
          const tier2Radius = 8047; // 5 miles
          console.log(`   🎯 TIER 2: Searching within ${(tier2Radius / 1609.34).toFixed(1)} miles...`);
          
          places = await placesClient.nearbySearch(coords.lat, coords.lng, {
            query,
            radius: tier2Radius,
            maxResults: parseInt(limit as string) || 10
          });

          if (places.length > 0) {
            radiusUsed = tier2Radius;
            radiusExpanded = true;
            console.log(`   ✅ Found ${places.length} venues at tier 2 (expanded search)`);
          } else {
            console.log(`   ⚠️ No results in tier 2, expanding to tier 3 (entire city)...`);

            // TIER 3: City-wide search (no radius limit)
            console.log(`   🎯 TIER 3: Searching entire ${location} area...`);
            
            places = await placesClient.textSearch({
              query,
              location,
              maxResults: parseInt(limit as string) || 10
            });

            if (places.length > 0) {
              radiusUsed = undefined; // City-wide has no radius
              radiusExpanded = true;
              searchType = 'city-wide';
              console.log(`   ✅ Found ${places.length} venues in city-wide search`);
            } else {
              console.log(`   ❌ No venues found even in entire city`);
            }
          }
        }

      } else {
        // Broad city search (no coordinates provided)
        console.log(`🔍 [VenueSearchTool] Broad search: "${query}" in "${location}"`);
        
        places = await placesClient.textSearch({
          query,
          location,
          maxResults: parseInt(limit as string) || 10
        });
      }

      // Format results for the agent
      const venues = places.map(place => ({
        name: place.name,
        address: place.address,
        location: {
          lat: place.location.lat,
          lng: place.location.lng,
          coordinates: `${place.location.lat},${place.location.lng}`
        },
        rating: place.rating,
        priceLevel: GooglePlacesClient.formatPriceLevel(place.priceLevel),
        placeId: place.placeId,
        types: place.types
      }));

      const latency = Date.now() - startTime;

      // NO RESULTS: Return clear message (DON'T substitute with different venues!)
      if (venues.length === 0) {
        return this.success(
          {
            venues: [],
            count: 0,
            query,
            location,
            searchType,
            message: near_coordinates
              ? `No "${query}" found within 5 miles or in ${location}. The specific venue/chain may not exist in this area.`
              : `No venues found for "${query}" in ${location}. Try a different search term.`
          },
          {
            apiCalls: near_coordinates ? 3 : 1, // 3 tiers attempted
            latency,
            source: 'google_places'
          }
        );
      }

      // SUCCESS: Return results with metadata
      return this.success(
        {
          venues,
          count: venues.length,
          query,
          location,
          searchType,
          radiusUsed: radiusUsed ? `${(radiusUsed / 1609.34).toFixed(1)} miles` : 'city-wide',
          radiusExpanded,
          message: near_coordinates 
            ? radiusUsed
              ? `Found ${venues.length} venues within ${(radiusUsed / 1609.34).toFixed(1)} miles${radiusExpanded ? ' (expanded from 1 mile)' : ''}`
              : `Found ${venues.length} venues in city-wide search (expanded from coordinate search)`
            : `Found ${venues.length} venues in ${location}`
        },
        {
          apiCalls: near_coordinates ? (radiusExpanded ? (searchType === 'city-wide' ? 3 : 2) : 1) : 1,
          latency,
          source: 'google_places'
        }
      );

    } catch (error) {
      console.error('❌ [VenueSearchTool] Error:', error);
      
      return this.error(
        error instanceof Error ? error.message : 'Unknown error during venue search'
      );
    }
  }

  /**
   * Get progressive radii for 3-tier search
   * Tier 1: 1 mile (or requested radius)
   * Tier 2: 5 miles
   * Tier 3: City-wide (no radius)
   */
  private getProgressiveRadii(requestedRadius: number): number[] {
    const oneMile = 1609; // meters
    const fiveMiles = 8047; // meters
    
    // If requested radius is already >= 5 miles, just use it and then city-wide
    if (requestedRadius >= fiveMiles) {
      return [requestedRadius];
    }
    
    // Otherwise: tier 1 (1 mile or requested) → tier 2 (5 miles)
    return [
      Math.min(requestedRadius, oneMile),
      fiveMiles
    ];
  }

  /**
   * Parse coordinates from string "lat,lng"
   */
  private parseCoordinates(coords: string): { lat: number; lng: number } | null {
    try {
      const parts = coords.split(',').map(s => s.trim());
      if (parts.length !== 2) return null;
      
      const lat = parseFloat(parts[0]);
      const lng = parseFloat(parts[1]);
      
      if (isNaN(lat) || isNaN(lng)) return null;
      if (lat < -90 || lat > 90) return null;
      if (lng < -180 || lng > 180) return null;
      
      return { lat, lng };
    } catch {
      return null;
    }
  }

  /**
   * Parse radius string to meters
   */
  private parseRadius(radius: string | undefined): number {
    if (!radius) return 1609; // Default 1 mile

    const match = radius.match(/^(\d+(?:\.\d+)?)\s*(miles?|mi|kilometers?|km|m)?$/i);
    
    if (!match) return 1609;

    const value = parseFloat(match[1]);
    const unit = match[2]?.toLowerCase() || 'miles';

    if (unit.startsWith('mi')) {
      return Math.round(value * 1609.34); // Miles to meters
    } else if (unit.startsWith('km')) {
      return Math.round(value * 1000); // Km to meters
    } else {
      return Math.round(value); // Already in meters
    }
  }
}

// // Export singleton instance
// let googlePlacesClient: GooglePlacesClient | null = null;

// export function getGooglePlacesClient(): GooglePlacesClient {
//   if (!googlePlacesClient) {
//     const apiKey = process.env.GOOGLE_PLACES_API_KEY;
//     if (!apiKey) {
//       throw new Error('GOOGLE_PLACES_API_KEY not found in environment variables');
//     }
//     googlePlacesClient = new GooglePlacesClient(apiKey);
//   }
//   return googlePlacesClient;
// }