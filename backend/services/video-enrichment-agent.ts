// backend/services/video-enrichment-agent.ts
// NOTE: Video enrichment agent disabled — no YouTube requests will be made.

export async function enrichVenues(venues: any[], mode: 'discovery' | 'route', _options: any = {}): Promise<any[]> {
	console.log('⏭️ Video enrichment disabled — returning original venues');
	return venues;
}

export function getStats(_enrichedVenues: any[]) {
	return {
		totalVenues: _enrichedVenues?.length || 0,
		venuesWithVideos: 0,
		totalVideos: 0,
		avgVideosPerVenue: 0,
	};
}

export const VideoEnrichmentAgent = {
	enrichVenues,
	getStats,
};

export function getVideoEnrichmentAgent() {
	return VideoEnrichmentAgent;
}