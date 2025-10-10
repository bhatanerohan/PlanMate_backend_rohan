// backend/routes/api.ts

import { Router, Request, Response } from 'express';
import { ReActAgent } from '../services/react-agent.js';
import { DEFAULT_SAFETY_CONFIG } from '../types/react-agent.js';
import { classifyIntent } from '../services/intent-classifier.js';  // ← ADD THIS IMPORT

const router = Router();

router.post('/plan', async (req: Request, res: Response) => {
  try {
    const { prompt } = req.body;

    // Basic validation
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

    console.log(`\n📝 Received request: "${prompt}"`);

    // ============================================================================
    // STEP 1: INTENT CLASSIFICATION (Security Check Only)
    // ============================================================================
    console.log('🔒 Running security check...');
    
    let classification;
    try {
      classification = await classifyIntent(prompt);
    } catch (error) {
      console.error('❌ Security check failed:', error);
      return res.status(500).json({
        success: false,
        error: 'Failed to process request. Please try again.'
      });
    }

    // ============================================================================
    // STEP 2: REJECT IF NOT RELEVANT
    // ============================================================================
    if (!classification.isRelevant) {
      console.log(`⛔ Query rejected: ${classification.reasoning}`);
      
      return res.status(400).json({
        success: false,
        error: 'not_relevant',
        message: "I can only help with location-based queries like finding venues, planning routes, or discovering events."
      });
    }

    // ============================================================================
    // STEP 3: PROCEED TO REACT AGENT
    // ============================================================================
    console.log('✅ Security check passed. Processing request...\n');

    const agent = new ReActAgent(DEFAULT_SAFETY_CONFIG);
    const response = await agent.execute(prompt);

    // Extract mode and selected venue IDs from agent's finish parameters
    let mode: 'discovery' | 'route' = 'discovery';
    let selectedVenueIds: Set<string> = new Set();

    // Use finish parameters directly from state if available
    if (response.state.finishParameters) {
      mode = response.state.finishParameters.mode;
      if (response.state.finishParameters.selected_venue_ids) {
        selectedVenueIds = new Set(response.state.finishParameters.selected_venue_ids);
      }
      console.log(`🎯 Mode: ${mode}, Selected venues: ${selectedVenueIds.size}`);
    } else {
      console.log('⚠️  No finish parameters in state');
      
      // FALLBACK: Try to extract from last message
      const lastMessage = response.state.conversationHistory[response.state.conversationHistory.length - 1];
      if (lastMessage && lastMessage.role === 'assistant') {
        try {
          const match = lastMessage.content.match(/Parameters:\s*({[\s\S]*?})/);
          if (match) {
            const params = JSON.parse(match[1]);
            mode = params.mode || mode;
            if (params.selected_venues && Array.isArray(params.selected_venues)) {
              selectedVenueIds = new Set(params.selected_venues);
            } else if (params.selected_venue_ids && Array.isArray(params.selected_venue_ids)) {
              selectedVenueIds = new Set(params.selected_venue_ids);
            }
          }
        } catch (e) {
          console.warn('Could not parse finish parameters');
        }
      }
    }

    // Validate placeIds exist in search results
    if (mode === 'route' && selectedVenueIds.size > 0) {
      const allPlaceIds = new Set<string>();
      response.state.toolResults.forEach(result => {
        if (result.action === 'search_venues' && result.success && result.data?.venues) {
          result.data.venues.forEach((v: any) => {
            if (v.placeId) allPlaceIds.add(v.placeId);
          });
        }
      });
      
      const missingPlaceIds: string[] = [];
      selectedVenueIds.forEach(id => {
        if (!allPlaceIds.has(id)) {
          missingPlaceIds.push(id);
        }
      });
      
      if (missingPlaceIds.length > 0) {
        console.warn(`⚠️  ${missingPlaceIds.length} selected placeIds not found in search results`);
      }
    }

    // Extract venues based on mode
    const venues: any[] = [];
    const events: any[] = [];
    const routes: any[] = [];

    if (mode === 'discovery') {
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
      console.log(`📊 Discovery: ${venues.length} venues, ${events.length} events`);
    } else {
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
      console.log(`🗺️ Route: ${venues.length} selected venues`);
    }

    return res.json({
      success: response.success,
      result: response.result,
      mode,
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