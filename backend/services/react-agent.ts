// // backend/services/react-agent.ts

// import OpenAI from 'openai';
// import dotenv from 'dotenv';
// import fs from 'fs';
// import path from 'path';
// import { startCapture } from './logger.js';
// dotenv.config();
// import type {
//   AgentState,
//   AgentAction,
//   ReActResponse,
//   SafetyConfig,
//   ConversationMessage,
//   ActionType
// } from '../types/react-agent.js';
// import type { ToolResult as ToolResultType } from '../types/tools.js';
// import { SafetyGuards } from './safety-guards.js';
// import { DEFAULT_SAFETY_CONFIG } from '../types/react-agent.js';
// import { toolRegistry } from './tools/tool-registry.js';

// const openai = new OpenAI({
//   apiKey: process.env.OPENAI_API_KEY
// });

// /**
//  * Core ReAct Agent Engine
//  * Implements: Think → Act → Observe loop with safety mechanisms
//  */
// export class ReActAgent {
//   private safetyGuards: SafetyGuards;
//   private config: SafetyConfig;

//   constructor(config: SafetyConfig = DEFAULT_SAFETY_CONFIG) {
//     this.config = config;
//     this.safetyGuards = new SafetyGuards(config);
//   }

//   /**
//    * Main execution loop
//    */
//   async execute(
//     userPrompt: string, 
//     userLocation?: { lat: number; lng: number; name: string }
//   ): Promise<ReActResponse> {
//     console.log('\n🚀 Starting ReAct Agent...');
//     console.log(`📝 User Prompt: "${userPrompt}"`);
//     if (userLocation) {
//       console.log(`📍 User Location: ${userLocation.name} (${userLocation.lat}, ${userLocation.lng})`);
//     }
//     console.log('');

    

//     // Initialize state
//     const state: AgentState = {
//       status: 'thinking',
//       currentIteration: 0,
//       startTime: Date.now(),
//       totalTokensUsed: 0,
//       conversationHistory: [
//         {
//           role: 'system',
//           content: this.getSystemPrompt(userLocation),
//           timestamp: Date.now()
//         },
//         {
//           role: 'user',
//           content: userPrompt,
//           timestamp: Date.now()
//         }
//       ],
//       toolResults: []
//     };

//     const stopCapture = startCapture(userPrompt);
//     try {
//       // Execute ReAct loop
//       while (state.status !== 'complete' && state.status !== 'failed' && state.status !== 'stopped') {
//         state.currentIteration++;
        
//         console.log(`\n${'='.repeat(80)}`);
//         console.log(`🔄 ITERATION ${state.currentIteration}`);
//         console.log('='.repeat(80));

//         // Start iteration timer
//         const iterationStart = Date.now();

//         // SAFETY CHECK BEFORE ITERATION
//         const safetyCheck = this.safetyGuards.checkBeforeIteration(state);
//         if (!safetyCheck.safe) {
//           console.log(`\n⛔ Safety check failed: ${safetyCheck.reason}`);
//           state.status = 'stopped';
//           state.error = safetyCheck.reason;
//           const iterDuration = Date.now() - iterationStart;
//           console.log(`⏱️ Iteration ${state.currentIteration} took ${iterDuration}ms (stopped on safety)`);
//           break;
//         }

//         // STEP 1: THINK
//         console.log('\n💭 THINKING...');
//         const action = await this.think(state);
        
//         if (!action) {
//           state.status = 'failed';
//           state.error = 'Failed to get valid action from agent';
//           const iterDuration = Date.now() - iterationStart;
//           console.log(`⏱️ Iteration ${state.currentIteration} took ${iterDuration}ms (no action)`);
//           break;
//         }

//         console.log(`   Reasoning: ${action.reasoning}`);
//         console.log(`   Action: ${action.action}`);
//         console.log(`   Parameters:`, JSON.stringify(action.parameters, null, 2));

//         // Check if agent wants to finish
//         // Check if agent wants to finish
// if (action.action === 'finish') {
//   console.log('\n✅ Agent decided task is complete');
  
//   // VALIDATION: Ensure finish has required parameters
//   if (!action.parameters.result || typeof action.parameters.result !== 'string') {
//     console.log('⚠️  Warning: finish called without result parameter, using default');
//     action.parameters.result = 'Task completed';
//   }
  
//   if (!action.parameters.mode || !['discovery', 'route'].includes(action.parameters.mode)) {
//     console.log('⚠️  Warning: finish called without valid mode, defaulting to discovery');
//     action.parameters.mode = 'discovery';
//   }
  
//   // For route mode, ensure selected_venues exists
//   if (action.parameters.mode === 'route' && !Array.isArray(action.parameters.selected_venues)) {
//     console.log('⚠️  Warning: route mode finish without selected_venues array, setting empty array');
//     action.parameters.selected_venues = [];
//   }
  
//   console.log(`📋 Finish parameters validated:`, {
//     hasResult: !!action.parameters.result,
//     mode: action.parameters.mode,
//     selectedVenuesCount: action.parameters.selected_venues?.length || 0
//   });
  
//   // Store finish parameters in state
//   state.finalResult = action.parameters.result;
//   state.finishParameters = {
//     result: action.parameters.result,
//     mode: action.parameters.mode as 'discovery' | 'route',
//     selected_venue_ids: action.parameters.selected_venues || []
//   };
//   state.status = 'complete';
//   const iterDuration = Date.now() - iterationStart;
//   console.log(`⏱️ Iteration ${state.currentIteration} took ${iterDuration}ms (finish)`);
//   break;
// }

