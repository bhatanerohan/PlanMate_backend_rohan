// // backend/services/intent-classifier.ts - SIMPLIFIED (Route to Gemini directly)

// import OpenAI from 'openai';
// import dotenv from 'dotenv';

// dotenv.config();

// const openai = new OpenAI({
//   apiKey: process.env.OPENAI_API_KEY
// });

// export interface EnhancedClassificationResult {
//   isRelevant: boolean;
//   routeTo: 'gemini' | 'agent2' | 'agent4' | null;  // 🔧 CHANGED: 'agent1' → 'gemini'
//   queryType: 'explicit_route' | 'itinerary_planning' | 'discovery' | 'itinerary_modification' | 'not_relevant';
//   category: import('../types/index.js').IntentCategory | 'not_relevant';
//   reasoning: string;
//   prompt: string;
//   useGeminiGrounding: boolean;
// }

// interface GPTClassificationResponse {
//   isRelevant: boolean;
//   routeTo: 'gemini' | 'agent2' | 'agent4' | null;  // 🔧 CHANGED
//   queryType: string;
//   reasoning: string;
//   useGeminiGrounding: boolean;
// }

// function detectManipulation(prompt: string): boolean {
//   const lowerPrompt = prompt.toLowerCase();
  
//   const manipulationPatterns = [
//     'ignore previous', 'ignore all previous', 'ignore above', 'ignore instructions',
//     'forget instructions', 'forget previous', 'disregard', 'you are now', 'act as',
//     'pretend you', 'roleplay', 'system:', 'system prompt', 'return true', 'return false',
//     'output true', 'output false', 'override', 'bypass', 'new rule', 'new instruction',
//     'developer mode', 'admin mode', 'debug mode', 'jailbreak', 'dan mode', 'do anything now',
//   ];
  
//   return manipulationPatterns.some(pattern => lowerPrompt.includes(pattern));
// }

// /**
//  * Enhanced classifier - routes to Gemini for planning queries (Agent 1 is dormant)
//  */
// export async function classifyIntent(
//   prompt: string, 
//   hasCurrentItinerary: boolean = false
// ): Promise<EnhancedClassificationResult> {
  
//   if (detectManipulation(prompt)) {
//     console.warn(`🚨 Manipulation detected in prompt: "${prompt.substring(0, 100)}..."`);
//     return {
//       isRelevant: false,
//       routeTo: null,
//       queryType: 'not_relevant',
//       category: 'not_relevant',
//       reasoning: 'Detected manipulation attempt in prompt',
//       prompt: prompt,
//       useGeminiGrounding: false
//     };
//   }

//   try {
//     const response = await openai.chat.completions.create({
//       model: "gpt-4o-mini",
//       temperature: 0,
//       messages: [
//         {
//           role: "system",
//           content: `You are a smart router for a location-based travel planning app.

// === YOUR JOB ===
// Analyze the user's query and determine:
// 1. Is it relevant to locations/venues/events?
// 2. What type of query is it?
// 3. Which agent should handle it?
// 4. Should we use Gemini grounding for rich context?

// === CONTEXT ===
// User currently has an active itinerary: ${hasCurrentItinerary ? 'YES' : 'NO'}

// === QUERY TYPES & ROUTING ===

// **Type: itinerary_modification**
// User wants to modify their existing itinerary.
// Keywords: "add", "remove", "delete", "replace", "change", "swap"
// Examples:
// - "add a coffee shop after the museum"
// - "remove the second stop"

// ⚠️ CRITICAL: ONLY if hasCurrentItinerary is TRUE
// → Route to: agent4
// → Grounding: FALSE

// **Type: explicit_route**
// User specifies exact venues/locations to visit in order.
// Keywords: "route from", "directions to", "path from X to Y to Z"
// Examples:
// - "route from Starbucks to Harvard to MIT"
// - "my location to Fenway Park"

// → Route to: agent2
// → Grounding: FALSE (specific places = no grounding needed)

