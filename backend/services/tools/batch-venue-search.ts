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
            description: 'JSON array of search requests. Each request has: query (required), location (required), limit (optional). Example: [{"query":"Starbucks","location":"Newbury Street, Boston","limit":5},{"query":"Harvard","location":"Cambridge","limit":3}]'
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
      let searches: Array<{ query: string; location: string; limit?: number }>;
      
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
          
          const places = await placesClient.textSearch({
            query: search.query,
            location: search.location,
            maxResults: search.limit || 10
          });

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
            photoUrl: place.photoUrl,         // ← FIX: Include photoUrl!
            description: place.description,   // ← FIX: Include description!
            photos: place.photos              // ← FIX: Include photos array!
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
}