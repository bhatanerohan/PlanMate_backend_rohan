// // backend/services/react-agent.ts

// import OpenAI from 'openai';
// import dotenv from 'dotenv';
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
// import { RouteEvaluator } from './route-evaluator.js';

// const openai = new OpenAI({
//   apiKey: process.env.OPENAI_API_KEY
// });

// /**
//  * Core ReAct Agent Engine
//  * Implements: Think → Act → Observe loop with safety mechanisms + Route Evaluator
//  */
// export class ReActAgent {
//   private safetyGuards: SafetyGuards;
//   private config: SafetyConfig;
//   private evaluator: RouteEvaluator;

//   constructor(config: SafetyConfig = DEFAULT_SAFETY_CONFIG) {
//     this.config = config;
//     this.safetyGuards = new SafetyGuards(config);
//     this.evaluator = new RouteEvaluator();
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
//       toolResults: [],
//       isInCorrectionMode: false,
//       correctionAttempts: 0
//     };

//     const stopCapture = startCapture(userPrompt);
//     try {
//       // Execute ReAct loop
//       while (state.status !== 'complete' && state.status !== 'failed' && state.status !== 'stopped') {
//         state.currentIteration++;
        
//         console.log(`\n${'='.repeat(80)}`);
//         console.log(`🔄 ITERATION ${state.currentIteration}`);
//         console.log('='.repeat(80));

//         const iterationStart = Date.now();

//         // SAFETY CHECK BEFORE ITERATION
//         const safetyCheck = this.safetyGuards.checkBeforeIteration(state);
//         if (!safetyCheck.safe) {
//           console.log(`\n⛔ Safety check failed: ${safetyCheck.reason}`);
//           state.status = 'stopped';
//           state.error = safetyCheck.reason;
//           console.log(`⏱️ Iteration ${state.currentIteration} took ${Date.now() - iterationStart}ms (stopped)`);
//           break;
//         }

//         // STEP 1: THINK
//         console.log('\n💭 THINKING...');
//         const action = await this.think(state);
        
//         if (!action) {
//           state.status = 'failed';
//           state.error = 'Failed to get valid action from agent';
//           console.log(`⏱️ Iteration ${state.currentIteration} took ${Date.now() - iterationStart}ms (failed)`);
//           break;
//         }

//         console.log(`   Reasoning: ${action.reasoning}`);
//         console.log(`   Action: ${action.action}`);
//         console.log(`   Parameters:`, JSON.stringify(action.parameters, null, 2));

//         // 🛡️ BLOCK SEARCHES DURING CORRECTION MODE
//         if (state.isInCorrectionMode && 
//             (action.action === 'search_venues' || action.action === 'batch_search_venues')) {
          
//           console.log('⚠️  BLOCKED: Agent tried to search during correction mode');
          
//           // Add strong reminder to conversation
//           state.conversationHistory.push({
//             role: 'user',
//             content: '❌ ERROR: You already have all search results in the conversation history. DO NOT search again!\n\nJust reorder the placeIds you already found and call finish with the corrected order.',
//             timestamp: Date.now(),
//             iteration: state.currentIteration
//           });
          
//           state.status = 'thinking';
//           console.log(`⏱️ Iteration ${state.currentIteration} took ${Date.now() - iterationStart}ms (blocked search)`);
//           continue; // Go back to thinking
//         }

//         // Check if agent wants to finish
//         if (action.action === 'finish') {
//           console.log('\n✅ Agent decided task is complete');
          
//           // VALIDATION: Ensure finish has required parameters
//           if (!action.parameters.result || typeof action.parameters.result !== 'string') {
//             console.log('⚠️  Warning: finish called without result parameter, using default');
//             action.parameters.result = 'Task completed';
//           }
          
//           if (!action.parameters.mode || !['discovery', 'route'].includes(action.parameters.mode)) {
//             console.log('⚠️  Warning: finish called without valid mode, defaulting to discovery');
//             action.parameters.mode = 'discovery';
//           }
          