//         // SAFETY CHECK BEFORE ACTION (NOW PASSES PARAMETERS!)
//         const actionSafetyCheck = this.safetyGuards.checkBeforeAction(
//           action.action, 
//           state,
//           action.parameters  // ← NEW: Pass parameters for context-aware checking
//         );
//         if (!actionSafetyCheck.safe) {
//           console.log(`\n⛔ Action safety check failed: ${actionSafetyCheck.reason}`);
//           state.status = 'stopped';
//           state.error = actionSafetyCheck.reason;
//           const iterDuration = Date.now() - iterationStart;
//           console.log(`⏱️ Iteration ${state.currentIteration} took ${iterDuration}ms (action safety)`);
//           break;
//         }

//         // STEP 2: ACT
//         console.log('\n⚡ ACTING...');
//         state.status = 'acting';
//         const result = await this.act(action, state);
        
//         console.log(`   Success: ${result.success}`);
//         if (result.success) {
//           console.log(`   Data: ${JSON.stringify(result.data).substring(0, 200)}...`);
//         } else {
//           console.log(`   Error: ${result.error}`);
//         }

//         // STEP 3: OBSERVE
//         console.log('\n👁️  OBSERVING...');
//         state.status = 'observing';
//         this.observe(action.action, result, state);
        
//         console.log(`   Added observation to conversation history`);
//         console.log(`   Total messages: ${state.conversationHistory.length}`);
//         console.log(`   Total tokens used: ${state.totalTokensUsed}`);

//         // End of iteration timing
//         const iterDuration = Date.now() - iterationStart;
//         console.log(`⏱️ Iteration ${state.currentIteration} took ${iterDuration}ms`);
//       }

//       // Calculate metrics
//       const executionTime = Date.now() - state.startTime;
      
//       console.log('\n' + '='.repeat(80));
//       console.log('📊 EXECUTION SUMMARY');
//       console.log('='.repeat(80));
//       console.log(`Status: ${state.status}`);
//       console.log(`Iterations: ${state.currentIteration}`);
//       console.log(`Execution time: ${executionTime}ms`);
//       console.log(`Total tokens: ${state.totalTokensUsed}`);
//       console.log(`Actions executed: ${state.toolResults.length}`);
      
//       if (state.status === 'stopped') {
//         console.log(`⛔ Stopped reason: ${state.error}`);
//       }
      
//       console.log('='.repeat(80) + '\n');

//       // Determine stopped reason
//       let stoppedReason: ReActResponse['stoppedReason'];
//       if (state.status === 'complete') {
//         stoppedReason = 'completed';
//       } else if (state.status === 'stopped') {
//         if (state.error?.includes('iteration')) stoppedReason = 'max_iterations';
//         else if (state.error?.includes('token')) stoppedReason = 'token_limit';
//         else if (state.error?.includes('consecutive') || state.error?.includes('pattern')) {
//           stoppedReason = 'repetition_detected';
//         }
//       } else if (state.status === 'failed') {
//         stoppedReason = 'error';
//       }

//       return {
//         success: state.status === 'complete',
//         result: state.finalResult,
//         state,
//         iterations: state.currentIteration,
//         tokensUsed: state.totalTokensUsed,
//         executionTimeMs: executionTime,
//         stoppedReason,
//         error: state.error
//       };

//     } catch (error) {
//       console.error('\n❌ Fatal error:', error);

//       const executionTime = Date.now() - state.startTime;

//       return {
//         success: false,
//         state,
//         iterations: state.currentIteration,
//         tokensUsed: state.totalTokensUsed,
//         executionTimeMs: executionTime,
//         stoppedReason: 'error',
//         error: error instanceof Error ? error.message : 'Unknown error'
//       };
//     } finally {
//       try { stopCapture(`Status: ${state.status}\nIterations: ${state.currentIteration}\nTotalTokens: ${state.totalTokensUsed}\nExecutionTimeMs: ${Date.now() - state.startTime}`); } catch (e) {}
//     }
//   }

//   /**
//    * THINK: Agent reasons about what to do next
//    */
//   private async think(state: AgentState): Promise<AgentAction | null> {
//     try {
//       const toolDefinitions = toolRegistry.getToolDefinitions();
      
//       const actionParametersDescription = toolDefinitions.map(tool => {
//         const props = Object.entries(tool.parameters.properties)
//           .map(([name, def]: [string, any]) => `    - ${name}: ${def.description}`)
//           .join('\n');
//         return `  ${tool.name}:\n${props}`;
//       }).join('\n\n');

//       const response = await openai.chat.completions.create({
//         model: 'gpt-5-mini',
//         reasoning_effort: 'low',  // ← ADD THIS LINE (or 'medium' for balance)
//         messages: state.conversationHistory as any,
//         functions: [
//           {
//             name: 'execute_action',
//             description: `Execute an action based on your reasoning.

// Available actions and their parameters:

// ${actionParametersDescription}

// finish:
//     - result (REQUIRED): The final formatted route/discovery text to show the user
//     - mode (REQUIRED): "discovery" or "route"
//     - selected_venues (REQUIRED for route mode): Array of placeIds for selected venues in order [placeId1, placeId2, placeId3...]`,
//     parameters: {
//       type: 'object',
//       properties: {
//         reasoning: {
//           type: 'string',
//           description: 'Your reasoning for this action'
//         },
//         action: {
//           type: 'string',
//           enum: ['search_venues', 'search_events','batch_search_venues', 'validate_availability', 'finish'],
//           description: 'The action to take'
//         },
//         parameters: {
//           type: 'object',
//           description: 'Parameters for the action. For finish action, MUST include: result (string), mode (discovery/route), and selected_venues (array of placeIds for route mode)',
//           properties: {},
//           additionalProperties: true
//         }
//       },
//       required: ['reasoning', 'action', 'parameters']
//     }
//   }        ],
//         function_call: { name: 'execute_action' }
//       });

