// backend/services/video-enrichment-agent.ts
// Video enrichment agent — attaches YouTube videos (including Shorts) to venues.
import { getYouTubeClient } from './api-clients/youtube';

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

export function getStats(enrichedVenues: any[]) {
	const totalVenues = enrichedVenues?.length || 0;
	const venuesWithVideos = (enrichedVenues || []).filter(v => Array.isArray(v.videos) && v.videos.length > 0).length;
	const totalVideos = (enrichedVenues || []).reduce((acc, v) => acc + (Array.isArray(v.videos) ? v.videos.length : 0), 0);
	const avgVideosPerVenue = totalVenues > 0 ? Math.round((totalVideos / totalVenues) * 100) / 100 : 0;
	return {
		totalVenues,
		venuesWithVideos,
		totalVideos,
		avgVideosPerVenue,
	};
}

export const VideoEnrichmentAgent = {
	enrichVenues,
	getStats,
};

export function getVideoEnrichmentAgent() {
	return VideoEnrichmentAgent;
}