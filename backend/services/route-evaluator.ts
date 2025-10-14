// backend/services/route-evaluator.ts

import OpenAI from 'openai';
import dotenv from 'dotenv';
import type { RouteEvaluation } from '../types/react-agent.js';

dotenv.config();

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

export class RouteEvaluator {
  /**
   * Evaluate if the agent's route matches the user's intended order
   * Uses a 2-step process:
   * 1. Map user's waypoints → placeIds using search results
   * 2. Compare mapped placeIds vs selected_venues array
   */
  async evaluateRoute(
    userPrompt: string,
    selectedVenues: string[],
    searchResults: any[]
  ): Promise<RouteEvaluation> {
    console.log('\n🔍 EVALUATING ROUTE ORDER...');
    console.log(`   User prompt: "${userPrompt}"`);
    console.log(`   Selected venues: ${JSON.stringify(selectedVenues)}`);

    // Build venue lookup: placeId -> name and name -> placeId
    const placeIdToName = new Map<string, string>();
    const nameLookup: Array<{ name: string; placeId: string }> = [];
    
    searchResults.forEach(venue => {
      if (venue.placeId && venue.name) {
        placeIdToName.set(venue.placeId, venue.name);
        nameLookup.push({ name: venue.name, placeId: venue.placeId });
      }
    });

    // Convert selected venues to readable names for logging
    const readableVenues = selectedVenues.map(id => {
      if (id === 'user-location') return 'user-location';
      return placeIdToName.get(id) || id;
    });

    console.log(`   Readable order: ${readableVenues.join(' → ')}`);

    try {
      // STEP 1: Ask LLM to extract user's waypoints and map them to placeIds
      const mappingResponse = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        temperature: 0,
        messages: [
          {
            role: 'system',
            content: `You are a waypoint mapper. Extract waypoints from user's route request and map them to venue placeIds.

TASK:
1. Parse the user's prompt to extract waypoints IN ORDER (left to right)
2. For each waypoint, find the matching venue from the search results
3. Return the mapped placeIds in order

MAPPING RULES:
- "moma" / "museum of modern art" → Find venue containing "Museum of Modern Art"
- "grand central" → Find venue containing "Grand Central"
- "mit" → Find venue containing "MIT" or "Massachusetts Institute"
- "my location" / "here" / "me" / "current location" → Use "user-location"
- Match based on venue name containing the waypoint keywords

Available venues from search:
${JSON.stringify(nameLookup, null, 2)}

Return ONLY pure JSON (no markdown):
{
  "waypoints": ["waypoint1 from prompt", "waypoint2 from prompt", ...],
  "mappedPlaceIds": ["placeId1", "user-location", "placeId2", ...]
}

The mappedPlaceIds array length should equal waypoints array length.`
          },
          {
            role: 'user',
            content: `User's route request: "${userPrompt}"

Extract the waypoints in order and map each to a placeId from the available venues.

Example:
User: "route from moma to central park"
Available: [{"name": "The Museum of Modern Art", "placeId": "ChIJ_A"}, {"name": "Central Park", "placeId": "ChIJ_B"}]
Output: {"waypoints": ["moma", "central park"], "mappedPlaceIds": ["ChIJ_A", "ChIJ_B"]}`
          }
        ]
      });

      const mappingContent = mappingResponse.choices[0]?.message?.content;
      if (!mappingContent) {
        throw new Error('No mapping response');
      }

      // Parse mapping result
      let mappingJson = mappingContent.trim();
      if (mappingJson.startsWith('```json')) {
        mappingJson = mappingJson.replace(/```json\n?/g, '').replace(/```\n?$/g, '').trim();
      } else if (mappingJson.startsWith('```')) {
        mappingJson = mappingJson.replace(/```\n?/g, '').trim();
      }

      const mapping = JSON.parse(mappingJson);
      const expectedPlaceIds = mapping.mappedPlaceIds || [];

      console.log(`   Expected placeIds: ${JSON.stringify(expectedPlaceIds)}`);
      console.log(`   Actual placeIds: ${JSON.stringify(selectedVenues)}`);

      // STEP 2: Simple array comparison
      if (expectedPlaceIds.length !== selectedVenues.length) {
        return {
          isValid: false,
          expectedOrder: mapping.waypoints || [],
          actualOrder: readableVenues,
          issues: [`Length mismatch: expected ${expectedPlaceIds.length} waypoints, got ${selectedVenues.length}`],
          missingWaypoints: [],
          extraWaypoints: [],
          suggestions: 'Check if you missed or added extra waypoints'
        };
      }

      // Compare each position
      const issues: string[] = [];
      for (let i = 0; i < expectedPlaceIds.length; i++) {
        if (expectedPlaceIds[i] !== selectedVenues[i]) {
          const expectedName = expectedPlaceIds[i] === 'user-location' 
            ? 'user-location' 
            : placeIdToName.get(expectedPlaceIds[i]) || expectedPlaceIds[i];
          const actualName = readableVenues[i];
          
          issues.push(`Position ${i + 1}: expected "${expectedName}" but got "${actualName}"`);
        }
      }

      if (issues.length > 0) {
        console.log('   ❌ VALIDATION FAILED:');
        issues.forEach(issue => console.log(`      - ${issue}`));
        
        return {
          isValid: false,
          expectedOrder: mapping.waypoints || [],
          actualOrder: readableVenues,
          issues,
          missingWaypoints: [],
          extraWaypoints: [],
          suggestions: 'Reorder the selected_venues array to match the expected sequence'
        };
      }

      console.log('   ✅ Route order is correct');
      
      return {
        isValid: true,
        expectedOrder: mapping.waypoints || [],
        actualOrder: readableVenues,
        issues: [],
        missingWaypoints: [],
        extraWaypoints: []
      };

    } catch (error) {
      console.error('❌ Evaluation error:', error);
      
      // Fail safe: Accept the route on error
      console.log('   ⚠️  Evaluation failed, accepting route as-is');
      return {
        isValid: true,
        expectedOrder: [],
        actualOrder: [],
        issues: [],
        missingWaypoints: [],
        extraWaypoints: []
      };
    }
  }

  /**
   * Generate correction feedback for the agent
   */
  generateCorrectionFeedback(evaluation: RouteEvaluation): string {
    let feedback = '🔄 CORRECTION NEEDED - Route order is incorrect!\n\n';
    
    feedback += `Expected order: ${evaluation.expectedOrder.join(' → ')}\n`;
    feedback += `Your order: ${evaluation.actualOrder.join(' → ')}\n\n`;
    
    feedback += 'Issues:\n';
    evaluation.issues.forEach(issue => {
      feedback += `  • ${issue}\n`;
    });
    
    if (evaluation.suggestions) {
      feedback += `\n💡 ${evaluation.suggestions}\n`;
    }
    
    feedback += '\n⚠️  IMPORTANT: You already have all venue data from previous searches.\n';
    feedback += 'DO NOT search again. Just call finish with the selected_venues array reordered to match.\n';
    feedback += 'Use the exact placeIds you already found - just fix the order.';
    
    return feedback;
  }
}