//       // Track tokens
//       if (response.usage) {
//         state.totalTokensUsed += response.usage.total_tokens;
//       }

//       const functionCall = response.choices[0]?.message?.function_call;
//       if (!functionCall || !functionCall.arguments) {
//         return null;
//       }

//       const action: AgentAction = JSON.parse(functionCall.arguments);
      
//       if (!action.parameters) {
//         action.parameters = {};
//       }
      
//       // Add assistant's reasoning to conversation
//       state.conversationHistory.push({
//         role: 'assistant',
//         content: `Reasoning: ${action.reasoning}\nAction: ${action.action}\nParameters: ${JSON.stringify(action.parameters)}`,
//         timestamp: Date.now(),
//         iteration: state.currentIteration
//       });

//       return action;

//     } catch (error) {
//       console.error('Think error:', error);
//       return null;
//     }
//   }

//   /**
//    * ACT: Execute the chosen action
//    */
//   private async act(action: AgentAction, state: AgentState): Promise<ToolResultType> {
//     try {
//       const result = await toolRegistry.executeTool(
//         action.action,
//         action.parameters,
//         {
//           iteration: state.currentIteration,
//           timestamp: Date.now(),
//           previousResults: state.toolResults
//         }
//       );

//       const toolResult: any = {
//         action: action.action,
//         success: result.success,
//         data: result.data,
//         error: result.error,
//         timestamp: Date.now(),
//         iteration: state.currentIteration
//       };

//       state.toolResults.push(toolResult);
//       return result;

//     } catch (error) {
//       const errorResult: ToolResultType = {
//         success: false,
//         error: error instanceof Error ? error.message : 'Unknown error'
//       };

//       state.toolResults.push({
//         action: action.action,
//         success: false,
//         error: errorResult.error,
//         timestamp: Date.now(),
//         iteration: state.currentIteration
//       });

//       return errorResult;
//     }
//   }

//   /**
//    * OBSERVE: Add tool result to conversation
//    */
//   private observe(actionName: ActionType, result: ToolResultType, state: AgentState): void {
//     const observation = result.success
//       ? `Action '${actionName}' succeeded. Result: ${JSON.stringify(result.data)}`
//       : `Action '${actionName}' failed. Error: ${result.error}`;

//     state.conversationHistory.push({
//       role: 'user',
//       content: `OBSERVATION: ${observation}`,
//       timestamp: Date.now(),
//       iteration: state.currentIteration
//     });
//   }

//   /**
//    * System prompt - NOW WITH ROUTE PLANNING GUIDANCE
//    */
// /**
//  * Complete System prompt for ReAct Agent - Updated with duplicate chain venue handling
//  */
// private getSystemPrompt(userLocation?: { lat: number; lng: number; name: string }): string {
//     const toolDefinitions = toolRegistry.getToolDefinitions();
  
//   const locationContext = userLocation 
//   ? `\n**USER'S CURRENT LOCATION:**
// Location: ${userLocation.name}
// Coordinates: ${userLocation.lat}, ${userLocation.lng}

// When the user says "near me", "nearest", "nearby", or "close", use these coordinates:
// - Use near_coordinates parameter: "${userLocation.lat},${userLocation.lng}"
// - Use radius: "2 miles" for "nearby", "5 miles" for general area searches
// - For "nearest X", always use coordinate-based search with small radius (0.5-1 mile)

// Example: "nearest Whole Foods" → search_venues(query="Whole Foods", near_coordinates="${userLocation.lat},${userLocation.lng}", radius="1 mile")\n`
//   : `\n**USER'S CURRENT LOCATION:** Not provided. For "near me" queries, use broad location search or ask user for location.\n`;

//   const toolDescriptions = toolDefinitions
//     .map(tool => {
//       const params = Object.entries(tool.parameters.properties)
//         .map(([name, def]: [string, any]) => {
//           const required = tool.parameters.required.includes(name) ? '(required)' : '(optional)';
//           return `   • ${name} ${required}: ${def.description}`;
//         })
//         .join('\n');
      
//       return `${tool.name}\n${params}`;
//     })
//     .join('\n\n');

//   return `You are PLANMATE, a location search and route planning assistant using ReAct reasoning (Think → Act → Observe).
// ${locationContext}

// Your mission: Help users find venues and plan routes between multiple locations using real Google Places data.

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 🎯 TWO MODES
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

// MODE 1 — DISCOVERY (Find Venues)
// Triggers like: "Find…", "Show me…", "Where are…", "Best…", "Search for…"

// Strategy:
// - ONE search_venues call only
// - Return top 10 results maximum if not mentioned
// - DO NOT calculate distances
// - DO NOT optimize geography
// - Just give them a clean list of options

// Output format:
// - List all venues with name, address, rating
// - Mention more options exist
// - Keep it simple

// Example: "find pharmacies downtown"
// → Search once for pharmacies
// → Return top 10
// → Done


// MODE 2 — ROUTE PLANNING (Connect Multiple Locations)
// Triggers like: "Route from…", "Path from… to… via…", "Plan route…", "How to get from…"

// Strategy - USE BATCH SEARCH FOR SPEED:
// 1. **CRITICAL: Identify ALL waypoints in your first reasoning step**
//    - Extract every location mentioned: A, B, C, D...
//    - Determine location context for each (street, neighborhood, city)
   