// **Type: itinerary_planning** 🔧 CHANGED
// User wants you to PLAN an experience with multiple stops.
// Keywords: "crawl", "tour", "plan", "date", "night out", "hopping"
// Examples:
// - "bar crawl in fenway"
// - "food tour in north end"
// - "plan a date night in boston"

// → Route to: gemini 🆕 DIRECT TO GEMINI (skip Agent 1!)
// → Grounding: TRUE (Gemini handles planning + grounding together)

// **Type: discovery**
// User wants venue recommendations or to find places.
// Keywords: "find", "best", "show me", "what are", "where can I"
// Examples:
// - "best pizza in north end"
// - "find coffee shops near harvard"

// → Route to: gemini if exploratory, agent2 if specific
// → Grounding: DEPENDS
//   - Exploratory ("best romantic restaurants") = gemini + TRUE
//   - Specific ("find Starbucks near MIT") = agent2 + FALSE

// === GROUNDING DECISION RULES ===

// USE GEMINI GROUNDING when:
// ✅ Query is exploratory/vague ("family-friendly places")
// ✅ Query asks for recommendations ("best", "top", "good")
// ✅ Query needs context understanding ("date night", "bar crawl vibe")
// ✅ Query is about discovering new places

// DON'T USE GROUNDING when:
// ❌ Query mentions specific venue names
// ❌ Query is about routing/directions
// ❌ Query is modifying existing itinerary
// ❌ Query has coordinates or addresses

// **Type: not_relevant**
// Not about locations, venues, or events.
// → Reject (routeTo: null)
// → Grounding: FALSE

// === RESPONSE FORMAT (REQUIRED) ===
// {
//   "isRelevant": true or false,
//   "routeTo": "gemini" or "agent2" or "agent4" or null,
//   "queryType": "explicit_route" or "itinerary_planning" or "discovery" or "itinerary_modification" or "not_relevant",
//   "reasoning": "brief explanation",
//   "useGeminiGrounding": true or false
// }

// No other text. Just JSON.`
//         },
//         {
//           role: "user",
//           content: prompt
//         }
//       ]
//     });

//     const content = response.choices[0]?.message?.content;
    
//     if (!content) {
//       throw new Error('No response from GPT');
//     }

//     let result: GPTClassificationResponse;
//     try {
//       result = JSON.parse(content);
//     } catch (parseError) {
//       console.error('Failed to parse GPT response:', content);
//       throw new Error('Invalid JSON response from classifier');
//     }

//     // Validate response
//     if (typeof result.isRelevant !== 'boolean') {
//       throw new Error('Invalid classification: isRelevant must be boolean');
//     }

//     if (result.isRelevant && !result.routeTo) {
//       throw new Error('Invalid classification: routeTo required when relevant');
//     }

//     if (!result.queryType || !result.reasoning) {
//       throw new Error('Invalid classification: queryType and reasoning are required');
//     }

//     // Validate routeTo values (updated to include 'gemini')
//     if (result.routeTo && !['gemini', 'agent2', 'agent4'].includes(result.routeTo)) {
//       throw new Error('Invalid classification: routeTo must be "gemini", "agent2", or "agent4"');
//     }

//     const validQueryTypes = ['explicit_route', 'itinerary_planning', 'discovery', 'itinerary_modification', 'not_relevant'];
//     if (!validQueryTypes.includes(result.queryType)) {
//       throw new Error('Invalid classification: queryType must be one of: ' + validQueryTypes.join(', '));
//     }

//     if (typeof result.useGeminiGrounding !== 'boolean') {
//       console.warn('⚠️ Missing useGeminiGrounding flag, defaulting to false');
//       result.useGeminiGrounding = false;
//     }

//     // Safety: Don't allow modification without current itinerary
//     if (result.queryType === 'itinerary_modification' && !hasCurrentItinerary) {
//       console.warn('⚠️ Modification query without current itinerary, treating as new planning');
//       result.queryType = 'itinerary_planning';
//       result.routeTo = 'gemini';  // 🔧 CHANGED: route to gemini
//       result.reasoning = 'No current itinerary to modify, creating new one';
//       result.useGeminiGrounding = true;
//     }
    