//           // For route mode, ensure selected_venues exists
//           if (action.parameters.mode === 'route' && !Array.isArray(action.parameters.selected_venues)) {
//             console.log('⚠️  Warning: route mode finish without selected_venues array, setting empty array');
//             action.parameters.selected_venues = [];
//           }
          
//           console.log(`📋 Finish parameters validated:`, {
//             hasResult: !!action.parameters.result,
//             mode: action.parameters.mode,
//             selectedVenuesCount: action.parameters.selected_venues?.length || 0
//           });

//           // 🔍 ROUTE EVALUATION (NEW!)
//           if (action.parameters.mode === 'route' && action.parameters.selected_venues.length > 0) {
//             console.log('\n🔍 Running route order evaluation...');
            
//             // Extract all venues from search results
//             const allVenues: any[] = [];
//             state.toolResults.forEach(result => {
//               if (result.success && result.data) {
//                 if (result.action === 'search_venues' && result.data.venues) {
//                   allVenues.push(...result.data.venues);
//                 }
//                 if (result.action === 'batch_search_venues' && result.data.results) {
//                   result.data.results.forEach((searchResult: any) => {
//                     if (searchResult.success && searchResult.venues) {
//                       allVenues.push(...searchResult.venues);
//                     }
//                   });
//                 }
//               }
//             });

//             // Evaluate the route order
//             const evaluation = await this.evaluator.evaluateRoute(
//               userPrompt,
//               action.parameters.selected_venues || [],
//               allVenues
//             );

//             if (!evaluation.isValid) {
//               // Check max correction attempts
//               if ((state.correctionAttempts ?? 0) >= this.config.maxCorrectionAttempts) {
//                 console.log(`⚠️  Max correction attempts (${this.config.maxCorrectionAttempts}) reached, accepting current order`);
//                 state.isInCorrectionMode = false;
//                 // Proceed with current order (fall through to normal finish)
//               } else {
//                 console.log('❌ Route order validation failed, asking agent to correct...');
                
//                 // Increment correction attempts
//                 state.correctionAttempts = (state.correctionAttempts ?? 0) + 1;
//                 state.isInCorrectionMode = true;
                
//                 // Generate correction feedback
//                 const correctionFeedback = this.evaluator.generateCorrectionFeedback(evaluation);
                
//                 // Add feedback to conversation
//                 state.conversationHistory.push({
//                   role: 'user',
//                   content: correctionFeedback,
//                   timestamp: Date.now(),
//                   iteration: state.currentIteration
//                 });

//                 // Reset status to continue the loop
//                 state.status = 'thinking';
//                 console.log(`⏱️ Iteration ${state.currentIteration} took ${Date.now() - iterationStart}ms (correction needed)`);
//                 continue; // Go back to thinking with correction feedback
//               }
//             } else {
//               console.log('✅ Route order validation passed!');
//               state.isInCorrectionMode = false; // Clear correction mode
//             }
//           }
          
//           // Store finish parameters in state
//           state.finalResult = action.parameters.result;
//           state.finishParameters = {
//             result: action.parameters.result,
//             mode: action.parameters.mode as 'discovery' | 'route',
//             selected_venue_ids: action.parameters.selected_venues || []
//           };
          
//           state.status = 'complete';
//           console.log(`⏱️ Iteration ${state.currentIteration} took ${Date.now() - iterationStart}ms (finish)`);
//           break;
//         }

