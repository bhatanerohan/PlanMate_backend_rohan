// backend/services/api-clients/youtube.ts
// YouTube client implementation — fetches videos (including Shorts) via YouTube Data API v3.
import axios from 'axios';

export interface YouTubeVideo {
	videoId: string;
	title: string;
	description?: string;
	thumbnailUrl?: string | null;
	thumbnailHigh?: string | null;
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
		async searchVenueVideos(params: VideoSearchParams): Promise<YouTubeVideo[]> {
			const apiKey = process.env.YOUTUBE_API_KEY;
			if (!apiKey) {
				console.log('⏭️ YOUTUBE_API_KEY not set — returning empty video list');
				return [];
			}

			const qParts: string[] = [];
			if (params.venueName) qParts.push(params.venueName);
			if (params.venueType) qParts.push(params.venueType);
			if (params.location) qParts.push(params.location);
			const q = qParts.join(' ').trim();
			const max = params.maxResults || 3;

			try {
				// First, try to fetch Shorts specifically (videoDuration=short)
				const searchResp = await axios.get('https://www.googleapis.com/youtube/v3/search', {
					params: {
						key: apiKey,
						part: 'snippet',
						q,
						type: 'video',
						maxResults: Math.min(max, 50),
						videoDuration: 'short'
					}
				});

				let items = searchResp.data?.items || [];
				let videoIds = items.map((it: any) => it.id?.videoId).filter(Boolean);

				// If not enough shorts found, fetch additional videos (no duration filter) to fill up to `max`.
				if (videoIds.length < max) {
					const moreResp = await axios.get('https://www.googleapis.com/youtube/v3/search', {
						params: {
							key: apiKey,
							part: 'snippet',
							q,
							type: 'video',
							maxResults: Math.min(max * 2, 50)
						}
					});
					const moreItems = moreResp.data?.items || [];
					const moreIds = moreItems.map((it: any) => it.id?.videoId).filter(Boolean);
					videoIds = Array.from(new Set([...videoIds, ...moreIds])).slice(0, max);
				} else {
					videoIds = videoIds.slice(0, max);
				}

				if (videoIds.length === 0) return [];

				// Fetch details for selected video IDs
				const vidsResp = await axios.get('https://www.googleapis.com/youtube/v3/videos', {
					params: {
						key: apiKey,
						part: 'snippet,contentDetails,statistics',
						id: videoIds.join(',')
					}
				});

				const vids = vidsResp.data?.items || [];
				const results: YouTubeVideo[] = [];
				for (const v of vids) {
					const snippet = v.snippet || {};
					const thumbnails = snippet.thumbnails || {};
					results.push({
						videoId: v.id,
						title: snippet.title,
						description: snippet.description,
						thumbnailUrl: (thumbnails.medium && thumbnails.medium.url) || (thumbnails.default && thumbnails.default.url) || null,
						thumbnailHigh: (thumbnails.high && thumbnails.high.url) || null,
						channelTitle: snippet.channelTitle,
						publishedAt: snippet.publishedAt,
						duration: v.contentDetails?.duration,
						viewCount: v.statistics?.viewCount,
						likeCount: v.statistics?.likeCount
					});
				}

				return results;
			} catch (error) {
				console.error('⚠️ YouTube client error:', error);
				return [];
			}
		}
	};
}