//     console.log('🎯 Classification result:', {
//       isRelevant: result.isRelevant,
//       routeTo: result.routeTo,
//       queryType: result.queryType,
//       reasoning: result.reasoning,
//       useGeminiGrounding: result.useGeminiGrounding,
//       hasCurrentItinerary
//     });

//     // Map queryType to category for backward compatibility
//     let category: import('../types/index.js').IntentCategory | 'not_relevant' = 'not_relevant';
//     if (result.isRelevant) {
//       switch (result.queryType) {
//         case 'explicit_route':
//           category = 'venue_search';
//           break;
//         case 'itinerary_planning':
//           category = 'quick_itinerary';
//           break;
//         case 'discovery':
//           category = 'activity_event';
//           break;
//         case 'itinerary_modification':
//           category = 'quick_itinerary';
//           break;
//         default:
//           category = 'not_relevant';
//       }
//     }

//     return {
//       isRelevant: result.isRelevant,
//       routeTo: result.routeTo,
//       queryType: result.queryType as any,
//       category,
//       reasoning: result.reasoning.trim(),
//       prompt: prompt,
//       useGeminiGrounding: result.useGeminiGrounding
//     };

//   } catch (error) {
//     console.error('Classification error:', error);
    
//     if (error instanceof Error) {
//       throw new Error(`Failed to classify intent: ${error.message}`);
//     }
    
//     throw new Error('Failed to classify intent: Unknown error');
//   }
// }

// backend/services/intent-classifier.ts

import OpenAI from 'openai';
import dotenv from 'dotenv';

dotenv.config();

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

export interface EnhancedClassificationResult {
  isRelevant: boolean;
  routeTo: 'gemini' | 'agent2' | 'agent4' | null;
  queryType: 'explicit_route' | 'itinerary_planning' | 'discovery' | 'itinerary_modification' | 'not_relevant';
  category: import('../types/index.js').IntentCategory | 'not_relevant';
  reasoning: string;
  prompt: string;
  useGeminiGrounding: boolean;
}

interface GPTClassificationResponse {
  isRelevant: boolean;
  routeTo: 'gemini' | 'agent2' | 'agent4' | null;
  queryType: string;
  reasoning: string;
  useGeminiGrounding: boolean;
}

// ============================================================================
// CORRIDOR DETECTION - Force Gemini for "from X to Y" queries (unless explicit route)
// ============================================================================
function detectCorridorPattern(prompt: string): boolean {
  const corridorPatterns = [
    /from\s+.+?\s+to\s+.+/i,           // "from X to Y"
    /between\s+.+?\s+and\s+.+/i,       // "between X and Y"
    /.+?\s+to\s+.+?\s+(route|walk|tour|trip)/i,  // "X to Y route"
  ];
  
  return corridorPatterns.some(pattern => pattern.test(prompt));
}

// Explicit route detection (multi-stop or directions style)
function detectExplicitRoutePattern(prompt: string): boolean {
  const explicitPatterns = [
    /\b(route|routes|directions|path)\b/i,
    /\bfrom\s+my\s+location\b/i,
    /\bfrom\s+.+?\s+to\s+.+?\s+to\s+.+/i, // "from X to Y to Z"
    /\bto\s+.+?\s+to\s+.+/i             // "to X to Y"
  ];

  return explicitPatterns.some(pattern => pattern.test(prompt));
}

function detectManipulation(prompt: string): boolean {
  const lowerPrompt = prompt.toLowerCase();
  
  const manipulationPatterns = [
    'ignore previous', 'ignore all previous', 'ignore above', 'ignore instructions',
    'forget instructions', 'forget previous', 'disregard', 'you are now', 'act as',
    'pretend you', 'roleplay', 'system:', 'system prompt', 'return true', 'return false',
    'output true', 'output false', 'override', 'bypass', 'new rule', 'new instruction',
    'developer mode', 'admin mode', 'debug mode', 'jailbreak', 'dan mode', 'do anything now',
  ];
  
  return manipulationPatterns.some(pattern => lowerPrompt.includes(pattern));
}

