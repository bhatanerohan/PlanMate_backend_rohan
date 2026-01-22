// backend/services/tools/route-calculator.ts

import { Tool } from './base-tool.js';
import type { ToolName, ToolDefinition, ToolResult, ToolExecutionContext } from '../../types/tools.js';
import { getMapboxClient } from '../api-clients/mapbox.js';

// 🆕 ADD: Local helper functions
function formatDistance(meters: number): string {
  const miles = meters / 1609.34;
  return miles < 0.1 ? `${Math.round(meters)}m` : `${miles.toFixed(1)} mi`;
}

function formatDuration(seconds: number): string {
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min`;
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

/**
 * Route Calculator Tool
 * Calculates walking/driving routes between waypoints using Mapbox
 * Returns GeoJSON geometry for frontend visualization
 */
export class RouteCalculatorTool extends Tool {
  name: ToolName = 'calculate_route';
  description = 'Calculate walking, driving, or cycling route between multiple waypoints';

  getDefinition(): ToolDefinition {
    return {
      name: this.name,
      description: this.description,
      parameters: {
        type: 'object',
        properties: {
          waypoints: {
            type: 'string',
            description: 'Array of coordinates as JSON string. Format: [{"lat": 42.36, "lng": -71.06}, {"lat": 42.37, "lng": -71.07}]. Minimum 2 waypoints, maximum 25.'
          },
          mode: {
            type: 'string',
            description: 'Travel mode: "walking" (default, up to 1-2 miles), "driving" (longer distances), or "cycling"',
            enum: ['walking', 'driving', 'cycling']
          }
        },
        required: ['waypoints']
      }
    };
  }

  async execute(parameters: Record<string, any>, context?: ToolExecutionContext): Promise<ToolResult> {
    const startTime = Date.now();

    const validation = this.validate(parameters);
    if (!validation.valid) {
      return this.error(validation.error!);
    }

    try {
      let waypoints: Array<{ lat: number; lng: number }>;
      
      if (typeof parameters.waypoints === 'string') {
        try {
          waypoints = JSON.parse(parameters.waypoints);
        } catch {
          return this.error('Invalid waypoints format. Must be JSON array of {lat, lng} objects');
        }
      } else if (Array.isArray(parameters.waypoints)) {
        waypoints = parameters.waypoints;
      } else {
        return this.error('Waypoints must be an array or JSON string');
      }

      if (!Array.isArray(waypoints) || waypoints.length < 2) {
        return this.error('Need at least 2 waypoints to calculate a route');
      }

      if (waypoints.length > 25) {
        return this.error('Maximum 25 waypoints allowed');
      }

      for (let i = 0; i < waypoints.length; i++) {
        const wp = waypoints[i];
        if (typeof wp.lat !== 'number' || typeof wp.lng !== 'number') {
          return this.error(`Waypoint ${i} missing valid lat/lng coordinates`);
        }
      }

      const mode = (parameters.mode || 'walking') as 'walking' | 'driving' | 'cycling';

      console.log(`🗺️  [RouteCalculatorTool] Calculating ${mode} route with ${waypoints.length} waypoints`);

      const mapboxClient = getMapboxClient();
      const route = await mapboxClient.getRoute(waypoints, { mode, steps: true });

      const latency = Date.now() - startTime;

      return this.success(
        {
          distance: route.distance,
          distanceFormatted: formatDistance(route.distance),        // 🆕 CHANGED
          duration: route.duration,
          durationFormatted: formatDuration(route.duration),        // 🆕 CHANGED
          geometry: route.geometry,
          mode,
          waypoints: waypoints.map(wp => ({ lat: wp.lat, lng: wp.lng })),
          steps: route.steps.slice(0, 5).map(step => ({
            instruction: step.instruction,
            distance: formatDistance(step.distance)                 // 🆕 CHANGED
          }))
        },
        {
          apiCalls: 1,
          latency,
          source: 'mapbox'
        }
      );

    } catch (error) {
      console.error('❌ [RouteCalculatorTool] Error:', error);
      
      return this.error(
        error instanceof Error ? error.message : 'Unknown error during route calculation'
      );
    }
  }

  validate(parameters: Record<string, any>): { valid: boolean; error?: string } {
    if (!parameters.waypoints) {
      return {
        valid: false,
        error: 'Missing required parameter: waypoints'
      };
    }

    return { valid: true };
  }
}