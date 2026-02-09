// backend/services/tools/batch-venue-search.ts

import { Tool } from './base-tool.js';
import type { ToolName, ToolDefinition, ToolResult, ToolExecutionContext } from '../../types/tools.js';
import { getGooglePlacesClient } from '../api-clients/google-places.js';

/**
 * Batch Venue Search Tool
 * Searches for multiple venues in parallel - major performance optimization
 * Reduces 4-6 sequential searches to 1 batch operation
 */
export class BatchVenueSearchTool extends Tool {
  name: ToolName = 'batch_search_venues';
  description = 'Search for multiple venues in parallel (faster than individual searches)';

  getDefinition(): ToolDefinition {
    return {
      name: this.name,
      description: this.description,
      parameters: {
        type: 'object',
        properties: {
          searches: {
            type: 'string',
            description: 'JSON array of search requests. Each request has: query (required), location (required), limit (optional). Location can be city name OR coordinates "lat,lng". Example: [{"query":"Starbucks","location":"Newbury Street, Boston","limit":5},{"query":"Harvard","location":"42.365,-71.054","limit":3}]'
          }
        },
        required: ['searches']
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

    try {
      // Parse searches array
      let searches: Array<{ query: string; location: string; limit?: number; radius?: string | number }>;
      
      if (typeof parameters.searches === 'string') {
        try {
          searches = JSON.parse(parameters.searches);
        } catch {
          return this.error('Invalid searches format. Must be JSON array of search objects');
        }
      } else if (Array.isArray(parameters.searches)) {
        searches = parameters.searches;
      } else {
        return this.error('searches must be an array or JSON string');
      }

      // Validate searches array
      if (!Array.isArray(searches) || searches.length === 0) {
        return this.error('searches must be a non-empty array');
      }

      if (searches.length > 10) {
        return this.error('Maximum 10 searches per batch');
      }

      // Validate each search
      for (let i = 0; i < searches.length; i++) {
        const search = searches[i];
        if (!search.query || typeof search.query !== 'string') {
          return this.error(`Search ${i + 1}: query is required and must be a string`);
        }
        if (!search.location || typeof search.location !== 'string') {
          return this.error(`Search ${i + 1}: location is required and must be a string`);
        }
      }

      console.log(`🔍 [BatchVenueSearchTool] Executing ${searches.length} searches in parallel`);

      // Get Google Places client
      const placesClient = getGooglePlacesClient();

      // Execute all searches in parallel
      const searchPromises = searches.map(async (search, index) => {
        try {
          console.log(`   ${index + 1}. Searching "${search.query}" in "${search.location}"`);
          
          let places;
          
          // 🆕 Check if location is in coordinate format (lat,lng)
          const coordMatch = search.location.match(/^(-?\d+\.?\d*),\s*(-?\d+\.?\d*)$/);
          
          if (coordMatch) {
            // Location is coordinates - use nearbySearch
            const lat = parseFloat(coordMatch[1]);
            const lng = parseFloat(coordMatch[2]);
            const radiusMeters = this.parseRadius(search.radius);
            
            console.log(`   📍 Using nearbySearch at coordinates (${lat}, ${lng})`);
            
            places = await placesClient.nearbySearch(lat, lng, {
              query: search.query,
              radius: radiusMeters,  // Default to 5km if no radius provided
              maxResults: search.limit || 10
            });
          } else {
            // Location is city/area name - use textSearch  
            places = await placesClient.textSearch({
              query: search.query,
              location: search.location,
              maxResults: search.limit || 10
            });
          }

          // Format results - INCLUDE ALL FIELDS INCLUDING photoUrl!
          const venues = places.map(place => ({
            name: place.name,
            address: place.address,
            location: {
              lat: place.location.lat,
              lng: place.location.lng,
              coordinates: `${place.location.lat},${place.location.lng}`
            },
            rating: place.rating,
            priceLevel: this.formatPriceLevel(place.priceLevel),
            placeId: place.placeId,
            types: place.types,
            photoUrl: place.photoUrl,
            description: place.description,
            photos: place.photos
          }));

          return {
            success: true,
            query: search.query,
            location: search.location,
            venues,
            count: venues.length
          };

        } catch (error) {
          console.error(`   ❌ Search ${index + 1} failed:`, error);
          return {
            success: false,
            query: search.query,
            location: search.location,
            error: error instanceof Error ? error.message : 'Unknown error',
            venues: [],
            count: 0
          };
        }
      });

      // Wait for all searches to complete
      const results = await Promise.all(searchPromises);

      const latency = Date.now() - startTime;
      const successCount = results.filter(r => r.success).length;
      const totalVenues = results.reduce((sum, r) => sum + r.count, 0);

      console.log(`✅ Batch complete: ${successCount}/${searches.length} searches succeeded, ${totalVenues} total venues found in ${latency}ms`);

      return this.success(
        {
          results,
          totalSearches: searches.length,
          successfulSearches: successCount,
          totalVenues,
          message: `Completed ${successCount}/${searches.length} searches in parallel`
        },
        {
          apiCalls: searches.length,
          latency,
          source: 'google_places_batch'
        }
      );

    } catch (error) {
      console.error('❌ [BatchVenueSearchTool] Error:', error);
      
      return this.error(
        error instanceof Error ? error.message : 'Unknown error during batch venue search'
      );
    }
  }

  /**
   * Helper to format price level
   */
  private formatPriceLevel(level?: number): string {
    if (!level) return 'N/A';
    return '$'.repeat(level);
  }

  /**
   * Parse radius string/number to meters (default 5000m)
   */
  private parseRadius(radius?: string | number): number {
    if (radius === undefined || radius === null) return 5000;
    if (typeof radius === 'number' && Number.isFinite(radius)) return Math.round(radius);

    const raw = String(radius).trim();
    const match = raw.match(/^(\d+(?:\.\d+)?)\s*(miles?|mi|kilometers?|km|m)?$/i);
    if (!match) return 5000;

    const value = parseFloat(match[1]);
    const unit = (match[2] || 'm').toLowerCase();

    if (unit.startsWith('mi')) return Math.round(value * 1609.34);
    if (unit.startsWith('km')) return Math.round(value * 1000);
    return Math.round(value);
  }
}