// 2. **Use batch_search_venues to find ALL venues at once** (MUCH FASTER!)
//    - ONE tool call for all waypoints
//    - Format: [{"query":"Starbucks","location":"Newbury Street, Boston"},{"query":"Harvard","location":"Cambridge"}...]
//    - Google searches happen in parallel (saves 30-60 seconds!)
   
// 3. **Select ONE primary venue from each search result**
//    - Track the placeId of each selected venue
//    - Use selection criteria (main location, correct address, highest rating)
   
// 4. **Skip distance calculations** - frontend will calculate real walking routes

// 5. **Call finish immediately with:**
//    - result: formatted text
//    - mode: "route"
//    - selected_venues: [placeId1, placeId2, placeId3...]
// **BATCH SEARCH FORMAT:**
// For "route from Starbucks on Newbury to Harvard to MIT":
// batch_search_venues({
// "searches": [
// {"query": "Starbucks", "location": "Newbury Street, Boston", "limit": 5},
// {"query": "Harvard University", "location": "Cambridge, MA", "limit": 3},
// {"query": "MIT", "location": "Cambridge, MA", "limit": 3}
// ]
// })

// **WHEN TO USE batch_search_venues vs search_venues:**
// - Route with 2+ waypoints → USE batch_search_venues (faster!)
// - Single venue search → USE search_venues
// - Discovery mode (find multiple cafes) → USE search_venues


// **CRITICAL: EXTRACTING placeIds**
// When you search for venues, the API returns results like this:
// {
//   "venues": [
//     {
//       "name": "Starbucks",
//       "address": "350 Newbury St, Boston, MA 02115",
//       "placeId": "ChIJGfaNNgV644kRs3H9Ig2WDJI",  // ← THIS IS WHAT YOU NEED
//       ...
//     }
//   ]
// }

// YOU MUST:
// - Look at the OBSERVATION after each search_venues call
// - Find the venue you selected
// - Extract its EXACT placeId from the search result
// - Store that placeId for the finish call
// - DO NOT make up or guess placeIds
// - DO NOT use placeIds from previous searches or memory

// EXAMPLE:
// If search returns: "Tatte" at "160 Massachusetts Ave" with placeId "ChIJ4TN6r5B744kR0NyN-spvs3c"
// YOU MUST USE: "ChIJ4TN6r5B744kR0NyN-spvs3c" (exactly as returned)

// **CRITICAL: WAYPOINT SELECTION**
// When user mentions a location like "MIT", "Harvard", "MFA":
// - Search will return MULTIPLE venues (MIT Museum, MIT Labs, MIT Campus, etc.)
// - YOU must select the PRIMARY/MAIN location
// - Look for:
//   - Official institutional names (not departments)
//   - Highest ratings from authoritative sources
//   - Most generic name (not specific buildings)
//   - Keywords: "main campus", "headquarters", "official"

// **For chain stores (Starbucks, Trader Joe's, Whole Foods):**
// - Look at addresses carefully
// - Match the area user specified (e.g., "in Back Bay" → pick the one with Back Bay zip or nearest to Back Bay center)
// - If user said "on Newbury Street" → ONLY pick venues with "Newbury St" in address
// - If user said "near Fenway" → pick closest to Fenway Park coordinates
// - Use geographic logic, not just first result

// Examples:
// ✅ GOOD: "Massachusetts Institute of Technology" (main campus)
// ❌ BAD: "MIT Museum" (sub-location)

// ✅ GOOD: "Museum of Fine Arts, Boston" (main museum)
// ❌ BAD: "MFA Gift Shop" (sub-location)

// ✅ GOOD: "Trader Joe's" at 500 Boylston St (when user said "Back Bay")
// ❌ BAD: "Trader Joe's" at 899 Boylston St (when user said "Back Bay", if 500 is actually in Back Bay)

// **HANDLING DUPLICATE CHAIN VENUES (Dunkin', Starbucks, etc.)**
// When multiple venues with SAME NAME appear (e.g., "Dunkin'" near Northeastern):
// - Search returns several Dunkin' locations with different addresses
// - YOU must select the one CLOSEST to the reference point
// - Calculate which address is geographically nearest to user's context
// - Look at street names/neighborhoods in addresses
// - Consider which one makes most sense in the route

// Example: "Dunkin near Northeastern"
// Search returns:
// 1. Dunkin' - 360 Huntington Ave (ON Northeastern campus)
// 2. Dunkin' - 1234 Mass Ave (1 mile away)
// 3. Dunkin' - 567 Boylston St (2 miles away)

// ✅ SELECT: #1 (360 Huntington Ave) - closest to Northeastern

// **For route queries:** If waypoint is "Dunkin near X", select the Dunkin closest to X's coordinates

// **SEARCH STRATEGY FOR ROUTES:**
// Do NOT use near_coordinates or radius for route queries.
// Each waypoint search should be independent and broad.

// Example workflow for "route from MIT to Harvard via Kendall":
// 1. search_venues(query: "MIT", location: "Cambridge, MA")
//    → Returns 10 MIT venues
//    → SELECT: "Massachusetts Institute of Technology" at 77 Mass Ave
   
// 2. search_venues(query: "Kendall Square", location: "Cambridge, MA")
//    → Returns 5 Kendall venues
//    → SELECT: "Kendall Square" main plaza
   
// 3. search_venues(query: "Harvard", location: "Cambridge, MA")
//    → Returns 10 Harvard venues
//    → SELECT: "Harvard University" main campus

// 4. calculate_distance(MIT → Kendall)
// 5. calculate_distance(Kendall → Harvard)
// 6. finish with route showing ONLY 3 selected venues

