// backend/services/api-clients/youtube.ts

import axios from 'axios';
import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

/**
 * YouTube Data API v3 Client - BALANCED LLM VERSION
 * Smart filtering without being overly strict
 * Finds tour/review/experience videos while filtering obvious bad content
 */

export interface YouTubeVideo {
  videoId: string;
  title: string;
  description: string;
  thumbnailUrl: string;
  thumbnailHigh?: string;
  channelTitle: string;
  publishedAt: string;
  duration: string;
  viewCount?: string;
  likeCount?: string;
}

export interface VideoSearchParams {
  venueName: string;
  location?: string;
  maxResults?: number;
}

export class YouTubeClient {
  private apiKey: string;
  private baseUrl = 'https://www.googleapis.com/youtube/v3';

  constructor(apiKey: string) {
    if (!apiKey) {
      throw new Error('YouTube API key is required');
    }
    this.apiKey = apiKey;
  }

  /**
   * Search for venue videos with BALANCED LLM filtering
   */
  async searchVenueVideos(params: VideoSearchParams): Promise<YouTubeVideo[]> {
    try {
      const { venueName, location, maxResults = 3 } = params;

      // Build smart search query (not too restrictive)
      const searchQuery = this.buildBalancedQuery(venueName, location);
      console.log(`🎥 [YouTube] Searching: "${searchQuery}"`);

      // Search YouTube
      const searchResponse = await axios.get(`${this.baseUrl}/search`, {
        params: {
          part: 'snippet',
          q: searchQuery,
          type: 'video',
          videoDuration: 'short',
          maxResults: 20,
          order: 'relevance',
          relevanceLanguage: 'en',
          key: this.apiKey,
        }
      });

      if (!searchResponse.data.items || searchResponse.data.items.length === 0) {
        console.log(`   ⚠️  No videos found`);
        return [];
      }

      const videoIds = searchResponse.data.items
        .map((item: any) => item.id.videoId)
        .filter(Boolean);

      if (videoIds.length === 0) return [];

      // Get video details
      const detailsResponse = await axios.get(`${this.baseUrl}/videos`, {
        params: {
          part: 'snippet,contentDetails,statistics',
          id: videoIds.join(','),
          key: this.apiKey,
        }
      });

      if (!detailsResponse.data.items) return [];

      // Light filtering (just remove obvious bad ones)
      const candidates = detailsResponse.data.items
        .map((video: any) => this.formatVideo(video))
        .filter((video: YouTubeVideo) => {
          const durationSeconds = this.parseDuration(video.duration);
          // Keep videos between 10-90 seconds
          if (durationSeconds < 10 || durationSeconds > 90) return false;
          
          // Remove very low quality
          const views = parseInt(video.viewCount || '0', 10);
          if (views < 20) return false;
          
          return true;
        });

      console.log(`   📊 Light filtering: ${candidates.length}/${detailsResponse.data.items.length} candidates`);

      if (candidates.length === 0) {
        console.log(`   ⚠️  No videos passed basic filtering`);
        return [];
      }

      // If we have very few candidates, just return them
      if (candidates.length <= maxResults) {
        console.log(`   ⏭️  Only ${candidates.length} candidates, skipping LLM`);
        return candidates;
      }

      // LLM smart selection
      console.log(`   🧠 LLM selecting best ${maxResults} from ${candidates.length} videos...`);
      const selected = await this.balancedLLMFilter(candidates, venueName, location, maxResults);

      console.log(`   ✅ Final: ${selected.length} quality videos`);
      return selected;

    } catch (error) {
      if (axios.isAxiosError(error)) {
        console.error(`❌ [YouTube] API error: ${error.response?.status || error.message}`);
      } else {
        console.error('❌ [YouTube] Error:', error);
      }
      return [];
    }
  }

