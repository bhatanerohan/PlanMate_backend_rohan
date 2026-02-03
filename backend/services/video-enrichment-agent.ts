// backend/services/video-enrichment-agent.ts
// Video enrichment agent — attaches YouTube videos and Instagram Reels to venues.
import { getYouTubeClient } from './api-clients/youtube.js';
import { getInstagramClient, InstagramReel } from './api-clients/instagram.js';

export async function enrichVenues(venues: any[], mode: 'discovery' | 'route', _options: any = {}): Promise<any[]> {
	console.log('🔍 Video enrichment: attaching YouTube videos to venues');
	try {
		const client = getYouTubeClient();
		const maxVideosPerVenue = _options.maxVideosPerVenue || 3;

		const enrichedPromises = venues.map(async (venue: any) => {
			try {
				const venueName = venue.name || venue.venueName || '';
				const location = venue.location?.city || venue.location?.address || '';
				const venueType = venue.category || '';

				const videos = await client.searchVenueVideos({
					venueName,
					location,
					maxResults: maxVideosPerVenue,
					venueType
				});

				if (videos && videos.length > 0) {
					venue.videos = videos;
				}
			} catch (innerErr) {
				// Don't fail whole enrichment if one venue fails
				console.error('⚠️ Video enrichment for venue failed:', innerErr);
			}
			return venue;
		});

		const enriched = await Promise.all(enrichedPromises);
		return enriched;
	} catch (err) {
		console.error('⚠️ Video enrichment agent error:', err);
		return venues;
	}
}

/**
 * Enrich venues with Instagram Reels (1 reel per venue by default)
 */
export async function enrichWithInstagramReels(
	venues: any[],
	options: { maxReelsPerVenue?: number; includeLocation?: boolean } = {}
): Promise<any[]> {
	const { maxReelsPerVenue = 3, includeLocation = true } = options;

	// Filter out user-location venues
	const actualVenues = venues.filter(v => v.placeId !== 'user-location');

	if (actualVenues.length === 0) {
		console.log('📸 No venues to enrich with Instagram Reels');
		return venues;
	}

	console.log(`📸 Instagram enrichment: fetching reels for ${actualVenues.length} venues`);

	try {
		const client = getInstagramClient();

		// Build search queries from venue names + location
		const queries = actualVenues.map(venue => {
			const venueName = venue.name || '';
			// Clean venue name - remove ALL special chars and spaces for hashtag searches
			const cleanName = venueName
				.toLowerCase()
				.replace(/[^a-z0-9]/g, '');

			if (includeLocation) {
				// Extract city from address (e.g., "123 Main St, Boston, MA 02101" -> "Boston")
				const addressParts = (venue.address || '').split(',').map((p: string) => p.trim());
				let city = addressParts.length >= 2 ? addressParts[addressParts.length - 2] : '';
				// Remove zip codes, state abbreviations, and ALL non-alphanumeric chars
				city = city
					.toLowerCase()
					.replace(/\d{5}(-\d{4})?/g, '')
					.replace(/\b[a-z]{2}\b/gi, '')
					.replace(/[^a-z0-9]/g, '')
					.trim();
				// Join without spaces (hashtags can't have spaces)
				return city ? `${cleanName}${city}` : cleanName;
			}
			return cleanName;
		});

		// Batch search all venues at once
		const resultsMap = await client.batchSearchReels({
			queries,
			maxResultsPerQuery: maxReelsPerVenue
		});

		// Attach reels to each venue
		actualVenues.forEach((venue, index) => {
			const query = queries[index];
			const reels = resultsMap.get(query) || [];
			venue.instagramReels = reels;

			if (reels.length > 0) {
				console.log(`   📸 [${venue.name}] Found ${reels.length} reel(s):`);
				reels.forEach((r: any) => console.log(`      🔗 ${r.videoUrl}`));
			}
		});

		const venuesWithReels = actualVenues.filter(v => v.instagramReels?.length > 0).length;
		console.log(`✅ Instagram enrichment complete: ${venuesWithReels}/${actualVenues.length} venues have reels`);

		return venues;
	} catch (err) {
		console.error('⚠️ Instagram enrichment error:', err);
		// Return venues unchanged on error
		return venues;
	}
}

export function getStats(enrichedVenues: any[]) {
	const totalVenues = enrichedVenues?.length || 0;
	const venuesWithVideos = (enrichedVenues || []).filter(v => Array.isArray(v.videos) && v.videos.length > 0).length;
	const totalVideos = (enrichedVenues || []).reduce((acc, v) => acc + (Array.isArray(v.videos) ? v.videos.length : 0), 0);
	const avgVideosPerVenue = totalVenues > 0 ? Math.round((totalVideos / totalVenues) * 100) / 100 : 0;

	// Add Instagram stats
	const venuesWithReels = (enrichedVenues || []).filter(v => Array.isArray(v.instagramReels) && v.instagramReels.length > 0).length;
	const totalReels = (enrichedVenues || []).reduce((acc, v) => acc + (Array.isArray(v.instagramReels) ? v.instagramReels.length : 0), 0);

	return {
		totalVenues,
		venuesWithVideos,
		totalVideos,
		avgVideosPerVenue,
		venuesWithReels,
		totalReels,
	};
}

export const VideoEnrichmentAgent = {
	enrichVenues,
	enrichWithInstagramReels,
	getStats,
};

export function getVideoEnrichmentAgent() {
	return VideoEnrichmentAgent;
}