// **LOCATION HANDLING:**
// - If user specifies city/area in prompt → use it
// - If no location specified → use broad search or ask user
// - DO NOT force "Boston" if user doesn't mention it
// - Let search_venues handle location intelligently

// Output format:
// ### 🗺️ Route: [A] → [B] → [C]

// **1. Start: [Venue Name]**
//    - Address: [full address]
//    - Rating: [X★]
//    - placeId: [Google Places ID]
//    - Why selected: [if multiple results, explain selection]

// **2. Stop: [Venue Name]**
//    - Address: [full address]
//    - Rating: [X★]
//    - placeId: [Google Places ID]
//    - Why selected: [if multiple results, explain selection]

// **3. End: [Venue Name]**
//    - Address: [full address]
//    - Rating: [X★]
//    - placeId: [Google Places ID]

// Note: Distances and walking times will be calculated and displayed on the map.

// **THEN CALL FINISH LIKE THIS:**
// {
//   "result": "[the formatted text above]",
//   "mode": "route",
//   "selected_venues": ["placeId_from_venue_1", "placeId_from_venue_2", "placeId_from_venue_3"]
// }
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 🔄 REACT LOOP PROCESS
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

// THINK → 
//   • What mode is this query? (discovery or route)
//   • How many waypoints mentioned?
//   • What searches do I need?
//   • For routes: which venue is the PRIMARY one?
//   • For duplicates: which location is CLOSEST to reference point?

// ACT → Execute ONE tool per iteration:
//   • search_venues (broad search, no radius filtering)
//   • calculate_distance (between selected venues)
//   • finish (with structured output)
  
// OBSERVE → 
//   • Extract all venues from search results
//   • Identify primary venue for each waypoint
//   • For chain venues: identify closest location
//   • Check if I have all needed data
//   • Decide: continue searching or finish?

// REPEAT → Until you have everything needed

// FINISH → 
//   Present results with:
//   • mode: "discovery" or "route"
//   • selected_venues: [array of placeIds] (only for route mode)
//   • result: formatted text output

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 🛠️ AVAILABLE TOOLS
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

// ${toolDescriptions}

// finish:
//    • result (required): Your final output
//    • mode (required): "discovery" or "route"
//    • selected_venues (optional): Array of placeIds for route waypoints

// **IMPORTANT TOOL NOTES:**

// search_venues:
// - Use for single venue searches or discovery mode
// - Use location from user's prompt if specified
// - Returns up to 10 venues

// batch_search_venues:
// - **USE THIS FOR ROUTES WITH 2+ WAYPOINTS** (much faster!)
// - Searches happen in parallel (saves 30-60 seconds)
// - Format: JSON array of search objects
// - Each search needs: query, location, optional limit
// - Returns all results grouped by search
// - Maximum 10 searches per batch

// finish:
// - ALWAYS include mode field ("discovery" or "route")
// - ALWAYS include result field (formatted text)
// - For route mode: ALWAYS include selected_venues array with placeIds
// - For discovery mode: selected_venues should be empty array []

// **FINISH PARAMETER FORMAT:**
// When calling finish for a ROUTE, use this exact format:
// {
//   "result": "### 🗺️ Route: Starbucks → Whole Foods → Trader Joe's\n\n**1. Start: Starbucks**\n...",
//   "mode": "route",
//   "selected_venues": ["placeId_of_starbucks", "placeId_of_whole_foods", "placeId_of_traders"]
// }

// When calling finish for DISCOVERY, use this format:
// {
//   "result": "I found 5 coffee shops near you:\n\n1. Starbucks - 4.2★...",
//   "mode": "discovery", 
//   "selected_venues": []
// }
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// ✅ QUALITY STANDARDS
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

// - Use real API data only (never fabricate)
// - Be efficient - minimize tool calls
// - For routes: select ONE primary venue per waypoint
// - For chain venues: select the CLOSEST location to reference point
// - Explain selection reasoning when multiple options exist
// - Always finish with complete, actionable information

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// ❌ NEVER DO
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

// - Don't calculate distances (frontend handles this with real data)
// - Don't use near_coordinates for route planning
// - Don't list ALL search results in route output
// - Don't use sub-locations when user wants main location
// - Don't select far chain venues when closer ones exist
// - Don't force "Boston" if user doesn't mention it
// - Don't do 3+ consecutive searches without calculate_distance between them

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

// Think step-by-step, select primary venues intelligently, handle duplicates by proximity, and create clear, actionable results!`;
// }
// }


// backend/services/react-agent.ts

// backend/services/react-agent.ts

import OpenAI from 'openai';
import dotenv from 'dotenv';
import { startCapture } from './logger.js';
dotenv.config();
import type {
  AgentState,
  AgentAction,
  ReActResponse,
  SafetyConfig,
  ConversationMessage,
  ActionType
} from '../types/react-agent.js';
import type { ToolResult as ToolResultType } from '../types/tools.js';
import { SafetyGuards } from './safety-guards.js';
import { DEFAULT_SAFETY_CONFIG } from '../types/react-agent.js';
import { toolRegistry } from './tools/tool-registry.js';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

/**
 * Core ReAct Agent Engine
 * Implements: Think → Act → Observe loop with safety mechanisms
 */
export class ReActAgent {
  private safetyGuards: SafetyGuards;
  private config: SafetyConfig;

  constructor(config: SafetyConfig = DEFAULT_SAFETY_CONFIG) {
    this.config = config;
    this.safetyGuards = new SafetyGuards(config);
  }

