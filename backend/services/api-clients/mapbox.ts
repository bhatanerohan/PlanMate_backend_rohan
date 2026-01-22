// backend/services/api-clients/mapbox.ts

import axios from 'axios';

export interface RouteResult {
  distance: number;
  duration: number;
  geometry: {
    type: 'LineString';
    coordinates: number[][];
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

export interface OptimizationResult {
  optimizedOrder: number[];
  optimizedWaypoints: Array<{ lat: number; lng: number; originalIndex: number }>;
  totalDistance: number;
  totalDuration: number;
  geometry: {
    type: 'LineString';
    coordinates: number[][];
  };
}

export interface OptimizationOptions {
  mode?: 'walking' | 'driving' | 'cycling';
  source?: 'first' | 'last' | 'any';
  destination?: 'first' | 'last' | 'any';
  roundtrip?: boolean;
}

export class MapboxClient {
  private apiKey: string;
  private baseUrl = 'https://api.mapbox.com';

  constructor(apiKey: string) {
    if (!apiKey) {
      throw new Error('Mapbox API key is required');
    }
    this.apiKey = apiKey;
  }

  async optimizeRoute(
    waypoints: Array<{ lat: number; lng: number }>,
    options: OptimizationOptions = {}
  ): Promise<OptimizationResult> {
    if (waypoints.length < 2) {
      throw new Error('At least 2 waypoints required for optimization');
    }

    if (waypoints.length > 12) {
      console.warn(`⚠️ Optimization API supports max 12 waypoints, truncating from ${waypoints.length}`);
      waypoints = waypoints.slice(0, 12);
    }

    const coordinates = waypoints.map(wp => `${wp.lng},${wp.lat}`).join(';');
    
    console.log(`   Coordinates: ${coordinates}`);
    
    const modesToTry = [options.mode || 'walking', 'driving'];
    
    for (const mode of modesToTry) {
      console.log(`🔄 [Mapbox Optimization] Trying ${mode} mode for ${waypoints.length} waypoints`);

      try {
        const url = `${this.baseUrl}/optimized-trips/v1/mapbox/${mode}/${coordinates}`;
        
        const response = await axios.get(url, {
          params: {
            access_token: this.apiKey,
            geometries: 'geojson',
            overview: 'full',
            steps: false,
            source: 'first',
            destination: 'last',
            roundtrip: false
          }
        });

        console.log(`   Response code: ${response.data.code}`);
        console.log(`   Trips count: ${response.data.trips?.length || 0}`);
        console.log(`   Waypoints count: ${response.data.waypoints?.length || 0}`);
        
        if (response.data.code !== 'Ok') {
          console.log(`   ⚠️ API returned code: ${response.data.code}`);
          continue;
        }

        if (!response.data.trips || response.data.trips.length === 0) {
          console.log(`   ⚠️ No ${mode} trips in response`);
          continue;
        }

        const trip = response.data.trips[0];
        
        console.log(`   Trip distance: ${trip.distance}, duration: ${trip.duration}`);
        
        if (trip.distance === null || trip.duration === null) {
          console.log(`   ⚠️ Invalid ${mode} route returned (null values)`);
          continue;
        }

        const optimizedWaypoints = response.data.waypoints;
        
        if (!optimizedWaypoints || optimizedWaypoints.length === 0) {
          console.log(`   ⚠️ No waypoints in ${mode} response`);
          continue;
        }

        const optimizedOrder = optimizedWaypoints.map((wp: any) => wp.waypoint_index);
        
        const reorderedWaypoints = optimizedOrder.map((newIdx: number) => ({
          lat: waypoints[newIdx].lat,
          lng: waypoints[newIdx].lng,
          originalIndex: newIdx
        }));

        console.log(`✅ Route optimized (${mode}): ${this.formatDistance(trip.distance)}, ${this.formatDuration(trip.duration)}`);
        console.log(`   Original order: [${waypoints.map((_, i) => i).join(', ')}]`);
        console.log(`   Optimized order: [${optimizedOrder.join(', ')}]`);

        return {
          optimizedOrder,
          optimizedWaypoints: reorderedWaypoints,
          totalDistance: trip.distance,
          totalDuration: trip.duration,
          geometry: trip.geometry
        };

      } catch (error) {
        if (axios.isAxiosError(error)) {
          console.log(`   ⚠️ ${mode} mode failed: ${error.response?.status} - ${error.response?.data?.message || error.message}`);
          if (error.response?.status === 401) {
            throw new Error('Invalid Mapbox API key');
          }
          continue;
        }
        throw error;
      }
    }

    throw new Error('No optimized route found for any transport mode');
  }

  async getRoute(
    waypoints: Array<{ lat: number; lng: number }>,
    options: RouteOptions = {}
  ): Promise<RouteResult> {
    try {
      const mode = options.mode || 'walking';
      const coordinates = waypoints.map(wp => `${wp.lng},${wp.lat}`).join(';');

      console.log(`🗺️  [Mapbox] Calculating ${mode} route with ${waypoints.length} waypoints`);

      const response = await axios.get(
        `${this.baseUrl}/directions/v5/mapbox/${mode}/${coordinates}`,
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

  private formatDistance(meters: number): string {
    const miles = meters / 1609.34;
    return miles < 0.1 ? `${Math.round(meters)}m` : `${miles.toFixed(1)} mi`;
  }

  private formatDuration(seconds: number): string {
    const minutes = Math.round(seconds / 60);
    if (minutes < 60) return `${minutes} min`;
    return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
  }
}

let mapboxClient: MapboxClient | null = null;

export function getMapboxClient(): MapboxClient {
  if (!mapboxClient) {
    const apiKey = process.env.MAPBOX_ACCESS_TOKEN 
      || process.env.VITE_MAPBOX_TOKEN 
      || process.env.MAPBOX_TOKEN;
    
    if (!apiKey) {
      throw new Error('MAPBOX_ACCESS_TOKEN environment variable is required');
    }
    mapboxClient = new MapboxClient(apiKey);
  }
  return mapboxClient;
}