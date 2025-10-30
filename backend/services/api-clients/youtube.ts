// backend/services/api-clients/youtube.ts
// NOTE: YouTube client disabled — stub implementation returning no videos.

export interface YouTubeVideo {
	videoId: string;
	title: string;
	description?: string;
	thumbnailUrl?: string;
	channelTitle?: string;
	publishedAt?: string;
	duration?: string;
	viewCount?: string;
	likeCount?: string;
}

export interface VideoSearchParams {
	venueName: string;
	location?: string;
	maxResults?: number;
	venueType?: string;
	businessTypes?: string[];
}

export function getYouTubeClient() {
	return {
		async searchVenueVideos(_params: VideoSearchParams): Promise<YouTubeVideo[]> {
			console.log('⏭️ YouTube client disabled — returning empty video list');
			return [];
		}
	};
}