//         // SAFETY CHECK BEFORE ACTION
//         const actionSafetyCheck = this.safetyGuards.checkBeforeAction(
//           action.action, 
//           state,
//           action.parameters
//         );
//         if (!actionSafetyCheck.safe) {
//           console.log(`\n⛔ Action safety check failed: ${actionSafetyCheck.reason}`);
//           state.status = 'stopped';
//           state.error = actionSafetyCheck.reason;
//           console.log(`⏱️ Iteration ${state.currentIteration} took ${Date.now() - iterationStart}ms (safety)`);
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
//         console.log(`⏱️ Iteration ${state.currentIteration} took ${Date.now() - iterationStart}ms`);
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
//       console.log(`Correction attempts: ${state.correctionAttempts}`);
      
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
//         model: 'gpt-4o-mini',
//         temperature: 0,
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
//             parameters: {
//               type: 'object',
//               properties: {
//                 reasoning: {
//                   type: 'string',
//                   description: 'Your reasoning for this action'
//                 },
//                 action: {
//                   type: 'string',
//                   enum: ['search_venues', 'search_events','batch_search_venues', 'validate_availability', 'finish'],
//                   description: 'The action to take'
//                 },
//                 parameters: {
//                   type: 'object',
//                   description: 'Parameters for the action. For finish action, MUST include: result (string), mode (discovery/route), and selected_venues (array of placeIds for route mode)',
//                   properties: {},
//                   additionalProperties: true
//                 }
//               },
//               required: ['reasoning', 'action', 'parameters']
//             }
//           }
//         ],
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
//    * OPTIMIZED: Compress observations to reduce token usage by 80%
//    */
//   private observe(actionName: ActionType, result: ToolResultType, state: AgentState): void {
//     let observation: string;
    
//     if (!result.success) {
//       observation = `Action '${actionName}' failed. Error: ${result.error}`;
//     } else {
//       // Compress observations based on action type
//       switch (actionName) {
//         case 'batch_search_venues':
//           const batchResults = result.data?.results || [];
//           const compactSummary = batchResults.map((r: any) => {
//             if (!r.success || !r.venues || r.venues.length === 0) {
//               return `${r.query}:0`;
//             }
//             const venueList = r.venues.map((v: any) => 
//               `${v.name}|${v.address}|${v.placeId}|${v.rating || 'N/A'}★`
//             ).join(';');
//             return `${r.query}(${r.count}):[${venueList}]`;
//           }).join(' || ');
//           observation = `Batch: ${compactSummary}`;
//           break;

//         case 'search_venues':
//           const venues = result.data?.venues || [];
//           if (venues.length === 0) {
//             observation = `Found 0 venues for "${result.data?.query}"`;
//           } else {
//             const venueList = venues.map((v: any) => 
//               `${v.name}|${v.address}|${v.placeId}|${v.rating || 'N/A'}★`
//             ).join(';');
//             observation = `Found ${venues.length}: [${venueList}]`;
//           }
//           break;

//         case 'search_events':
//           const events = result.data?.events || [];
//           if (events.length === 0) {
//             observation = `Found 0 events`;
//           } else {
//             const eventList = events.map((e: any) => 
//               `${e.name}|${e.venue.name}|${e.date}`
//             ).slice(0, 10).join(';');
//             observation = `Found ${events.length} events: [${eventList}]`;
//           }
//           break;

//         default:
//           observation = `Action '${actionName}' succeeded. Result: ${JSON.stringify(result.data)}`;
//       }
//     }

//     state.conversationHistory.push({
//       role: 'user',
//       content: `OBSERVATION: ${observation}`,
//       timestamp: Date.now(),
//       iteration: state.currentIteration
//     });
//   }

//   /**
//    * System prompt - OPTIMIZED for speed without losing quality
//    */
//   private getSystemPrompt(userLocation?: { lat: number; lng: number; name: string }): string {
//     const toolDefinitions = toolRegistry.getToolDefinitions();
    
//     const locationContext = userLocation 
//   ? `**USER LOCATION:** ${userLocation.name} at ${userLocation.lat}, ${userLocation.lng}

// 🎯 CRITICAL: User location handling has TWO cases:

// **CASE 1: Discovery/Search (near me, nearest, etc.)**
// When user says "near me", "nearest", "around me", "close to me", "nearby":
// → Use near_coordinates parameter: "${userLocation.lat},${userLocation.lng}"

