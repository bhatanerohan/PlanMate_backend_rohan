// frontend/src/services/api.ts

import axios from 'axios';
import type { AuthUser, GeoPreferenceMode, PlanResponse, Venue, SharedTripPayload } from '../types';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

const apiClient = axios.create({
    baseURL: API_BASE_URL,
    timeout: 300000, // 5 minutes
    withCredentials: true,
    headers: {
        'Content-Type': 'application/json',
    },
});

// Request interceptor
apiClient.interceptors.request.use(
    (config) => {
        console.log(`🔵 API Request: ${config.method?.toUpperCase()} ${config.url}`);
        return config;
    },
    (error) => {
        console.error('🔴 API Request Error:', error);
        return Promise.reject(error);
    }
);

// Response interceptor
apiClient.interceptors.response.use(
    (response) => {
        console.log(`🟢 API Response: ${response.config.url}`, response.data);
        return response;
    },
    (error) => {
        console.error('🔴 API Response Error:', error.response?.data || error.message);
        return Promise.reject(error);
    }
);

// 🆕 Device type detection
function getDeviceType(): 'mobile' | 'desktop' {
    return window.innerWidth < 768 ? 'mobile' : 'desktop';
}

// 🆕 Session ID storage
let currentSessionId: string | null = null;

export function getSessionId(): string | null {
    return currentSessionId;
}

export function setSessionId(sessionId: string): void {
    currentSessionId = sessionId;
}

// 🆕 Current Itinerary Interface
interface CurrentItinerary {
    venues: Venue[];
    originalPrompt: string;
    mode: 'route' | 'discovery';
    userLocationIndex?: number;  // 🆕 Track user-location position
    hasUserLocation?: boolean;    // 🆕 Flag if includes user location
    alternativesMap?: Record<string, Venue[]>;
}

export const planApi = {
    async createPlan(
        prompt: string,
        userLocation?: { lat: number; lng: number; name: string },
        currentItinerary?: CurrentItinerary,  // 🆕 Optional itinerary for modifications
        geoPreference?: GeoPreferenceMode
    ): Promise<PlanResponse> {
        const response = await apiClient.post<PlanResponse>('/api/plan', {
            prompt,
            deviceType: getDeviceType(),  // 🆕 Send device type
            userLocation: userLocation ? {
                lat: userLocation.lat,
                lng: userLocation.lng,
                name: userLocation.name
            } : undefined,
            geoPreference,
            currentItinerary: currentItinerary ? {  // 🆕 Send itinerary if exists
                venues: currentItinerary.venues,
                originalPrompt: currentItinerary.originalPrompt,
                mode: currentItinerary.mode,
                // Include alternatives and user-location metadata so backend can preserve them
                alternativesMap: (currentItinerary as any).alternativesMap,
                userLocationIndex: (currentItinerary as any).userLocationIndex,
                hasUserLocation: (currentItinerary as any).hasUserLocation
            } : undefined
        });

        // 🆕 Store session_id from response
        if (response.data.session_id) {
            currentSessionId = response.data.session_id;
        }

        return response.data;
    },

    async fetchReels(venues: { placeId: string; name: string; address: string }[]): Promise<Record<string, any[]>> {
        try {
            const response = await apiClient.post<{ success: boolean; reelsMap: Record<string, any[]> }>('/api/reels', {
                venues
            });
            return response.data.reelsMap || {};
        } catch (error) {
            console.warn('📸 Failed to fetch reels:', error);
            return {};
        }
    },

    async pollReelsStatus(sessionId: string): Promise<{ status: 'pending' | 'ready' | 'failed' | 'not_found'; reelsMap?: Record<string, any[]> }> {
        try {
            const response = await apiClient.get<{ success: boolean; status: string; reelsMap?: Record<string, any[]> }>(`/api/reels-status/${sessionId}`);
            return {
                status: response.data.status as any,
                reelsMap: response.data.reelsMap
            };
        } catch (error) {
            console.warn('📸 Failed to poll reels status:', error);
            return { status: 'failed' };
        }
    },

    async venueChat(
        venue: Venue,
        question: string,
        history: { role: string; text: string }[]
    ): Promise<{
        success: boolean;
        answer: string;
        sources: { title: string; url: string }[];
        nearbyPlaces?: { name: string; address: string; location: { lat: number; lng: number }; placeId: string; type?: string }[];
    }> {
        try {
            const response = await apiClient.post('/api/venue-chat', {
                venue,
                question,
                history
            });
            return response.data;
        } catch (error) {
            console.warn('💬 Venue chat failed:', error);
            return { success: false, answer: 'Error! Retry', sources: [] };
        }
    },

    async shareTrip(payload: SharedTripPayload): Promise<{ success: boolean; shareId?: string }> {
        try {
            const response = await apiClient.post('/api/share-trip', { payload });
            return response.data;
        } catch (error) {
            console.warn('🔗 Share trip failed:', error);
            return { success: false };
        }
    },

    async getSharedTrip(shareId: string): Promise<{ success: boolean; payload?: SharedTripPayload }> {
        try {
            const response = await apiClient.get(`/api/share-trip/${shareId}`);
            return response.data;
        } catch (error) {
            console.warn('🔗 Fetch shared trip failed:', error);
            return { success: false };
        }
    },

    async healthCheck(): Promise<{ status: string; timestamp: string }> {
        const response = await apiClient.get('/api/health');
        return response.data;
    },
};

// 🆕 Analytics tracking functions
export const authApi = {
    async loginWithGoogle(credential: string): Promise<{ success: boolean; user?: AuthUser; error?: string }> {
        try {
            const response = await apiClient.post<{ success: boolean; user: AuthUser }>('/api/auth/google', {
                credential
            });
            return response.data;
        } catch (error: any) {
            return {
                success: false,
                error: error?.response?.data?.error || 'Google sign-in failed'
            };
        }
    },

    async getCurrentUser(): Promise<{ success: boolean; authenticated: boolean; user?: AuthUser }> {
        try {
            const response = await apiClient.get<{ success: boolean; authenticated: boolean; user?: AuthUser }>('/api/auth/me');
            return response.data;
        } catch (error: any) {
            if (error?.response?.status === 401) {
                return { success: false, authenticated: false };
            }

            console.warn('Failed to fetch current user:', error);
            return { success: false, authenticated: false };
        }
    },

    async logout(): Promise<{ success: boolean }> {
        try {
            const response = await apiClient.post<{ success: boolean }>('/api/auth/logout');
            return response.data;
        } catch (error) {
            console.warn('Logout failed:', error);
            return { success: false };
        }
    }
};

export const analyticsApi = {
    async trackModification(prompt: string): Promise<void> {
        if (!currentSessionId) {
            console.warn('No session ID available for analytics');
            return;
        }
        try {
            await apiClient.post('/api/analytics/modification', {
                session_id: currentSessionId,
                prompt
            });
        } catch (error) {
            console.warn('Failed to track modification:', error);
        }
    },

    async trackReelClick(
        reelId?: string,
        reelUrl?: string,
        watchTimeSeconds?: number
    ): Promise<void> {
        if (!currentSessionId) {
            console.warn('No session ID available for analytics');
            return;
        }
        try {
            await apiClient.post('/api/analytics/reel-click', {
                session_id: currentSessionId,
                reel_id: reelId,
                reel_url: reelUrl,
                watch_time_seconds: watchTimeSeconds
            });
        } catch (error) {
            console.warn('Failed to track reel click:', error);
        }
    }
};

export default apiClient;
