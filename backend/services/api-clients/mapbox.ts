// backend/services/api-clients/mapbox.ts

import axios from 'axios';

/**
 * Mapbox Directions API Client
 * Docs: https://docs.mapbox.com/api/navigation/directions/
 */

export interface RouteResult {
  distance: number;        // meters
  duration: number;        // seconds
  geometry: {
    type: 'LineString';
    coordinates: number[][];  // [lng, lat] pairs
  };
  steps: Array<{
    instruction: string;
    distance: number;
    duration: number;
  }>;
}

export interface RouteOptions {
  mode?: 'walking' | 'driving' | 'cycling';
  overview?: 'full' | 'simplified' | 'false';
  steps?: boolean;
}

export class MapboxClient {
  private apiKey: string;
  private baseUrl = 'https://api.mapbox.com/directions/v5/mapbox';

  constructor(apiKey: string) {
    if (!apiKey) {
      throw new Error('Mapbox API key is required');
    }
    this.apiKey = apiKey;
  }

  /**
   * Calculate route between waypoints
   */
  async getRoute(
    waypoints: Array<{ lat: number; lng: number }>,
    options: RouteOptions = {}
  ): Promise<RouteResult> {
    try {
      const mode = options.mode || 'walking';
      
      // Mapbox uses lng,lat format
      const coordinates = waypoints
        .map(wp => `${wp.lng},${wp.lat}`)
        .join(';');

      console.log(`🗺️  [Mapbox] Calculating ${mode} route with ${waypoints.length} waypoints`);

      const response = await axios.get(
        `${this.baseUrl}/${mode}/${coordinates}`,
        {
          params: {
            access_token: this.apiKey,
            geometries: 'geojson',
            overview: options.overview || 'full',
            steps: options.steps !== false,
            alternatives: false
          }
        }
      );

      if (!response.data.routes || response.data.routes.length === 0) {
        throw new Error('No route found between waypoints');
      }

      const route = response.data.routes[0];
      
      console.log(`✅ Route calculated: ${this.formatDistance(route.distance)}, ${this.formatDuration(route.duration)}`);

      return {
        distance: route.distance,
        duration: route.duration,
        geometry: route.geometry,
        steps: route.legs[0]?.steps?.map((step: any) => ({
          instruction: step.maneuver.instruction,
          distance: step.distance,
          duration: step.duration
        })) || []
      };

    } catch (error) {
      if (axios.isAxiosError(error)) {
        if (error.response?.status === 401) {
          throw new Error('Invalid Mapbox API key');
        }
        throw new Error(`Mapbox API request failed: ${error.message}`);
      }
      throw error;
    }
  }

  /**
   * Helper: Format distance to human-readable string
   */
  static formatDistance(meters: number): string {
    const miles = meters * 0.000621371;
    if (miles < 0.1) {
      return `${Math.round(meters)} meters`;
    }
    return `${miles.toFixed(2)} miles`;
  }

  /**
   * Helper: Format duration to human-readable string
   */
  static formatDuration(seconds: number): string {
    const minutes = Math.round(seconds / 60);
    if (minutes < 60) {
      return `${minutes} min`;
    }
    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;
    return `${hours}h ${remainingMinutes}m`;
  }

  private formatDistance(meters: number): string {
    return MapboxClient.formatDistance(meters);
  }

  private formatDuration(seconds: number): string {
    return MapboxClient.formatDuration(seconds);
  }
}

// Export singleton instance
let mapboxClient: MapboxClient | null = null;

export function getMapboxClient(): MapboxClient {
  if (!mapboxClient) {
    const apiKey = process.env.MAPBOX_API_KEY;
    if (!apiKey) {
      throw new Error('MAPBOX_API_KEY not found in environment variables');
    }
    mapboxClient = new MapboxClient(apiKey);
  }
  return mapboxClient;
}