export async function classifyIntent(
  prompt: string, 
  hasCurrentItinerary: boolean = false
): Promise<EnhancedClassificationResult> {
  
  if (detectManipulation(prompt)) {
    console.warn(`🚨 Manipulation detected in prompt: "${prompt.substring(0, 100)}..."`);
    return {
      isRelevant: false,
      routeTo: null,
      queryType: 'not_relevant',
      category: 'not_relevant',
      reasoning: 'Detected manipulation attempt in prompt',
      prompt: prompt,
      useGeminiGrounding: false
    };
  }

  // 🆕 CORRIDOR DETECTION - Check BEFORE calling GPT
  const hasCorridor = detectCorridorPattern(prompt);
  const hasExplicitRoute = detectExplicitRoutePattern(prompt);
  if (hasExplicitRoute) {
    console.log('Explicit route pattern detected, preferring agent2');
  } else if (hasCorridor) {
    console.log('🛤️ Corridor pattern detected, forcing Gemini routing');
  }

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0,
      messages: [
        {
          role: "system",
          content: `You are a smart router for a location-based travel planning app.

=== YOUR JOB ===
Analyze the user's query and determine:
1. Is it relevant to locations/venues/events?
2. What type of query is it?
3. Which agent should handle it?
4. Should we use Gemini grounding for rich context?

=== CONTEXT ===
User currently has an active itinerary: ${hasCurrentItinerary ? 'YES' : 'NO'}

=== QUERY TYPES & ROUTING ===

**Type: itinerary_modification**
User wants to modify their existing itinerary.
Keywords: "add", "remove", "delete", "replace", "change", "swap"
⚠️ CRITICAL: ONLY if hasCurrentItinerary is TRUE
→ Route to: agent4
→ Grounding: FALSE

**Type: explicit_route**
User specifies exact venues/locations to visit in order.
Keywords: "route from", "directions to", "path from X to Y to Z"
→ Route to: agent2
→ Grounding: FALSE (specific places = no grounding needed)

**Type: itinerary_planning**
User wants you to PLAN an experience with multiple stops.
Keywords: "crawl", "tour", "plan", "date", "night out", "hopping"
→ Route to: gemini
→ Grounding: TRUE

**Type: discovery**
User wants venue recommendations or to find places.
Keywords: "find", "best", "show me", "what are", "where can I"
→ Route to: gemini if exploratory, agent2 if specific
→ Grounding: DEPENDS
  - Exploratory ("best romantic restaurants") = gemini + TRUE
  - Specific ("find Starbucks near MIT") = agent2 + FALSE

=== GROUNDING DECISION RULES ===

USE GEMINI GROUNDING when:
✅ Query is exploratory/vague ("family-friendly places")
✅ Query asks for recommendations ("best", "top", "good")
✅ Query needs context understanding ("date night", "bar crawl vibe")
✅ Query is about discovering new places
✅ Query mentions "from X to Y" or "between X and Y" (corridor query)

DON'T USE GROUNDING when:
❌ Query mentions specific venue names
❌ Query is about routing/directions to specific places
❌ Query is modifying existing itinerary

**Type: not_relevant**
Not about locations, venues, or events.
→ Reject (routeTo: null)
→ Grounding: FALSE

=== RESPONSE FORMAT (REQUIRED) ===
{
  "isRelevant": true or false,
  "routeTo": "gemini" or "agent2" or "agent4" or null,
  "queryType": "explicit_route" or "itinerary_planning" or "discovery" or "itinerary_modification" or "not_relevant",
  "reasoning": "brief explanation",
  "useGeminiGrounding": true or false
}

No other text. Just JSON.`
        },
        {
          role: "user",
          content: prompt
        }
      ]
    });

    const content = response.choices[0]?.message?.content;
    
    if (!content) {
      throw new Error('No response from GPT');
    }

    let result: GPTClassificationResponse;
    try {
      result = JSON.parse(content);
    } catch (parseError) {
      console.error('Failed to parse GPT response:', content);
      throw new Error('Invalid JSON response from classifier');
    }

    // Validate response
    if (typeof result.isRelevant !== 'boolean') {
      throw new Error('Invalid classification: isRelevant must be boolean');
    }

    if (result.isRelevant && !result.routeTo) {
      throw new Error('Invalid classification: routeTo required when relevant');
    }

    if (!result.queryType || !result.reasoning) {
      throw new Error('Invalid classification: queryType and reasoning are required');
    }

    if (result.routeTo && !['gemini', 'agent2', 'agent4'].includes(result.routeTo)) {
      throw new Error('Invalid classification: routeTo must be "gemini", "agent2", or "agent4"');
    }

    const validQueryTypes = ['explicit_route', 'itinerary_planning', 'discovery', 'itinerary_modification', 'not_relevant'];
    if (!validQueryTypes.includes(result.queryType)) {
      throw new Error('Invalid classification: queryType must be one of: ' + validQueryTypes.join(', '));
    }

    if (typeof result.useGeminiGrounding !== 'boolean') {
      console.warn('⚠️ Missing useGeminiGrounding flag, defaulting to false');
      result.useGeminiGrounding = false;
    }

    // 🆕 OVERRIDES: Prefer agent2 for explicit routes, otherwise use corridor detection
    if (hasExplicitRoute && result.isRelevant) {
      result.routeTo = 'agent2';
      result.queryType = 'explicit_route';
      result.useGeminiGrounding = false;
      result.reasoning += ' [Explicit route pattern detected - routed to agent2]';
    } else if (hasCorridor && result.isRelevant) {
      console.log('🛤️ Overriding to Gemini for corridor query');
      result.routeTo = 'gemini';
      result.useGeminiGrounding = true;
      result.reasoning += ' [Corridor pattern detected - routed to Gemini]';
    }

    // Safety: Don't allow modification without current itinerary
    if (result.queryType === 'itinerary_modification' && !hasCurrentItinerary) {
      console.warn('⚠️ Modification query without current itinerary, treating as new planning');
      result.queryType = 'itinerary_planning';
      result.routeTo = 'gemini';
      result.reasoning = 'No current itinerary to modify, creating new one';
      result.useGeminiGrounding = true;
    }
    
    console.log('🎯 Classification result:', {
      isRelevant: result.isRelevant,
      routeTo: result.routeTo,
      queryType: result.queryType,
      reasoning: result.reasoning,
      useGeminiGrounding: result.useGeminiGrounding,
      hasCurrentItinerary,
      corridorDetected: hasCorridor,
      explicitRouteDetected: hasExplicitRoute
    });

    // Map queryType to category for backward compatibility
    let category: import('../types/index.js').IntentCategory | 'not_relevant' = 'not_relevant';
    if (result.isRelevant) {
      switch (result.queryType) {
        case 'explicit_route':
          category = 'venue_search';
          break;
        case 'itinerary_planning':
          category = 'quick_itinerary';
          break;
        case 'discovery':
          category = 'activity_event';
          break;
        case 'itinerary_modification':
          category = 'quick_itinerary';
          break;
        default:
          category = 'not_relevant';
      }
    }

    return {
      isRelevant: result.isRelevant,
      routeTo: result.routeTo,
      queryType: result.queryType as any,
      category,
      reasoning: result.reasoning.trim(),
      prompt: prompt,
      useGeminiGrounding: result.useGeminiGrounding
    };

  } catch (error) {
    console.error('Classification error:', error);
    
    if (error instanceof Error) {
      throw new Error(`Failed to classify intent: ${error.message}`);
    }
    
    throw new Error('Failed to classify intent: Unknown error');
  }
}
