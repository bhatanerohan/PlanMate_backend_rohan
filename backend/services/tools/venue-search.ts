// backend/services/tools/venue-search.ts

import { Tool } from './base-tool.js';
import type { ToolName, ToolDefinition, ToolResult, ToolExecutionContext } from '../../types/tools.js';
import { getGooglePlacesClient, GooglePlacesClient } from '../api-clients/google-places.js';

/**
 * Venue Search Tool
 * Searches for venues using Google Places API
 * Supports both broad city search and coordinate-based radius search
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

      let places;
      
      // GEOGRAPHIC OPTIMIZATION: Use coordinates if provided
      if (near_coordinates) {
        // Parse coordinates
        const coords = this.parseCoordinates(near_coordinates as string);
        if (!coords) {
          return this.error('Invalid coordinates format. Use "latitude,longitude" (e.g., "42.365,-71.054")');
        }

        const radiusMeters = this.parseRadius(radius as string | undefined);
        
        console.log(`🔍 [VenueSearchTool] Geographic search: "${query}" near (${coords.lat}, ${coords.lng}) within ${radiusMeters}m`);

        // Use nearby search with coordinates
        places = await placesClient.nearbySearch(coords.lat, coords.lng, {
          query,
          radius: radiusMeters,
          maxResults: parseInt(limit as string) || 10
        });

      } else {
        // Broad city search (first search)
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
          coordinates: `${place.location.lat},${place.location.lng}`  // Easy format for next search
        },
        rating: place.rating,
        priceLevel: GooglePlacesClient.formatPriceLevel(place.priceLevel),
        placeId: place.placeId,
        types: place.types
      }));

      const latency = Date.now() - startTime;

      if (venues.length === 0) {
        return this.success(
          {
            venues: [],
            count: 0,
            query,
            location,
            message: 'No venues found in this area. Try a broader search or different query.'
          },
          {
            apiCalls: 1,
            latency,
            source: 'google_places'
          }
        );
      }

      return this.success(
        {
          venues,
          count: venues.length,
          query,
          location,
          searchType: near_coordinates ? 'coordinate-based' : 'broad',
          message: near_coordinates 
            ? `Found ${venues.length} venues near coordinates` 
            : `Found ${venues.length} venues in ${location}`
        },
        {
          apiCalls: 1,
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
   * Get progressive radii to try (in meters)
   * Starts small, expands if no results
   * Maximum: 3.5 miles
   */
  private getProgressiveRadii(requestedRadius: number): number[] {
    // Convert to miles for easier logic
    const requestedMiles = requestedRadius / 1609.34;
    
    if (requestedMiles <= 0.5) {
      // Requested small radius, try: 0.5 → 1.0 → 2.0 → 3.5 miles
      return [
        Math.round(0.5 * 1609.34),  // 805m
        Math.round(1.0 * 1609.34),  // 1609m
        Math.round(2.0 * 1609.34),  // 3219m
        Math.round(3.5 * 1609.34)   // 5633m
      ];
    } else if (requestedMiles <= 1.0) {
      // Requested medium radius, try: 1.0 → 2.0 → 3.5 miles
      return [
        Math.round(1.0 * 1609.34),
        Math.round(2.0 * 1609.34),
        Math.round(3.5 * 1609.34)
      ];
    } else {
      // Requested large radius, try: as-is → 3.5 miles
      return [
        requestedRadius,
        Math.round(3.5 * 1609.34)
      ];
    }
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
    if (!radius) return 800; // Default 0.5 miles = 800m

    const match = radius.match(/^(\d+(?:\.\d+)?)\s*(miles?|mi|kilometers?|km|m)?$/i);
    
    if (!match) return 800;

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