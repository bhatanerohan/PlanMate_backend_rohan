// backend/services/tools/distance-calculator.ts

import { Tool } from './base-tool.js';
import type { ToolName, ToolDefinition, ToolResult, ToolExecutionContext } from '../../types/tools.js';

/**
 * Distance Calculator Tool
 * Calculates distance and travel time between locations
 * 
 * Phase 1: Returns mock data
 * Phase 2: Will integrate with Google Distance Matrix API
 */
export class DistanceCalculatorTool extends Tool {
  name: ToolName = 'calculate_distance';
  description = 'Calculate distance and travel time between two locations';

  getDefinition(): ToolDefinition {
    return {
      name: this.name,
      description: this.description,
      parameters: {
        type: 'object',
        properties: {
          origin: {
            type: 'string',
            description: 'Starting location (address or place name)'
          },
          destination: {
            type: 'string',
            description: 'Destination location (address or place name)'
          },
          mode: {
            type: 'string',
            description: 'Travel mode: "driving", "walking", "transit", "bicycling"',
            enum: ['driving', 'walking', 'transit', 'bicycling']
          }
        },
        required: ['origin', 'destination']
      }
    };
  }

  async execute(parameters: Record<string, any>, context?: ToolExecutionContext): Promise<ToolResult> {
    const startTime = Date.now();

    // Validate parameters
    const validation = this.validate(parameters);
    if (!validation.valid) {
      return this.error(validation.error!);
    }

    const { origin, destination, mode = 'driving' } = parameters;

    console.log(`📏 [DistanceCalculatorTool] Calculating ${mode} distance from "${origin}" to "${destination}"`);

    try {
      // TODO Phase 2: Implement real Google Distance Matrix API call
      // const result = await googleDistanceAPI.getDistance({
      //   origins: [origin],
      //   destinations: [destination],
      //   mode: mode,
      //   units: 'imperial'
      // });

      // Mock data for Phase 1
      const mockDistance = this.generateMockDistance(origin, destination, mode);

      const latency = Date.now() - startTime;

      return this.success(
        {
          ...mockDistance,
          origin,
          destination,
          mode,
          message: '⚠️ Mock data - Google Distance Matrix API not yet integrated'
        },
        {
          apiCalls: 1,
          latency,
          source: 'mock'
        }
      );

    } catch (error) {
      return this.error(
        error instanceof Error ? error.message : 'Unknown error during distance calculation'
      );
    }
  }

  /**
   * Generate mock distance data for testing
   * Will be removed in Phase 2
   */
  private generateMockDistance(origin: string, destination: string, mode: string): any {
    // Generate semi-realistic mock data based on mode
    const mockData: Record<string, any> = {
      driving: {
        distance: '2.5 miles',
        duration: '8 minutes',
        distanceValue: 4023,  // meters
        durationValue: 480    // seconds
      },
      walking: {
        distance: '2.5 miles',
        duration: '50 minutes',
        distanceValue: 4023,
        durationValue: 3000
      },
      transit: {
        distance: '2.8 miles',
        duration: '25 minutes',
        distanceValue: 4506,
        durationValue: 1500
      },
      bicycling: {
        distance: '2.5 miles',
        duration: '15 minutes',
        distanceValue: 4023,
        durationValue: 900
      }
    };

    return mockData[mode] || mockData.driving;
  }
}