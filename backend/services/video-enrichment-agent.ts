// backend/services/video-enrichment-agent.ts

import { getYouTubeClient, YouTubeVideo } from './api-clients/youtube.js';

/**
 * Agent 3: Video Enrichment Agent
 * 
 * Post-processing agent that enriches venue data with YouTube Shorts
 * - Fetches videos for each venue in parallel
 * - Adds videos array to venue objects
 * - Gracefully handles failures (returns venues even if videos fail)
 */

export interface EnrichmentOptions {
  maxVideosPerVenue?: number;
  skipRouteMode?: boolean;
  skipUserLocation?: boolean;
}

export interface EnrichedVenue {
  [key: string]: any; // All original venue properties
  videos?: YouTubeVideo[]; // Added by this agent
}

export class VideoEnrichmentAgent {
  /**
   * Enrich venues with YouTube videos
   */
  async enrichVenues(
    venues: any[], 
    mode: 'discovery' | 'route',
    options: EnrichmentOptions = {}
  ): Promise<EnrichedVenue[]> {
    const {
      maxVideosPerVenue = 3,
      skipRouteMode = true, // By default, don't add videos in route mode
      skipUserLocation = true,
    } = options;

    console.log('\n🎬 Agent 3: Video Enrichment Agent starting...');
    console.log(`   Mode: ${mode}`);
    console.log(`   Venues to enrich: ${venues.length}`);
    console.log(`   Max videos per venue: ${maxVideosPerVenue}`);

    // Early exit: Skip if route mode and option is enabled
    if (mode === 'route' && skipRouteMode) {
      console.log('   ⏭️  Skipping video enrichment (route mode)');
      return venues;
    }

    // Early exit: No venues to enrich
    if (venues.length === 0) {
      console.log('   ⚠️  No venues to enrich');
      return venues;
    }

    const startTime = Date.now();

    try {
      const youtubeClient = getYouTubeClient();

      // Fetch videos for all venues in parallel
      const enrichmentPromises = venues.map(async (venue) => {
        // Skip user location
        if (skipUserLocation && venue.placeId === 'user-location') {
          return venue;
        }

        // Skip if venue has no name or location info
        if (!venue.name) {
          console.warn(`   ⚠️  Venue missing name, skipping: ${venue.placeId}`);
          return venue;
        }

        try {
          // Search for videos
          const videos = await youtubeClient.searchVenueVideos({
            venueName: venue.name,
            location: this.extractLocationFromAddress(venue.address),
            maxResults: maxVideosPerVenue,
          });

          // Add videos to venue object
          return {
            ...venue,
            videos: videos.length > 0 ? videos : undefined,
          };

        } catch (error) {
          console.error(`   ❌ Failed to fetch videos for "${venue.name}":`, error);
          // Return venue without videos on error
          return venue;
        }
      });

      // Wait for all enrichment to complete
      const enrichedVenues = await Promise.all(enrichmentPromises);

      const executionTime = Date.now() - startTime;
      const venuesWithVideos = enrichedVenues.filter(v => v.videos && v.videos.length > 0).length;
      const totalVideos = enrichedVenues.reduce((sum, v) => sum + (v.videos?.length || 0), 0);

      console.log(`\n✅ Agent 3 completed in ${executionTime}ms`);
      console.log(`   Enriched: ${venuesWithVideos}/${venues.length} venues`);
      console.log(`   Total videos: ${totalVideos}`);

      return enrichedVenues;

    } catch (error) {
      console.error('❌ Agent 3 fatal error:', error);
      
      // Graceful degradation: Return original venues if enrichment fails
      console.log('   ⚠️  Returning venues without video enrichment');
      return venues;
    }
  }

  /**
   * Extract city/location from address string
   * Example: "123 Main St, Boston, MA" -> "Boston"
   */
  private extractLocationFromAddress(address?: string): string | undefined {
    if (!address) return undefined;

    // Try to extract city name (usually after first comma)
    const parts = address.split(',');
    if (parts.length >= 2) {
      return parts[1].trim(); // Usually the city
    }

    return undefined;
  }

  /**
   * Get enrichment statistics for monitoring
   */
  getStats(enrichedVenues: EnrichedVenue[]) {
    const venuesWithVideos = enrichedVenues.filter(v => v.videos && v.videos.length > 0).length;
    const totalVideos = enrichedVenues.reduce((sum, v) => sum + (v.videos?.length || 0), 0);
    const avgVideosPerVenue = venuesWithVideos > 0 ? totalVideos / venuesWithVideos : 0;

    return {
      totalVenues: enrichedVenues.length,
      venuesWithVideos,
      totalVideos,
      avgVideosPerVenue: avgVideosPerVenue.toFixed(2),
      enrichmentRate: `${((venuesWithVideos / enrichedVenues.length) * 100).toFixed(1)}%`,
    };
  }
}

// Export singleton instance
export const videoEnrichmentAgent = new VideoEnrichmentAgent();