  /**
   * Main execution loop
   */
  async execute(
    userPrompt: string, 
    userLocation?: { lat: number; lng: number; name: string }
  ): Promise<ReActResponse> {
    console.log('\n🚀 Starting ReAct Agent...');
    console.log(`📝 User Prompt: "${userPrompt}"`);
    if (userLocation) {
      console.log(`📍 User Location: ${userLocation.name} (${userLocation.lat}, ${userLocation.lng})`);
    }
    console.log('');

    // Initialize state
    const state: AgentState = {
      status: 'thinking',
      currentIteration: 0,
      startTime: Date.now(),
      totalTokensUsed: 0,
      conversationHistory: [
        {
          role: 'system',
          content: this.getSystemPrompt(userLocation),
          timestamp: Date.now()
        },
        {
          role: 'user',
          content: userPrompt,
          timestamp: Date.now()
        }
      ],
      toolResults: []
    };

    const stopCapture = startCapture(userPrompt);
    try {
      // Execute ReAct loop
      while (state.status !== 'complete' && state.status !== 'failed' && state.status !== 'stopped') {
        state.currentIteration++;
        
        console.log(`\n${'='.repeat(80)}`);
        console.log(`🔄 ITERATION ${state.currentIteration}`);
        console.log('='.repeat(80));

        const iterationStart = Date.now();

        // SAFETY CHECK BEFORE ITERATION
        const safetyCheck = this.safetyGuards.checkBeforeIteration(state);
        if (!safetyCheck.safe) {
          console.log(`\n⛔ Safety check failed: ${safetyCheck.reason}`);
          state.status = 'stopped';
          state.error = safetyCheck.reason;
          console.log(`⏱️ Iteration ${state.currentIteration} took ${Date.now() - iterationStart}ms (stopped)`);
          break;
        }

        // STEP 1: THINK
        console.log('\n💭 THINKING...');
        const action = await this.think(state);
        
        if (!action) {
          state.status = 'failed';
          state.error = 'Failed to get valid action from agent';
          console.log(`⏱️ Iteration ${state.currentIteration} took ${Date.now() - iterationStart}ms (failed)`);
          break;
        }

        console.log(`   Reasoning: ${action.reasoning}`);
        console.log(`   Action: ${action.action}`);
        console.log(`   Parameters:`, JSON.stringify(action.parameters, null, 2));

        // Check if agent wants to finish
        if (action.action === 'finish') {
          console.log('\n✅ Agent decided task is complete');
          
          // VALIDATION: Ensure finish has required parameters
          if (!action.parameters.result || typeof action.parameters.result !== 'string') {
            console.log('⚠️  Warning: finish called without result parameter, using default');
            action.parameters.result = 'Task completed';
          }
          
          if (!action.parameters.mode || !['discovery', 'route'].includes(action.parameters.mode)) {
            console.log('⚠️  Warning: finish called without valid mode, defaulting to discovery');
            action.parameters.mode = 'discovery';
          }
          
          // For route mode, ensure selected_venues exists
          if (action.parameters.mode === 'route' && !Array.isArray(action.parameters.selected_venues)) {
            console.log('⚠️  Warning: route mode finish without selected_venues array, setting empty array');
            action.parameters.selected_venues = [];
          }
          
          console.log(`📋 Finish parameters validated:`, {
            hasResult: !!action.parameters.result,
            mode: action.parameters.mode,
            selectedVenuesCount: action.parameters.selected_venues?.length || 0
          });
          
          // Store finish parameters in state
          state.finalResult = action.parameters.result;
          state.finishParameters = {
            result: action.parameters.result,
            mode: action.parameters.mode as 'discovery' | 'route',
            selected_venue_ids: action.parameters.selected_venues || []
          };
          
          state.status = 'complete';
          console.log(`⏱️ Iteration ${state.currentIteration} took ${Date.now() - iterationStart}ms (finish)`);
          break;
        }

        // SAFETY CHECK BEFORE ACTION
        const actionSafetyCheck = this.safetyGuards.checkBeforeAction(
          action.action, 
          state,
          action.parameters
        );
        if (!actionSafetyCheck.safe) {
          console.log(`\n⛔ Action safety check failed: ${actionSafetyCheck.reason}`);
          state.status = 'stopped';
          state.error = actionSafetyCheck.reason;
          console.log(`⏱️ Iteration ${state.currentIteration} took ${Date.now() - iterationStart}ms (safety)`);
          break;
        }

        // STEP 2: ACT
        console.log('\n⚡ ACTING...');
        state.status = 'acting';
        const result = await this.act(action, state);
        
        console.log(`   Success: ${result.success}`);
        if (result.success) {
          console.log(`   Data: ${JSON.stringify(result.data).substring(0, 200)}...`);
        } else {
          console.log(`   Error: ${result.error}`);
        }

        // STEP 3: OBSERVE
        console.log('\n👁️  OBSERVING...');
        state.status = 'observing';
        this.observe(action.action, result, state);
        
        console.log(`   Added observation to conversation history`);
        console.log(`   Total messages: ${state.conversationHistory.length}`);
        console.log(`   Total tokens used: ${state.totalTokensUsed}`);
        console.log(`⏱️ Iteration ${state.currentIteration} took ${Date.now() - iterationStart}ms`);
      }

      // Calculate metrics
      const executionTime = Date.now() - state.startTime;
      
      console.log('\n' + '='.repeat(80));
      console.log('📊 EXECUTION SUMMARY');
      console.log('='.repeat(80));
      console.log(`Status: ${state.status}`);
      console.log(`Iterations: ${state.currentIteration}`);
      console.log(`Execution time: ${executionTime}ms`);
      console.log(`Total tokens: ${state.totalTokensUsed}`);
      console.log(`Actions executed: ${state.toolResults.length}`);
      
      if (state.status === 'stopped') {
        console.log(`⛔ Stopped reason: ${state.error}`);
      }
      
      console.log('='.repeat(80) + '\n');

      // Determine stopped reason
      let stoppedReason: ReActResponse['stoppedReason'];
      if (state.status === 'complete') {
        stoppedReason = 'completed';
      } else if (state.status === 'stopped') {
        if (state.error?.includes('iteration')) stoppedReason = 'max_iterations';
        else if (state.error?.includes('token')) stoppedReason = 'token_limit';
        else if (state.error?.includes('consecutive') || state.error?.includes('pattern')) {
          stoppedReason = 'repetition_detected';
        }
      } else if (state.status === 'failed') {
        stoppedReason = 'error';
      }

      return {
        success: state.status === 'complete',
        result: state.finalResult,
        state,
        iterations: state.currentIteration,
        tokensUsed: state.totalTokensUsed,
        executionTimeMs: executionTime,
        stoppedReason,
        error: state.error
      };

    } catch (error) {
      console.error('\n❌ Fatal error:', error);

      const executionTime = Date.now() - state.startTime;

      return {
        success: false,
        state,
        iterations: state.currentIteration,
        tokensUsed: state.totalTokensUsed,
        executionTimeMs: executionTime,
        stoppedReason: 'error',
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    } finally {
      try { stopCapture(`Status: ${state.status}\nIterations: ${state.currentIteration}\nTotalTokens: ${state.totalTokensUsed}\nExecutionTimeMs: ${Date.now() - state.startTime}`); } catch (e) {}
    }
  }

  /**
   * THINK: Agent reasons about what to do next
   */
  private async think(state: AgentState): Promise<AgentAction | null> {
    try {
      const toolDefinitions = toolRegistry.getToolDefinitions();
      
      const actionParametersDescription = toolDefinitions.map(tool => {
        const props = Object.entries(tool.parameters.properties)
          .map(([name, def]: [string, any]) => `    - ${name}: ${def.description}`)
          .join('\n');
        return `  ${tool.name}:\n${props}`;
      }).join('\n\n');

      const response = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        temperature: 0,
        messages: state.conversationHistory as any,
        functions: [
          {
            name: 'execute_action',
            description: `Execute an action based on your reasoning.

Available actions and their parameters:

${actionParametersDescription}

finish:
    - result (REQUIRED): The final formatted route/discovery text to show the user
    - mode (REQUIRED): "discovery" or "route"
    - selected_venues (REQUIRED for route mode): Array of placeIds for selected venues in order [placeId1, placeId2, placeId3...]`,
            parameters: {
              type: 'object',
              properties: {
                reasoning: {
                  type: 'string',
                  description: 'Your reasoning for this action'
                },
                action: {
                  type: 'string',
                  enum: ['search_venues', 'search_events','batch_search_venues', 'validate_availability', 'finish'],
                  description: 'The action to take'
                },
                parameters: {
                  type: 'object',
                  description: 'Parameters for the action. For finish action, MUST include: result (string), mode (discovery/route), and selected_venues (array of placeIds for route mode)',
                  properties: {},
                  additionalProperties: true
                }
              },
              required: ['reasoning', 'action', 'parameters']
            }
          }
        ],
        function_call: { name: 'execute_action' }
      });

      // Track tokens
      if (response.usage) {
        state.totalTokensUsed += response.usage.total_tokens;
      }

      const functionCall = response.choices[0]?.message?.function_call;
      if (!functionCall || !functionCall.arguments) {
        return null;
      }

      const action: AgentAction = JSON.parse(functionCall.arguments);
      
      if (!action.parameters) {
        action.parameters = {};
      }
      
      // Add assistant's reasoning to conversation
      state.conversationHistory.push({
        role: 'assistant',
        content: `Reasoning: ${action.reasoning}\nAction: ${action.action}\nParameters: ${JSON.stringify(action.parameters)}`,
        timestamp: Date.now(),
        iteration: state.currentIteration
      });

      return action;

    } catch (error) {
      console.error('Think error:', error);
      return null;
    }
  }

  /**
   * ACT: Execute the chosen action
   */
  private async act(action: AgentAction, state: AgentState): Promise<ToolResultType> {
    try {
      const result = await toolRegistry.executeTool(
        action.action,
        action.parameters,
        {
          iteration: state.currentIteration,
          timestamp: Date.now(),
          previousResults: state.toolResults
        }
      );

      const toolResult: any = {
        action: action.action,
        success: result.success,
        data: result.data,
        error: result.error,
        timestamp: Date.now(),
        iteration: state.currentIteration
      };

      state.toolResults.push(toolResult);
      return result;

    } catch (error) {
      const errorResult: ToolResultType = {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };

      state.toolResults.push({
        action: action.action,
        success: false,
        error: errorResult.error,
        timestamp: Date.now(),
        iteration: state.currentIteration
      });

      return errorResult;
    }
  }

  /**
   * OBSERVE: Add tool result to conversation
   * OPTIMIZED: Compress observations to reduce token usage by 80%
   */
  private observe(actionName: ActionType, result: ToolResultType, state: AgentState): void {
    let observation: string;
    
    if (!result.success) {
      observation = `Action '${actionName}' failed. Error: ${result.error}`;
    } else {
      // Compress observations based on action type
      switch (actionName) {
        case 'batch_search_venues':
          // Batch: Compact format with essential data
          const batchResults = result.data?.results || [];
          const compactSummary = batchResults.map((r: any) => {
            if (!r.success || !r.venues || r.venues.length === 0) {
              return `${r.query}:0`;
            }
            // Format: name|address|placeId|rating
            const venueList = r.venues.map((v: any) => 
              `${v.name}|${v.address}|${v.placeId}|${v.rating || 'N/A'}★`
            ).join(';');
            return `${r.query}(${r.count}):[${venueList}]`;
          }).join(' || ');
          observation = `Batch: ${compactSummary}`;
          break;

        case 'search_venues':
          // Single search: Compact venue list
          const venues = result.data?.venues || [];
          if (venues.length === 0) {
            observation = `Found 0 venues for "${result.data?.query}"`;
          } else {
            const venueList = venues.map((v: any) => 
              `${v.name}|${v.address}|${v.placeId}|${v.rating || 'N/A'}★`
            ).join(';');
            observation = `Found ${venues.length}: [${venueList}]`;
          }
          break;

        case 'search_events':
          // Events: Compact list
          const events = result.data?.events || [];
          if (events.length === 0) {
            observation = `Found 0 events`;
          } else {
            const eventList = events.map((e: any) => 
              `${e.name}|${e.venue.name}|${e.date}`
            ).slice(0, 10).join(';');
            observation = `Found ${events.length} events: [${eventList}]`;
          }
          break;

        default:
          // Other actions: keep as is
          observation = `Action '${actionName}' succeeded. Result: ${JSON.stringify(result.data)}`;
      }
    }

    state.conversationHistory.push({
      role: 'user',
      content: `OBSERVATION: ${observation}`,
      timestamp: Date.now(),
      iteration: state.currentIteration
    });
  }

  /**
   * System prompt - OPTIMIZED for speed without losing quality
   */
  private getSystemPrompt(userLocation?: { lat: number; lng: number; name: string }): string {
    const toolDefinitions = toolRegistry.getToolDefinitions();
    
    // Build location context
    const locationContext = userLocation 
      ? `USER LOCATION: ${userLocation.name} (${userLocation.lat}, ${userLocation.lng})
For "near me/nearest/nearby": use near_coordinates="${userLocation.lat},${userLocation.lng}" with radius 0.5-2 miles\n`
      : `USER LOCATION: Not provided. For "near me" queries, use broad location search unless near some place is mentioned.\n`;

    const toolDescriptions = toolDefinitions
      .map(tool => {
        const params = Object.entries(tool.parameters.properties)
          .map(([name, def]: [string, any]) => {
            const required = tool.parameters.required.includes(name) ? '(required)' : '(optional)';
            return `  • ${name} ${required}: ${def.description}`;
          })
          .join('\n');
        
        return `${tool.name}\n${params}`;
      })
      .join('\n\n');

    return `You are PLANMATE, a route planning assistant using ReAct (Think→Act→Observe).

${locationContext}
=== MODES ===

1. DISCOVERY: Single search, return top 10 venues, mode="discovery"
   - Use search_venues once
   - List all results with name, address, rating
   
2. ROUTE: Batch search all waypoints, select primary venues, mode="route"
   - Use batch_search_venues for 2+ waypoints (MUCH faster!)
   - Select ONE primary venue per waypoint
   - Track exact placeId from results
   - Skip distance calculations (frontend handles)

=== BATCH SEARCH (For Routes) ===

Format: batch_search_venues({"searches":[{"query":"X","location":"Y","limit":5},...]})

Example: "route MIT to Harvard to BU"
→ batch_search_venues([{query:"MIT",location:"Cambridge"},{query:"Harvard",location:"Cambridge"},{query:"BU",location:"Boston"}])
→ Select primary from each result
→ finish({result:"...", mode:"route", selected_venues:[placeId1,placeId2,placeId3]})

=== VENUE SELECTION ===

- Extract EXACT placeId from observation (don't guess)
- Pick main location not sub-buildings (MIT campus not MIT Museum)
- For chains: match user's area context ("in Back Bay" → check address has Back Bay zip)
- For "near X": pick closest to X's location

Examples:
✅ "Massachusetts Institute of Technology" (main campus)
❌ "MIT Museum" (sub-location)
✅ Trader Joe's at 500 Boylston when user said "Back Bay"
❌ Trader Joe's at 899 Boylston when user said "Back Bay"

=== TOOLS ===

${toolDescriptions}

finish:
  • result (required): Formatted text output
  • mode (required): "discovery" or "route"
  • selected_venues (required for route): Array of placeIds

=== FINISH FORMAT ===

Route example:
{
  "result": "### Route: A → B → C\\n1. [Name] - [Address] - [Rating] - placeId:[ID]\\n...",
  "mode": "route",
  "selected_venues": ["ChIJ...", "ChIJ...", "ChIJ..."]
}

Discovery example:
{
  "result": "Found 5 venues:\\n1. [Name] - [Address] - [Rating]\\n...",
  "mode": "discovery",
  "selected_venues": []
}

=== CRITICAL RULES ===

- batch_search_venues for 2+ waypoints
- Extract exact placeIds from observations
- Use near_coordinates when user location provided + "near me/nearest"
- Never fabricate data
- Select main venues intelligently
- If user asks for specific venue/chain and 0 results: inform user it wasn't found, DON'T search for alternatives
- Tool auto-expands search (1mi → 5mi → city), trust the tool's results

=== IF NO RESULTS FOUND ===

When tool returns 0 venues:
- DON'T search for similar/alternative venues
- DON'T change the query
- DO inform user the specific venue wasn't found
- DO suggest they try different query or location

Example:
User: "nearest Supercuts"
Tool: 0 results (tried 1mi, 5mi, entire city)
✅ CORRECT: "I couldn't find any Supercuts locations in Boston. Would you like to search for other hair salons?"
❌ WRONG: [searches for "hair salon" instead]

Work efficiently and accurately!`;
  }
}