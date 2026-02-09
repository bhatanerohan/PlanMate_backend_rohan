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
		// Build search queries — TWO sanitized hashtags per venue for better coverage:
		//   1. venue name only (e.g., "fatcatnightclub")
		//   2. venue name + city (e.g., "fatcatnightclublasvegas")
		const venueQueryMap = actualVenues.map(venue => {
			const venueName = venue.name || '';
			const cleanName = venueName.toLowerCase().replace(/[^a-z0-9]/g, '');
			const hashtags: string[] = [];

			// First hashtag: just the venue name
			if (includeLocation) {
				const addressParts = (venue.address || '').split(',').map((p: string) => p.trim());
				let city = '';
				if (addressParts.length >= 3) {
					city = addressParts[1];
				} else if (addressParts.length === 2) {
					city = addressParts[0];
				}
				city = city.toLowerCase().replace(/[^a-z0-9]/g, '').trim();

				// Disabled city-based hashtag variants for cleaner results
				// if (city && cleanName.length > 2) {
				// 	hashtags.push(`${cleanName}${city}`);
				// }
				if (cleanName.length > 2) {
					hashtags.push(cleanName);
				}
			} else if (cleanName.length > 2) {
				hashtags.push(cleanName); // fallback if location disabled
			}

			console.log(`   🏷️ [${venueName}] hashtags: ${JSON.stringify(hashtags)}`);
			return { venueName, hashtags };
		});

		// Flatten + deduplicate all hashtags for one batch call
		const queries = [...new Set(venueQueryMap.flatMap(v => v.hashtags))];
		console.log(`📸 All hashtags for batch search: ${JSON.stringify(queries)}`);

		// Batch search all venues at once
		const resultsMap = await client.batchSearchReels({
			queries,
			maxResultsPerQuery: maxReelsPerVenue
		});

		console.log(`📸 Results map keys: ${JSON.stringify([...resultsMap.keys()])}`);

		// Attach reels to each venue — merge results from all their hashtag variants
		actualVenues.forEach((venue, index) => {
			const { hashtags } = venueQueryMap[index];
			const allReels: any[] = [];
			const seenIds = new Set<string>();

			for (const tag of hashtags) {
				const reels = resultsMap.get(tag) || [];
				for (const reel of reels) {
					const reelId = reel.id || reel.shortCode;
					if (!seenIds.has(reelId)) {
						seenIds.add(reelId);
						allReels.push(reel);
					}
				}
			}

			venue.instagramReels = allReels.slice(0, maxReelsPerVenue);

			if (venue.instagramReels.length > 0) {
				console.log(`   📸 [${venue.name}] Found ${venue.instagramReels.length} reel(s):`);
				venue.instagramReels.forEach((r: any) => console.log(`      🔗 ${r.videoUrl}`));
			} else {
				console.log(`   ⚪ [${venue.name}] No reels found (searched: ${hashtags.join(', ')})`);
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
