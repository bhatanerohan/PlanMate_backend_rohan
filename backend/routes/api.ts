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

    // Parse mode and selected venue IDs from agent's finish action
    let mode: 'discovery' | 'route' = 'discovery';
    let selectedVenueIds: Set<string> = new Set();

    // Try to extract mode and selected_venue_ids from the last action
    const lastMessage = response.state.conversationHistory[response.state.conversationHistory.length - 1];
    if (lastMessage && lastMessage.role === 'assistant') {
      try {
        // Parse the assistant's last message for structured data
        const match = lastMessage.content.match(/Parameters: ({[\s\S]*?})/);
        if (match) {
          const params = JSON.parse(match[1]);
          mode = params.mode || 'discovery';
          if (params.selected_venue_ids && Array.isArray(params.selected_venue_ids)) {
            selectedVenueIds = new Set(params.selected_venue_ids);
          }
        }
      } catch (e) {
        console.warn('Could not parse finish parameters, defaulting to discovery mode');
      }
    }

    console.log(`🎯 Detected mode: ${mode}`);
    console.log(`📍 Selected venue IDs: ${Array.from(selectedVenueIds).join(', ') || 'none'}`);

    // Extract venues based on mode
    const venues: any[] = [];
    const events: any[] = [];
    const routes: any[] = [];

    if (mode === 'discovery') {
      // Discovery mode: Return ALL venues from search results
      response.state.toolResults.forEach(result => {
        if (result.success && result.data) {
          if (result.action === 'search_venues' && result.data.venues) {
            venues.push(...result.data.venues);
          }
          if (result.action === 'search_events' && result.data.events) {
            events.push(...result.data.events);
          }
        }
      });

      console.log(`📊 Discovery mode: Returning ${venues.length} venues, ${events.length} events`);
    } else {
      // Route mode: Return ONLY selected venues
      response.state.toolResults.forEach(result => {
        if (result.success && result.data) {
          if (result.action === 'search_venues' && result.data.venues) {
            const filteredVenues = result.data.venues.filter((v: any) => 
              selectedVenueIds.size === 0 || selectedVenueIds.has(v.placeId)
            );
            venues.push(...filteredVenues);
          }
          if (result.action === 'search_events' && result.data.events) {
            events.push(...result.data.events);
          }
        }
      });

      console.log(`🗺️ Route mode: Returning ${venues.length} selected venues`);
    }

    return res.json({
      success: response.success,
      result: response.result,
      mode,  // Send mode to frontend
      venues,
      events,
      routes,
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