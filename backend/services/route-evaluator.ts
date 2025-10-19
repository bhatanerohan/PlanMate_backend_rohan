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
   * Evaluate route based on query type
   * - Explicit routes: Verify exact order preservation
   * - Itineraries: Verify categories and walkability
   */
  async evaluateRoute(
    userPrompt: string,
    selectedVenues: string[],
    searchResults: any[],
    isItinerary: boolean = false
  ): Promise<RouteEvaluation> {
    console.log('\n🔍 EVALUATING ROUTE ORDER...');
    console.log(`   User prompt: "${userPrompt}"`);
    console.log(`   Selected venues: ${selectedVenues.length}`);
    console.log(`   Is itinerary: ${isItinerary}`);

    // Build venue lookup
    const placeIdToName = new Map<string, string>();
    const placeIdToCategory = new Map<string, string>();
    const nameLookup: Array<{ name: string; placeId: string; category: string }> = [];
    
    searchResults.forEach(venue => {
      if (venue.placeId && venue.name) {
        placeIdToName.set(venue.placeId, venue.name);
        
        // Extract category from types array
        const category = this.extractCategory(venue.types);
        placeIdToCategory.set(venue.placeId, category);
        
        nameLookup.push({ 
          name: venue.name, 
          placeId: venue.placeId,
          category: category
        });
      }
    });

    // Convert selected venues to readable names
    const readableVenues = selectedVenues.map(id => {
      if (id === 'user-location') return 'user-location';
      return placeIdToName.get(id) || id;
    });

    console.log(`   Readable order: ${readableVenues.join(' → ')}`);

    // ITINERARY MODE: Different validation
    if (isItinerary) {
      return this.evaluateItinerary(userPrompt, selectedVenues, placeIdToCategory, readableVenues);
    }

    // EXPLICIT ROUTE MODE: Order preservation check
    return this.evaluateExplicitRoute(userPrompt, selectedVenues, nameLookup, readableVenues);
  }

  /**
   * Evaluate itinerary - check categories and walkability, not exact order
   */
  private async evaluateItinerary(
    userPrompt: string,
    selectedVenues: string[],
    placeIdToCategory: Map<string, string>,
    readableVenues: string[]
  ): Promise<RouteEvaluation> {
    console.log('   Mode: ITINERARY validation');

    try {
      // Get categories of selected venues
      const selectedCategories = selectedVenues
        .filter(id => id !== 'user-location')
        .map(id => placeIdToCategory.get(id) || 'unknown');

      console.log(`   Selected categories: ${selectedCategories.join(', ')}`);

      const response = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        temperature: 0,
        messages: [
          {
            role: 'system',
            content: `You are validating an itinerary plan.

Check if the selected venues match the user's request:

1. **Category Match**: Do the venue types make sense?
   - Bar crawl → should have bars/clubs
   - Food tour → should have restaurants/cafes
   - Date night → should have bar/restaurant/dessert mix

2. **Reasonable Count**: 
   - Too few stops (< 2)?
   - Too many stops (> 6)?

3. **Logical Sequence** (basic check):
   - Progression makes sense?
   - Not completely random?

DO NOT check exact order - itineraries can be flexible.
DO NOT require specific venue names - categories matter.

Return JSON:
{
  "isValid": true/false,
  "issues": ["issue1", "issue2"] or [],
  "suggestions": "what to fix" or ""
}`
          },
          {
            role: 'user',
            content: `User request: "${userPrompt}"

Selected venues (${selectedVenues.length}):
${readableVenues.map((name, i) => `${i + 1}. ${name} (${selectedCategories[i] || 'unknown'})`).join('\n')}

Are these appropriate for the request?`
          }
        ]
      });

      const content = response.choices[0]?.message?.content;
      if (!content) {
        throw new Error('No evaluation response');
      }

      let evaluationJson = content.trim();
      if (evaluationJson.startsWith('```json')) {
        evaluationJson = evaluationJson.replace(/```json\n?/g, '').replace(/```\n?$/g, '').trim();
      } else if (evaluationJson.startsWith('```')) {
        evaluationJson = evaluationJson.replace(/```\n?/g, '').trim();
      }

      const evaluation = JSON.parse(evaluationJson);

      if (evaluation.isValid) {
        console.log('   ✅ Itinerary validation passed');
      } else {
        console.log('   ❌ Itinerary validation failed:');
        evaluation.issues.forEach((issue: string) => console.log(`      - ${issue}`));
      }

      return {
        isValid: evaluation.isValid,
        expectedOrder: [], // Not applicable for itineraries
        actualOrder: readableVenues,
        issues: evaluation.issues || [],
        missingWaypoints: [],
        extraWaypoints: [],
        suggestions: evaluation.suggestions || ''
      };

    } catch (error) {
      console.error('❌ Itinerary evaluation error:', error);
      
      // Fail safe: Accept the itinerary on error
      console.log('   ⚠️  Evaluation failed, accepting itinerary as-is');
      return {
        isValid: true,
        expectedOrder: [],
        actualOrder: readableVenues,
        issues: [],
        missingWaypoints: [],
        extraWaypoints: []
      };
    }
  }

  /**
   * Evaluate explicit route - check exact order preservation
   */
  private async evaluateExplicitRoute(
    userPrompt: string,
    selectedVenues: string[],
    nameLookup: Array<{ name: string; placeId: string; category: string }>,
    readableVenues: string[]
  ): Promise<RouteEvaluation> {
    console.log('   Mode: EXPLICIT ROUTE validation');

    try {
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

Extract the waypoints in order and map each to a placeId from the available venues.`
          }
        ]
      });

      const mappingContent = mappingResponse.choices[0]?.message?.content;
      if (!mappingContent) {
        throw new Error('No mapping response');
      }

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

      // Compare order
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

      const issues: string[] = [];
      for (let i = 0; i < expectedPlaceIds.length; i++) {
        if (expectedPlaceIds[i] !== selectedVenues[i]) {
          const expectedName = expectedPlaceIds[i] === 'user-location' 
            ? 'user-location' 
            : nameLookup.find(v => v.placeId === expectedPlaceIds[i])?.name || expectedPlaceIds[i];
          const actualName = readableVenues[i];
          
          issues.push(`Position ${i + 1}: expected "${expectedName}" but got "${actualName}"`);
        }
      }

      if (issues.length > 0) {
        console.log('   ❌ Route validation failed:');
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
      console.error('❌ Route evaluation error:', error);
      
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
   * Extract category from venue types array
   */
  private extractCategory(types?: string[]): string {
    if (!types || types.length === 0) return 'unknown';

    // Priority order for category matching
    const categoryMap: Record<string, string> = {
      'bar': 'bar',
      'night_club': 'club',
      'restaurant': 'restaurant',
      'cafe': 'cafe',
      'bakery': 'bakery',
      'store': 'store',
      'shopping_mall': 'mall',
      'park': 'park',
      'museum': 'museum',
      'tourist_attraction': 'attraction'
    };

    for (const type of types) {
      if (categoryMap[type]) {
        return categoryMap[type];
      }
    }

    return types[0] || 'unknown';
  }

  /**
   * Generate correction feedback for the agent
   */
  generateCorrectionFeedback(evaluation: RouteEvaluation): string {
    let feedback = '🔄 CORRECTION NEEDED\n\n';
    
    if (evaluation.expectedOrder.length > 0) {
      feedback += `Expected order: ${evaluation.expectedOrder.join(' → ')}\n`;
      feedback += `Your order: ${evaluation.actualOrder.join(' → ')}\n\n`;
    }
    
    feedback += 'Issues:\n';
    evaluation.issues.forEach(issue => {
      feedback += `  • ${issue}\n`;
    });
    
    if (evaluation.suggestions) {
      feedback += `\n💡 ${evaluation.suggestions}\n`;
    }
    
    feedback += '\n⚠️  IMPORTANT: You already have all venue data from previous searches.\n';
    feedback += 'DO NOT search again. Just call finish with the corrected information.\n';
    
    return feedback;
  }
}