// backend/services/route-evaluator.ts
// ✅ FIXED: Field name mismatch bug + correct model name

import OpenAI from 'openai';
import dotenv from 'dotenv';
import type { RouteEvaluation } from '../types/react-agent.js';

dotenv.config();



export class RouteEvaluator {
  /**
   * Evaluate route based on query type
   * - Explicit routes: Verify exact order preservation
   * - Itineraries with order hints: Verify sequence matches user intent
   * - General itineraries: Skip validation (trust Agent 2)
   */
  private openai: OpenAI;
  constructor() {
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY
    });
  }


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

    // ITINERARY MODE: Check if user specified an order
    if (isItinerary) {
      const hasExplicitOrder = this.detectExplicitOrder(userPrompt);
      
      if (!hasExplicitOrder) {
        console.log('   ⏭️  No explicit order in prompt, skipping validation');
        return {
          isValid: true,
          expectedOrder: [],
          actualOrder: readableVenues,
          issues: [],
          missingWaypoints: [],
          extraWaypoints: []
        };
      }
      
      return this.evaluateSequence(userPrompt, selectedVenues, placeIdToCategory, readableVenues);
    }

    // EXPLICIT ROUTE MODE: Order preservation check
    return this.evaluateExplicitRoute(userPrompt, selectedVenues, nameLookup, readableVenues);
  }

  /**
   * Detect if user specified an explicit order in their prompt
   */
  private detectExplicitOrder(prompt: string): boolean {
    const lowerPrompt = prompt.toLowerCase();
    
    const orderPatterns = [
      /then/i,
      /after/i,
      /before/i,
      /followed by/i,
      /first.*then/i,
      /start.*end/i,
      /begin.*finish/i,
      /\d+\.\s+\w+.*\d+\.\s+/,
    ];
    
    return orderPatterns.some(pattern => pattern.test(lowerPrompt));
  }

  /**
   * Evaluate sequence for itineraries with order hints
   */
  private async evaluateSequence(
    userPrompt: string,
    selectedVenues: string[],
    placeIdToCategory: Map<string, string>,
    readableVenues: string[]
  ): Promise<RouteEvaluation> {
    console.log('   Mode: SEQUENCE validation (checking order hints)');

    try {
      const selectedCategories = selectedVenues
        .filter(id => id !== 'user-location')
        .map(id => placeIdToCategory.get(id) || 'unknown');

      console.log(`   Selected categories: ${selectedCategories.join(', ')}`);

      const response = await this.openai.chat.completions.create({
        model: 'gpt-4o-mini',  // ✅ FIXED: Was 'gpt-5-mini'
        temperature: 0,
        messages: [
          {
            role: 'system',
            content: `You are validating if venue ORDER matches user's explicit sequence request.

User specified an order in their prompt (e.g., "museum then restaurant", "park after cafe").
Check if the selected venues follow that order.

Examples:
- User: "museum then restaurant"
  Venues: [museum, restaurant] → VALID ✅
  Venues: [restaurant, museum] → INVALID ❌

- User: "park followed by cafe followed by restaurant"
  Venues: [park, cafe, restaurant] → VALID ✅
  Venues: [cafe, park, restaurant] → INVALID ❌

Return JSON:
{
  "isValid": true/false,
  "issues": ["issue1"] or [],
  "expectedSequence": ["park", "cafe", "restaurant"],
  "actualSequence": ["cafe", "park", "restaurant"]
}`
          },
          {
            role: 'user',
            content: `User request: "${userPrompt}"

Selected venues:
${readableVenues.map((name, i) => `${i + 1}. ${name} (${selectedCategories[i] || 'unknown'})`).join('\n')}

Does the order match the user's request?`
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
        console.log('   ✅ Sequence validation passed');
      } else {
        console.log('   ❌ Sequence validation failed:');
        evaluation.issues.forEach((issue: string) => console.log(`      - ${issue}`));
      }

      return {
        isValid: evaluation.isValid,
        expectedOrder: evaluation.expectedSequence || [],
        actualOrder: readableVenues,
        issues: evaluation.issues || [],
        missingWaypoints: [],
        extraWaypoints: [],
        suggestions: evaluation.isValid ? '' : 'Reorder venues to match the requested sequence'
      };

    } catch (error) {
      console.error('❌ Sequence evaluation error:', error);
      
      console.log('   ⚠️  Evaluation failed, accepting sequence as-is');
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
   * ✅ FIXED: Field name mismatch bug
   */
  private async evaluateExplicitRoute(
    userPrompt: string,
    selectedVenues: string[],
    nameLookup: Array<{ name: string; placeId: string; category: string }>,
    readableVenues: string[]
  ): Promise<RouteEvaluation> {
    console.log('   Mode: EXPLICIT ROUTE validation');

    try {
      const mappingResponse = await this.openai.chat.completions.create({
        model: 'gpt-4o-mini',  // ✅ FIXED: Was 'gpt-5-mini'
        temperature: 0,
        messages: [
          {
            role: 'system',
            content: `You are a waypoint mapper. Extract waypoints from user's route request and map them to venue placeIds.

TASK:
1. Parse the user's prompt to extract waypoints IN ORDER (left to right)
2. For each waypoint, find the BEST MATCHING venue from the search results
3. Map each waypoint to its corresponding placeId

CRITICAL RULES:
- "my location", "here", "me", "current location" → map to "user-location"
- Venue names → find matching placeId from venue list using FUZZY MATCHING
- Location qualifiers like "near X", "at Y", "in Z" are hints, not part of venue name
- If NO reasonable match exists → use the string "VENUE_NOT_FOUND"

FUZZY MATCHING RULES:
- "Starbucks near MIT" → matches "Starbucks" ✅
- "Harvard" → matches "Harvard University" ✅
- "cafe in downtown" → matches "Cafe" ✅
- Ignore location descriptors (near, at, in, by, etc.)
- Match based on core venue name/type

Example 1:
User: "route from my location to Harvard to Starbucks near MIT"
Waypoints extracted: ["my location", "Harvard", "Starbucks near MIT"]

Venues available:
- Harvard University (ChIJabc123) [attraction]
- Starbucks (ChIJdef456) [cafe]

Analysis:
- "my location" → user-location
- "Harvard" → matches "Harvard University" (fuzzy match) → ChIJabc123
- "Starbucks near MIT" → matches "Starbucks" (ignore "near MIT") → ChIJdef456

Output:
{
  "waypoints": ["user-location", "ChIJabc123", "ChIJdef456"]
}

Example 2:
User: "from here to coffee shop to museum"

Venues available:
- Blue Bottle Coffee (ChIJxyz789) [cafe]
- Museum of Science (ChIJlmn456) [museum]

Output:
{
  "waypoints": ["user-location", "ChIJxyz789", "ChIJlmn456"]
}

Return ONLY valid JSON with a "waypoints" array. No explanation, no markdown.`
          },
          {
            role: 'user',
            content: `User request: "${userPrompt}"

Available venues:
${nameLookup.map(v => `- ${v.name} (${v.placeId}) [${v.category}]`).join('\n')}

Extract waypoints and map to placeIds in order.`
          }
        ]
      });

      const mappingContent = mappingResponse.choices[0]?.message?.content;
      if (!mappingContent) {
        throw new Error('No mapping response');
      }

      // Clean markdown formatting
      let mappingJson = mappingContent.trim();
      if (mappingJson.startsWith('```json')) {
        mappingJson = mappingJson.replace(/```json\n?/g, '').replace(/```\n?$/g, '').trim();
      } else if (mappingJson.startsWith('```')) {
        mappingJson = mappingJson.replace(/```\n?/g, '').trim();
      }

      const mapping = JSON.parse(mappingJson);
      
      // ✅ FIXED: Look for 'waypoints' field (not 'mappedPlaceIds')
      const expectedPlaceIds = mapping.waypoints || [];

      console.log(`   Expected placeIds: ${JSON.stringify(expectedPlaceIds)}`);
      console.log(`   Actual placeIds: ${JSON.stringify(selectedVenues)}`);

      // Validate we got waypoints
      if (!expectedPlaceIds || expectedPlaceIds.length === 0) {
        console.warn('   ⚠️  Warning: LLM returned empty waypoints array');
        // Fail-safe: Accept route if LLM fails to extract waypoints
        return {
          isValid: true,
          expectedOrder: [],
          actualOrder: readableVenues,
          issues: [],
          missingWaypoints: [],
          extraWaypoints: []
        };
      }

      // Compare lengths
      if (expectedPlaceIds.length !== selectedVenues.length) {
        return {
          isValid: false,
          expectedOrder: expectedPlaceIds.map((id: string) => {
            if (id === 'user-location') return 'user-location';
            return nameLookup.find(v => v.placeId === id)?.name || id;
          }),
          actualOrder: readableVenues,
          issues: [`Length mismatch: expected ${expectedPlaceIds.length} waypoints, got ${selectedVenues.length}`],
          missingWaypoints: [],
          extraWaypoints: [],
          suggestions: 'Check if you missed or added extra waypoints'
        };
      }

      // Compare order
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
          expectedOrder: expectedPlaceIds.map((id: string) => {
            if (id === 'user-location') return 'user-location';
            return nameLookup.find(v => v.placeId === id)?.name || id;
          }),
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
        expectedOrder: expectedPlaceIds.map((id: string) => {
          if (id === 'user-location') return 'user-location';
          return nameLookup.find(v => v.placeId === id)?.name || id;
        }),
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
        actualOrder: readableVenues,
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