// Examples:
// ✅ "find coffee near me" → search_venues(query="coffee", near_coordinates="${userLocation.lat},${userLocation.lng}", radius="1 mile")
// ✅ "nearest Starbucks" → search_venues(query="Starbucks", near_coordinates="${userLocation.lat},${userLocation.lng}", radius="0.5 miles")
// ✅ "gyms around me" → search_venues(query="gyms", near_coordinates="${userLocation.lat},${userLocation.lng}", radius="2 miles")

// **CASE 2: Routes (my location as waypoint)**
// When user says "from my location", "from me", "from here":
// → DON'T search for it! Use coordinates directly as waypoint.

// Examples:
// ✅ "route from me to MIT" → batch_search_venues([{query:"MIT", ...}])
//    → finish: selected_venues=["user-location", "MIT_placeId"]
// ✅ "route from A to my location to B" → batch_search_venues([{query:"A", ...}, {query:"B", ...}])
//    → finish: selected_venues=["A_placeId", "user-location", "B_placeId"]

// **DO NOT search for:** "my location", "here", "me", "current location", "where I am"
// These are NOT venue names - they refer to coordinates: ${userLocation.lat}, ${userLocation.lng}

// **DON'T use near_coordinates when user specifies other locations:**
// ❌ "coffee in Boston" → search_venues(query="coffee", location="Boston")  // NOT near_coordinates
// ❌ "restaurants in Back Bay" → search_venues(query="restaurants", location="Back Bay")  // NOT near_coordinates
// ` 
//   : `**USER LOCATION:** Not provided.

// If user mentions "near me", "nearest", "my location", "here" → inform them location is not available and suggest using "in [city]" instead.
// `;

//     const toolDescriptions = toolDefinitions
//       .map(tool => {
//         const params = Object.entries(tool.parameters.properties)
//           .map(([name, def]: [string, any]) => {
//             const required = tool.parameters.required.includes(name) ? '(required)' : '(optional)';
//             return `  • ${name} ${required}: ${def.description}`;
//           })
//           .join('\n');
        
//         return `${tool.name}\n${params}`;
//       })
//       .join('\n\n');

//     return `You are PLANMATE, a route planning assistant using ReAct (Think→Act→Observe).

// ${locationContext}
// ═══════════════════════════════════════════════════════════════════════════════
// 🎯 CRITICAL: WAYPOINT ORDER PRESERVATION
// ═══════════════════════════════════════════════════════════════════════════════

// **You MUST preserve the EXACT order from the user's prompt!**

// Step-by-step process:
// 1. **Parse the route string carefully** from left to right
// 2. **Number each waypoint** in the order mentioned
// 3. **Build selected_venues array** in that exact order

// Examples:

// User: "route A to B to my location to C"
// → Order: [A, B, my location, C]
// → Search: [A, B, C]
// → selected_venues: ["A_id", "B_id", "user-location", "C_id"] ✅

// User: "MIT to here to Harvard"  
// → Order: [MIT, here, Harvard]
// → Search: [MIT, Harvard]
// → selected_venues: ["MIT_id", "user-location", "Harvard_id"] ✅

// User: "Starbucks to Target to me to Dunkin"
// → Order: [Starbucks, Target, me, Dunkin]
// → Search: [Starbucks, Target, Dunkin]
// → selected_venues: ["Starbucks_id", "Target_id", "user-location", "Dunkin_id"] ✅

// **WRONG Example:**
// User: "A to B to my location to C"
// → selected_venues: ["A_id", "user-location", "B_id", "C_id"] ❌
// (This is wrong! user-location should be between B and C, not between A and B)

// **Method to ensure correct order:**
// 1. Write down ALL waypoints in order: [waypoint1, waypoint2, waypoint3, ...]
// 2. Mark which ones need searching: [waypoint1✓, waypoint2✓, waypoint3✗, waypoint4✓]
// 3. Search only the marked ones
// 4. Build selected_venues in the ORIGINAL order, using "user-location" for unmarked ones

// ═══════════════════════════════════════════════════════════════════════════════
// 🎯 TWO MODES
// ═══════════════════════════════════════════════════════════════════════════════