  /**
   * BALANCED LLM filtering - Smart but not overly strict
   */
  private async balancedLLMFilter(
    candidates: YouTubeVideo[],
    venueName: string,
    location?: string,
    maxResults: number = 3
  ): Promise<YouTubeVideo[]> {
    try {
      const videosList = candidates
        .map((video, index) => {
          const shortDesc = video.description.substring(0, 200).replace(/\n/g, ' ');
          return `${index + 1}. "${video.title}"
   Channel: ${video.channelTitle} | Views: ${video.viewCount || 'N/A'}
   Description: ${shortDesc}...`;
        })
        .join('\n\n');

      const response = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        temperature: 0,
        messages: [
          {
            role: 'system',
            content: `You are a smart video curator for a travel/location app. Select the ${maxResults} BEST YouTube Shorts showing people visiting, touring, or experiencing this location.

LOCATION: ${venueName}${location ? ` in ${location}` : ''}

=== PRIORITIZE THESE (High Priority ✅) ===
- Walking tours, campus tours, venue tours
- "I visited [venue]" or "Visiting [venue]"
- Food/restaurant reviews where they visit and eat
- "Inside [venue]" or "Exploring [venue]"
- First-person experiences AT the location
- Travel vlogs showing the actual place
- "What it's like at [venue]"

=== AVOID THESE (Reject ❌) ===

FOR SCHOOLS/UNIVERSITIES - Reject:
- Admissions advice ("How to get into", "Acceptance tips")
- Application guidance ("Requirements", "Essay tips")
- "Should you apply" or "Is it worth it" (about admissions)
- Content for prospective students about applying

FOR RESTAURANTS/VENUES - Reject:
- Official brand promotions (corporate channels)
- Product announcements ("New menu items")
- Cooking tutorials or recipes
- Generic city compilations ("Top 10 restaurants")

FOR ALL VENUES - Reject:
- History documentaries or educational content
- News reports
- "Facts about" or "Things to know about"
- Content that mentions the venue but isn't about visiting it

=== DECISION GUIDELINES ===

**Accept if:**
- Someone clearly visits/tours the physical location
- Shows what a tourist/customer would experience
- First-person POV or vlog style

**Reject if:**
- About admissions/applications (for schools)
- Corporate/brand content
- Educational/documentary style
- Generic compilation not specific to this venue
- Mentions venue but focuses on something else

**When borderline:**
- If it shows the location → ACCEPT
- If it's useful for someone wanting to visit → ACCEPT
- Prefer tour/review/vlog over everything else

=== OUTPUT ===
Return valid JSON with selected video numbers (1-based):
{
  "selected": [2, 5, 8]
}

If fewer than ${maxResults} videos meet criteria, return fewer.
If NO videos are good enough, return empty array:
{
  "selected": []
}`
          },
          {
            role: 'user',
            content: `Select the ${maxResults} best videos about visiting/touring "${venueName}"${location ? ` in ${location}` : ''}:

${videosList}

Pick videos that show the actual location experience. Avoid admissions/corporate/generic content.`
          }
        ],
        response_format: { type: 'json_object' }
      });

      const content = response.choices[0]?.message?.content;
      if (!content) {
        console.log(`   ⚠️  No LLM response, using top ${maxResults} by views`);
        return this.fallbackSelection(candidates, maxResults);
      }

      const result = JSON.parse(content);
      const selectedIndices: number[] = result.selected || [];

      if (selectedIndices.length === 0) {
        console.log(`   ⚠️  LLM found no suitable videos, using fallback`);
        return this.fallbackSelection(candidates, maxResults);
      }

      const selectedVideos = selectedIndices
        .map(idx => candidates[idx - 1])
        .filter(Boolean)
        .slice(0, maxResults);

      console.log(`   🏆 LLM selected ${selectedVideos.length} videos:`);
      selectedVideos.forEach((video, i) => {
        console.log(`      ${i + 1}. ${video.title.substring(0, 60)}...`);
        console.log(`         ${video.channelTitle} | ${video.viewCount} views`);
      });

