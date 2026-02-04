// frontend/src/services/api.ts

import axios from 'axios';
import type { GeoPreferenceMode, PlanResponse, Venue } from '../types';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

const apiClient = axios.create({
  baseURL: API_BASE_URL,
  timeout: 300000, // 5 minutes
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

  async healthCheck(): Promise<{ status: string; timestamp: string }> {
    const response = await apiClient.get('/api/health');
    return response.data;
  },
};

// 🆕 Analytics tracking functions
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