// MODE 1 — DISCOVERY (Find Venues)
// Triggers like: "Find…", "Show me…", "Where are…", "Best…", "Search for…"

// Strategy:
// - ONE search_venues call only
// - Return top 10 results maximum if not mentioned
// - mode="discovery"

// MODE 2 — ROUTE PLANNING (Connect Multiple Locations)
// Triggers like: "Route from…", "Path from… to… via…", "Plan route…"

// Strategy - USE BATCH SEARCH FOR SPEED:
// 1. **Identify ALL waypoints** (skip "my location", "here", "me")
// 2. **Use batch_search_venues** for actual venues only
// 3. **Select ONE primary venue** from each search result
// 4. **Skip distance calculations** - frontend handles this
// 5. **Call finish with correct order:**
//    - result: formatted text
//    - mode: "route"
//    - selected_venues: [placeId1, "user-location", placeId2, ...] in EXACT order

// ═══════════════════════════════════════════════════════════════════════════════
// 🛠️ AVAILABLE TOOLS
// ═══════════════════════════════════════════════════════════════════════════════

// ${toolDescriptions}

// finish:
//   • result (required): Formatted text output
//   • mode (required): "discovery" or "route"
//   • selected_venues (required for route): Array of placeIds ONLY (not full venue strings)
//     - Format: ["ChIJ...", "user-location", "ChIJ..."]
//     - DO NOT include venue names or addresses
//     - Just the placeId strings

// ═══════════════════════════════════════════════════════════════════════════════
// 🚨 CRITICAL: selected_venues FORMAT
// ═══════════════════════════════════════════════════════════════════════════════

// **CORRECT Format:**
// {
//   "selected_venues": [
//     "ChIJqygAFrRZwokRwF0VrBoXS0E",
//     "user-location",
//     "ChIJb8Jg9pZYwokR-qHGtvSkLzs"
//   ]
// }

// **WRONG Formats:**
// ❌ "selected_venues": ["Vessel|20 Hudson Yards|ChIJ...", ...]  // Don't include names/addresses!
// ❌ "selected_venues": [{name: "Vessel", placeId: "ChIJ..."}, ...]  // Not objects!
// ❌ "selected_venues": ["Vessel", "user-location", "The Met"]  // Not venue names!

// **Only use:**
// - Exact placeId strings from observations (format: "ChIJ...")
// - String "user-location" for user's position
// - Nothing else!

// ═══════════════════════════════════════════════════════════════════════════════
// ✅ QUALITY STANDARDS
// ═══════════════════════════════════════════════════════════════════════════════

// - NEVER search for "my location", "here", "me", "current location"
// - ALWAYS preserve exact waypoint order from user's prompt
// - ONLY use placeId strings in selected_venues (format: "ChIJ...")
// - Extract exact placeIds from observations
// - Use real API data only (never fabricate)

// ═══════════════════════════════════════════════════════════════════════════════
// ❌ NEVER DO
// ═══════════════════════════════════════════════════════════════════════════════

// - Don't search for user location references as venue names
// - Don't reorder waypoints - keep user's exact order
// - Don't calculate distances (frontend handles this)
// - Don't use sub-locations when user wants main location

// Think step-by-step, recognize user location references, preserve order, and create clear routes!`;
//   }
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
import { RouteEvaluator } from './route-evaluator.js';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

// NEW: Metadata interface for passing additional context
interface AgentMetadata {
  isItinerary?: boolean;
  originalPrompt?: string;
}

/**
 * Core ReAct Agent Engine
 * Implements: Think → Act → Observe loop with safety mechanisms + Route Evaluator
 */
export class ReActAgent {
  private safetyGuards: SafetyGuards;
  private config: SafetyConfig;
  private evaluator: RouteEvaluator;

  constructor(config: SafetyConfig = DEFAULT_SAFETY_CONFIG) {
    this.config = config;
    this.safetyGuards = new SafetyGuards(config);
    this.evaluator = new RouteEvaluator();
  }