      return selectedVideos;

    } catch (error) {
      console.error('   ⚠️  LLM filtering failed:', error);
      return this.fallbackSelection(candidates, maxResults);
    }
  }

  /**
   * Fallback: Return top videos by view count
   */
  private fallbackSelection(candidates: YouTubeVideo[], maxResults: number): YouTubeVideo[] {
    console.log(`   ⏭️  Fallback: Selecting top ${maxResults} by views`);
    return candidates
      .sort((a, b) => parseInt(b.viewCount || '0') - parseInt(a.viewCount || '0'))
      .slice(0, maxResults);
  }

  /**
   * Build balanced search query
   */
  private buildBalancedQuery(venueName: string, location?: string): string {
    let query = venueName;

    if (location) {
      query += ` ${location}`;
    }

    // Add positive keywords
    query += ' tour OR vlog OR visit OR review OR experience';

    // Only exclude the most obvious bad content
    // Removed most negative keywords to be less restrictive
    if (this.isEducationalInstitution(venueName)) {
      // For schools, exclude admissions content
      query += ' -admission -admissions -"how to get" -applying';
    }

    return query;
  }

  /**
   * Check if venue is an educational institution
   */
  private isEducationalInstitution(venueName: string): boolean {
    const lower = venueName.toLowerCase();
    const eduKeywords = ['university', 'college', 'school', 'institute', 'academy', 'mit', 'harvard', 'yale', 'stanford'];
    return eduKeywords.some(keyword => lower.includes(keyword));
  }

  /**
   * Detect brand channels
   */
  private isBrandChannel(channelTitle: string, venueName: string): boolean {
    const channelLower = channelTitle.toLowerCase();
    const venueLower = venueName.toLowerCase();

    if (channelLower === venueLower) return true;
    
    const brandKeywords = ['official', 'corporate', 'hq'];
    return brandKeywords.some(keyword => channelLower.includes(keyword));
  }

  /**
   * Format video data
   */
  private formatVideo(video: any): YouTubeVideo {
    return {
      videoId: video.id,
      title: video.snippet.title,
      description: video.snippet.description,
      thumbnailUrl: video.snippet.thumbnails.medium?.url || video.snippet.thumbnails.default?.url,
      thumbnailHigh: video.snippet.thumbnails.high?.url,
      channelTitle: video.snippet.channelTitle,
      publishedAt: video.snippet.publishedAt,
      duration: video.contentDetails.duration,
      viewCount: video.statistics?.viewCount,
      likeCount: video.statistics?.likeCount,
    };
  }

  /**
   * Parse ISO 8601 duration to seconds
   */
  private parseDuration(isoDuration: string): number {
    const match = isoDuration.match(/PT(?:(\d+)M)?(?:(\d+)S)?/);
    if (!match) return 0;
    
    const minutes = parseInt(match[1] || '0', 10);
    const seconds = parseInt(match[2] || '0', 10);
    
    return minutes * 60 + seconds;
  }

  /**
   * Format duration to human-readable string
   */
  static formatDuration(isoDuration: string): string {
    const match = isoDuration.match(/PT(?:(\d+)M)?(?:(\d+)S)?/);
    if (!match) return '0s';
    
    const minutes = parseInt(match[1] || '0', 10);
    const seconds = parseInt(match[2] || '0', 10);
    
    if (minutes > 0) {
      return `${minutes}:${seconds.toString().padStart(2, '0')}`;
    }
    return `${seconds}s`;
  }
}

// Export singleton instance
let youtubeClient: YouTubeClient | null = null;

export function getYouTubeClient(): YouTubeClient {
  if (!youtubeClient) {
    const apiKey = process.env.YOUTUBE_API_KEY;
    if (!apiKey) {
      throw new Error('YOUTUBE_API_KEY not found in environment variables');
    }
    youtubeClient = new YouTubeClient(apiKey);
  }
  return youtubeClient;
}