// frontend/src/services/api.ts

import axios from 'axios';
import type { PlanResponse, Venue } from '../types';

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
    currentItinerary?: CurrentItinerary  // 🆕 Optional itinerary for modifications
  ): Promise<PlanResponse> {
    const response = await apiClient.post<PlanResponse>('/api/plan', {
      prompt,
      userLocation: userLocation ? {
        lat: userLocation.lat,
        lng: userLocation.lng,
        name: userLocation.name
      } : undefined,
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
    return response.data;
  },

  async healthCheck(): Promise<{ status: string; timestamp: string }> {
    const response = await apiClient.get('/api/health');
    return response.data;
  },
};

export default apiClient;