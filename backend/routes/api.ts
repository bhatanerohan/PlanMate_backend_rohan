// backend/routes/api.ts

import { Router, Request, Response } from 'express';
import { ReActAgent } from '../services/react-agent.js';
import { DEFAULT_SAFETY_CONFIG } from '../types/react-agent.js';

const router = Router();

router.post('/plan', async (req: Request, res: Response) => {
  try {
    const { prompt } = req.body;

    if (!prompt || typeof prompt !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'Prompt is required and must be a string'
      });
    }

    if (prompt.trim().length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Prompt cannot be empty'
      });
    }

    console.log(`\n📝 Received planning request: "${prompt}"`);

    const agent = new ReActAgent(DEFAULT_SAFETY_CONFIG);
    const response = await agent.execute(prompt);

    // Extract venues, events, and routes from tool results  ⭐ UPDATED
    const venues: any[] = [];
    const events: any[] = [];
    const routes: any[] = [];  // ⭐ NEW

    response.state.toolResults.forEach(result => {
      if (result.success && result.data) {
        if (result.action === 'search_venues' && result.data.venues) {
          venues.push(...result.data.venues);
        }
        if (result.action === 'search_events' && result.data.events) {
          events.push(...result.data.events);
        }
        // ⭐ NEW: Extract route data
        if (result.action === 'calculate_route' && result.data.geometry) {
          routes.push({
            distance: result.data.distance,
            distanceFormatted: result.data.distanceFormatted,
            duration: result.data.duration,
            durationFormatted: result.data.durationFormatted,
            geometry: result.data.geometry,
            mode: result.data.mode,
            waypoints: result.data.waypoints
          });
        }
      }
    });

    return res.json({
      success: response.success,
      result: response.result,
      venues,
      events,
      routes,  // ⭐ NEW
      iterations: response.iterations,
      tokensUsed: response.tokensUsed,
      executionTimeMs: response.executionTimeMs,
      stoppedReason: response.stoppedReason,
      error: response.error
    });

  } catch (error) {
    console.error('❌ API Error:', error);
    
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Internal server error'
    });
  }
});

router.get('/health', (req: Request, res: Response) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    service: 'PlanMate API'
  });
});

export default router;