  /**
   * Main execution loop
   * NEW: Added optional metadata parameter
   */
  async execute(
    userPrompt: string, 
    userLocation?: { lat: number; lng: number; name: string },
    metadata?: AgentMetadata  // NEW: Optional metadata
  ): Promise<ReActResponse> {
    console.log('\n🚀 Starting ReAct Agent...');
    console.log(`📝 User Prompt: "${userPrompt}"`);
    if (userLocation) {
      console.log(`📍 User Location: ${userLocation.name} (${userLocation.lat}, ${userLocation.lng})`);
    }
    if (metadata?.isItinerary) {
      console.log(`🎨 Mode: Itinerary Planning`);
      console.log(`📋 Original prompt: "${metadata.originalPrompt}"`);
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
      toolResults: [],
      isInCorrectionMode: false,
      correctionAttempts: 0
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

        // 🛡️ BLOCK SEARCHES DURING CORRECTION MODE
        if (state.isInCorrectionMode && 
            (action.action === 'search_venues' || action.action === 'batch_search_venues')) {
          
          console.log('⚠️  BLOCKED: Agent tried to search during correction mode');
          
          // Add strong reminder to conversation
          state.conversationHistory.push({
            role: 'user',
            content: '❌ ERROR: You already have all search results in the conversation history. DO NOT search again!\n\nJust reorder the placeIds you already found and call finish with the corrected order.',
            timestamp: Date.now(),
            iteration: state.currentIteration
          });
          
          state.status = 'thinking';
          console.log(`⏱️ Iteration ${state.currentIteration} took ${Date.now() - iterationStart}ms (blocked search)`);
          continue; // Go back to thinking
        }

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

          // 🔍 ROUTE EVALUATION (Enhanced with Metadata)
          if (action.parameters.mode === 'route' && action.parameters.selected_venues.length > 0) {
            console.log('\n🔍 Running route order evaluation...');
            
            // Extract all venues from search results
            const allVenues: any[] = [];
            state.toolResults.forEach(result => {
              if (result.success && result.data) {
                if (result.action === 'search_venues' && result.data.venues) {
                  allVenues.push(...result.data.venues);
                }
                if (result.action === 'batch_search_venues' && result.data.results) {
                  result.data.results.forEach((searchResult: any) => {
                    if (searchResult.success && searchResult.venues) {
                      allVenues.push(...searchResult.venues);
                    }
                  });
                }
              }
            });

            // NEW: Use metadata to determine if this is an itinerary or explicit route
            const isItinerary = metadata?.isItinerary ?? false;
            const originalPrompt = metadata?.originalPrompt ?? userPrompt;

            console.log(`   Route type: ${isItinerary ? 'ITINERARY' : 'EXPLICIT ROUTE'}`);
            console.log(`   Evaluating against: "${originalPrompt}"`);

            // Evaluate the route order
            const evaluation = await this.evaluator.evaluateRoute(
              originalPrompt,  // Use original user prompt for evaluation
              action.parameters.selected_venues || [],
              allVenues,
              isItinerary  // Pass the flag from metadata
            );

            if (!evaluation.isValid) {
              // Check max correction attempts
              if ((state.correctionAttempts ?? 0) >= this.config.maxCorrectionAttempts) {
                console.log(`⚠️  Max correction attempts (${this.config.maxCorrectionAttempts}) reached, accepting current order`);
                state.isInCorrectionMode = false;
                // Proceed with current order (fall through to normal finish)
              } else {
                console.log('❌ Route order validation failed, asking agent to correct...');
                
                // Increment correction attempts
                state.correctionAttempts = (state.correctionAttempts ?? 0) + 1;
                state.isInCorrectionMode = true;
                
                // Generate correction feedback
                const correctionFeedback = this.evaluator.generateCorrectionFeedback(evaluation);
                
                // Add feedback to conversation
                state.conversationHistory.push({
                  role: 'user',
                  content: correctionFeedback,
                  timestamp: Date.now(),
                  iteration: state.currentIteration
                });

                // Reset status to continue the loop
                state.status = 'thinking';
                console.log(`⏱️ Iteration ${state.currentIteration} took ${Date.now() - iterationStart}ms (correction needed)`);
                continue; // Go back to thinking with correction feedback
              }
            } else {
              console.log('✅ Route order validation passed!');
              state.isInCorrectionMode = false; // Clear correction mode
            }
          }
          
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
      console.log(`Correction attempts: ${state.correctionAttempts}`);
      
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
          const batchResults = result.data?.results || [];
          const compactSummary = batchResults.map((r: any) => {
            if (!r.success || !r.venues || r.venues.length === 0) {
              return `${r.query}:0`;
            }
            const venueList = r.venues.map((v: any) => 
              `${v.name}|${v.address}|${v.placeId}|${v.rating || 'N/A'}★`
            ).join(';');
            return `${r.query}(${r.count}):[${venueList}]`;
          }).join(' || ');
          observation = `Batch: ${compactSummary}`;
          break;

        case 'search_venues':
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
    
    const locationContext = userLocation 
  ? `**USER LOCATION:** ${userLocation.name} at ${userLocation.lat}, ${userLocation.lng}

🎯 CRITICAL: User location handling has TWO cases:

**CASE 1: Discovery/Search (near me, nearest, etc.)**
When user says "near me", "nearest", "around me", "close to me", "nearby":
→ Use near_coordinates parameter: "${userLocation.lat},${userLocation.lng}" but not if mentioned near a particular place

Examples:
✅ "find coffee near me" → search_venues(query="coffee", near_coordinates="${userLocation.lat},${userLocation.lng}", radius="1 mile")
✅ "nearest Starbucks" → search_venues(query="Starbucks", near_coordinates="${userLocation.lat},${userLocation.lng}", radius="0.5 miles")
✅ "gyms around me" → search_venues(query="gyms", near_coordinates="${userLocation.lat},${userLocation.lng}", radius="2 miles")

**CASE 2: Routes (my location as waypoint)**
When user says "from my location", "from me", "from here":
→ DON'T search for it! Use coordinates directly as waypoint.

Examples:
✅ "route from me to MIT" → batch_search_venues([{query:"MIT", ...}])
   → finish: selected_venues=["user-location", "MIT_placeId"]
✅ "route from A to my location to B" → batch_search_venues([{query:"A", ...}, {query:"B", ...}])
   → finish: selected_venues=["A_placeId", "user-location", "B_placeId"]

**DO NOT search for:** "my location", "here", "me", "current location", "where I am"
These are NOT venue names - they refer to coordinates: ${userLocation.lat}, ${userLocation.lng}

**DON'T use near_coordinates when user specifies other locations:**
❌ "coffee in Boston" → search_venues(query="coffee", location="Boston")  // NOT near_coordinates
❌ "restaurants in Back Bay" → search_venues(query="restaurants", location="Back Bay")  // NOT near_coordinates
` 
  : `**USER LOCATION:** Not provided.

If user mentions "near me", "nearest", "my location", "here" → inform them location is not available and suggest using "in [city]" instead.
`;

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
╔═══════════════════════════════════════════════════════════════════════════════╗
🎯 CRITICAL: WAYPOINT ORDER PRESERVATION
╚═══════════════════════════════════════════════════════════════════════════════╝

**You MUST preserve the EXACT order from the user's prompt!**

Step-by-step process:
1. **Parse the route string carefully** from left to right
2. **Number each waypoint** in the order mentioned
3. **Build selected_venues array** in that exact order

Examples:

User: "route A to B to my location to C"
→ Order: [A, B, my location, C]
→ Search: [A, B, C]
→ selected_venues: ["A_id", "B_id", "user-location", "C_id"] ✅

User: "MIT to here to Harvard"  
→ Order: [MIT, here, Harvard]
→ Search: [MIT, Harvard]
→ selected_venues: ["MIT_id", "user-location", "Harvard_id"] ✅

User: "Starbucks to Target to me to Dunkin"
→ Order: [Starbucks, Target, me, Dunkin]
→ Search: [Starbucks, Target, Dunkin]
→ selected_venues: ["Starbucks_id", "Target_id", "user-location", "Dunkin_id"] ✅

**WRONG Example:**
User: "A to B to my location to C"
→ selected_venues: ["A_id", "user-location", "B_id", "C_id"] ❌
(This is wrong! user-location should be between B and C, not between A and B)

**Method to ensure correct order:**
1. Write down ALL waypoints in order: [waypoint1, waypoint2, waypoint3, ...]
2. Mark which ones need searching: [waypoint1✓, waypoint2✓, waypoint3✗, waypoint4✓]
3. Search only the marked ones
4. Build selected_venues in the ORIGINAL order, using "user-location" for unmarked ones

╔═══════════════════════════════════════════════════════════════════════════════╗
🎯 TWO MODES
╚═══════════════════════════════════════════════════════════════════════════════╝

MODE 1 – DISCOVERY (Find Venues)
Triggers like: "Find…", "Show me…", "Where are…", "Best…", "Search for…"

Strategy:
- ONE search_venues call only
- Return top 10 results maximum if not mentioned
- mode="discovery"

MODE 2 – ROUTE PLANNING (Connect Multiple Locations)
Triggers like: "Route from…", "Path from… to… via…", "Plan route…"

Strategy - USE BATCH SEARCH FOR SPEED:
1. **Identify ALL waypoints** (skip "my location", "here", "me")
2. **Use batch_search_venues** for actual venues only
3. **Select ONE primary venue** from each search result
4. **Skip distance calculations** - frontend handles this
5. **Call finish with correct order:**
   - result: formatted text
   - mode: "route"
   - selected_venues: [placeId1, "user-location", placeId2, ...] in EXACT order

╔═══════════════════════════════════════════════════════════════════════════════╗
🛠️ AVAILABLE TOOLS
╚═══════════════════════════════════════════════════════════════════════════════╝

${toolDescriptions}

finish:
  • result (required): Formatted text output
  • mode (required): "discovery" or "route"
  • selected_venues (required for route): Array of placeIds ONLY (not full venue strings)
    - Format: ["ChIJ...", "user-location", "ChIJ..."]
    - DO NOT include venue names or addresses
    - Just the placeId strings

╔═══════════════════════════════════════════════════════════════════════════════╗
🚨 CRITICAL: selected_venues FORMAT
╚═══════════════════════════════════════════════════════════════════════════════╝

**CORRECT Format:**
{
  "selected_venues": [
    "ChIJqygAFrRZwokRwF0VrBoXS0E",
    "user-location",
    "ChIJb8Jg9pZYwokR-qHGtvSkLzs"
  ]
}

**WRONG Formats:**
❌ "selected_venues": ["Vessel|20 Hudson Yards|ChIJ...", ...]  // Don't include names/addresses!
❌ "selected_venues": [{name: "Vessel", placeId: "ChIJ..."}, ...]  // Not objects!
❌ "selected_venues": ["Vessel", "user-location", "The Met"]  // Not venue names!

**Only use:**
- Exact placeId strings from observations (format: "ChIJ...")
- String "user-location" for user's position
- Nothing else!

╔═══════════════════════════════════════════════════════════════════════════════╗
✅ QUALITY STANDARDS
╚═══════════════════════════════════════════════════════════════════════════════╝

- NEVER search for "my location", "here", "me", "current location"
- ALWAYS preserve exact waypoint order from user's prompt
- ONLY use placeId strings in selected_venues (format: "ChIJ...")
- Extract exact placeIds from observations
- Use real API data only (never fabricate)

╔═══════════════════════════════════════════════════════════════════════════════╗
❌ NEVER DO
╚═══════════════════════════════════════════════════════════════════════════════╝

- Don't search for user location references as venue names
- Don't reorder waypoints - keep user's exact order
- Don't calculate distances (frontend handles this)
- Don't use sub-locations when user wants main location

Think step-by-step, recognize user location references, preserve order, and create clear routes!`;
  }
}