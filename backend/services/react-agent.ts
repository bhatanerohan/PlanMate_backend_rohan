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

// interface AgentMetadata {
//   isItinerary?: boolean;
//   originalPrompt?: string;
// }

// // 🆕 NEW: Interface for tracking alternatives
// interface AlternativesMap {
//   [primaryPlaceId: string]: {
//     alternatives: any[];  // Array of venue objects
//     searchQuery: string;  // Original query that found these venues
//   };
// }

// export class ReActAgent {
//   private safetyGuards: SafetyGuards;
//   private config: SafetyConfig;
//   private evaluator: RouteEvaluator;
  
//   // 🆕 NEW: Track alternatives during execution
//   private alternativesMap: AlternativesMap = {};

//   constructor(config: SafetyConfig = DEFAULT_SAFETY_CONFIG) {
//     this.config = config;
//     this.safetyGuards = new SafetyGuards(config);
//     this.evaluator = new RouteEvaluator();
//   }

//   async execute(
//     userPrompt: string, 
//     userLocation?: { lat: number; lng: number; name: string },
//     metadata?: AgentMetadata
//   ): Promise<ReActResponse> {
//     console.log('\n🚀 Starting ReAct Agent...');
//     console.log(`📝 User Prompt: "${userPrompt}"`);
//     if (userLocation) {
//       console.log(`📍 User Location: ${userLocation.name} (${userLocation.lat}, ${userLocation.lng})`);
//     }
//     if (metadata?.isItinerary) {
//       console.log(`🎨 Mode: Itinerary Planning`);
//       console.log(`📋 Original prompt: "${metadata.originalPrompt}"`);
//     }
//     console.log('');

//     // 🆕 RESET: Clear alternatives map for new execution
//     this.alternativesMap = {};

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
//       while (state.status !== 'complete' && state.status !== 'failed' && state.status !== 'stopped') {
//         state.currentIteration++;
        
//         console.log(`\n${'='.repeat(80)}`);
//         console.log(`🔄 ITERATION ${state.currentIteration}`);
//         console.log('='.repeat(80));

//         const iterationStart = Date.now();

//         const safetyCheck = this.safetyGuards.checkBeforeIteration(state);
//         if (!safetyCheck.safe) {
//           console.log(`\n⛔ Safety check failed: ${safetyCheck.reason}`);
//           state.status = 'stopped';
//           state.error = safetyCheck.reason;
//           console.log(`⏱️ Iteration ${state.currentIteration} took ${Date.now() - iterationStart}ms (stopped)`);
//           break;
//         }

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

//         if (state.isInCorrectionMode && 
//             (action.action === 'search_venues' || action.action === 'batch_search_venues')) {
          
//           console.log('⚠️  BLOCKED: Agent tried to search during correction mode');
          
//           state.conversationHistory.push({
//             role: 'user',
//             content: '❌ ERROR: You already have all search results in the conversation history. DO NOT search again!\n\nJust reorder the placeIds you already found and call finish with the corrected order.',
//             timestamp: Date.now(),
//             iteration: state.currentIteration
//           });
          
//           state.status = 'thinking';
//           console.log(`⏱️ Iteration ${state.currentIteration} took ${Date.now() - iterationStart}ms (blocked search)`);
//           continue;
//         }

//         if (action.action === 'finish') {
//           console.log('\n✅ Agent decided task is complete');
          
//           if (!action.parameters.result || typeof action.parameters.result !== 'string') {
//             console.log('⚠️  Warning: finish called without result parameter, using default');
//             action.parameters.result = 'Task completed';
//           }
          
//           if (!action.parameters.mode || !['discovery', 'route'].includes(action.parameters.mode)) {
//             console.log('⚠️  Warning: finish called without valid mode, defaulting to discovery');
//             action.parameters.mode = 'discovery';
//           }
          
//           if (action.parameters.mode === 'route' && !Array.isArray(action.parameters.selected_venues)) {
//             console.log('⚠️  Warning: route mode finish without selected_venues array, setting empty array');
//             action.parameters.selected_venues = [];
//           }
          
//           // 🆕 NEW: Clean alternatives - remove duplicates and primary venues
//           if (action.parameters.mode === 'route' && action.parameters.selected_venues) {
//             this.cleanAlternatives(action.parameters.selected_venues);
//           }
          
//           console.log(`📋 Finish parameters validated:`, {
//             hasResult: !!action.parameters.result,
//             mode: action.parameters.mode,
//             selectedVenuesCount: action.parameters.selected_venues?.length || 0,
//             alternativesCount: Object.keys(this.alternativesMap).length  // 🆕 NEW
//           });

//           if (action.parameters.mode === 'route' && action.parameters.selected_venues.length > 0) {
//             console.log('\n🔍 Running route order evaluation...');
            
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

//             const isItinerary = metadata?.isItinerary ?? false;
//             const originalPrompt = metadata?.originalPrompt ?? userPrompt;

//             console.log(`   Route type: ${isItinerary ? 'ITINERARY' : 'EXPLICIT ROUTE'}`);
//             console.log(`   Evaluating against: "${originalPrompt}"`);

//             const evaluation = await this.evaluator.evaluateRoute(
//               originalPrompt,
//               action.parameters.selected_venues || [],
//               allVenues,
//               isItinerary
//             );

//             if (!evaluation.isValid) {
//               if ((state.correctionAttempts ?? 0) >= this.config.maxCorrectionAttempts) {
//                 console.log(`⚠️  Max correction attempts (${this.config.maxCorrectionAttempts}) reached, accepting current order`);
//                 state.isInCorrectionMode = false;
//               } else {
//                 console.log('❌ Route order validation failed, asking agent to correct...');
                
//                 state.correctionAttempts = (state.correctionAttempts ?? 0) + 1;
//                 state.isInCorrectionMode = true;
                
//                 const correctionFeedback = this.evaluator.generateCorrectionFeedback(evaluation);
                
//                 state.conversationHistory.push({
//                   role: 'user',
//                   content: correctionFeedback,
//                   timestamp: Date.now(),
//                   iteration: state.currentIteration
//                 });

//                 state.status = 'thinking';
//                 console.log(`⏱️ Iteration ${state.currentIteration} took ${Date.now() - iterationStart}ms (correction needed)`);
//                 continue;
//               }
//             } else {
//               console.log('✅ Route order validation passed!');
//               state.isInCorrectionMode = false;
//             }
//           }
          
//           state.finalResult = action.parameters.result;
//           state.finishParameters = {
//             result: action.parameters.result,
//             mode: action.parameters.mode as 'discovery' | 'route',
//             selected_venue_ids: action.parameters.selected_venues || [],
//             // 🆕 NEW: Include alternatives map in finish parameters
//             alternatives_map: this.alternativesMap
//           };
          
//           state.status = 'complete';
//           console.log(`⏱️ Iteration ${state.currentIteration} took ${Date.now() - iterationStart}ms (finish)`);
//           break;
//         }

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

//         console.log('\n⚡ ACTING...');
//         state.status = 'acting';
//         const result = await this.act(action, state);
        
//         console.log(`   Success: ${result.success}`);
//         if (result.success) {
//           console.log(`   Data: ${JSON.stringify(result.data).substring(0, 200)}...`);
//         } else {
//           console.log(`   Error: ${result.error}`);
//         }

//         // 🆕 NEW: Capture alternatives from batch_search_venues results
//         if (action.action === 'batch_search_venues' && result.success && result.data?.results) {
//           this.captureAlternatives(result.data.results);
//         }

//         console.log('\n👁️  OBSERVING...');
//         state.status = 'observing';
//         this.observe(action.action, result, state);
        
//         console.log(`   Added observation to conversation history`);
//         console.log(`   Total messages: ${state.conversationHistory.length}`);
//         console.log(`   Total tokens used: ${state.totalTokensUsed}`);
//         console.log(`⏱️ Iteration ${state.currentIteration} took ${Date.now() - iterationStart}ms`);
//       }

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
//       console.log(`Alternatives captured: ${Object.keys(this.alternativesMap).length} stops`);  // 🆕 NEW
      
//       if (state.status === 'stopped') {
//         console.log(`⛔ Stopped reason: ${state.error}`);
//       }
      
//       console.log('='.repeat(80) + '\n');

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

//   // 🆕 NEW: Method to capture alternatives from batch search results
//   private captureAlternatives(batchResults: any[]): void {
//     console.log('\n🔍 Capturing alternatives from batch search...');
    
//     batchResults.forEach((searchResult, index) => {
//       if (!searchResult.success || !searchResult.venues || searchResult.venues.length === 0) {
//         console.log(`   ⚠️  Search ${index + 1} (${searchResult.query}): No venues found`);
//         return;
//       }

//       const venues = searchResult.venues;
//       const query = searchResult.query;
      
//       // First venue is the primary (best match)
//       const primaryVenue = venues[0];
//       const primaryPlaceId = primaryVenue.placeId;
      
//       // Remaining venues are alternatives (up to 3 total, so 2 alternatives)
//       const alternatives = venues.slice(1, 3);  // Get venues 2 and 3
      
//       if (alternatives.length > 0) {
//         this.alternativesMap[primaryPlaceId] = {
//           alternatives: alternatives,
//           searchQuery: query
//         };
        
//         console.log(`   ✅ Stop ${index + 1} (${primaryVenue.name}): ${alternatives.length} alternatives captured`);
//         alternatives.forEach((alt: { name: any; rating: any; }, i: number) => {
//           console.log(`      ${i + 1}. ${alt.name} (${alt.rating || 'N/A'}⭐)`);
//         });
//       } else {
//         console.log(`   ⚠️  Stop ${index + 1} (${primaryVenue.name}): No alternatives available`);
//       }
//     });
    
//     console.log(`\n📦 Total alternatives captured: ${Object.keys(this.alternativesMap).length} stops\n`);
//   }

//   // 🆕 NEW: Clean alternatives - remove venues already in primary route and duplicates
//   private cleanAlternatives(selectedVenueIds: string[]): void {
//     console.log('\n🧹 Cleaning alternatives...');
    
//     // Create set of primary venue IDs for fast lookup
//     const primaryPlaceIds = new Set(selectedVenueIds.filter(id => id !== 'user-location'));
//     console.log(`   Primary venues: ${primaryPlaceIds.size} stops`);
    
//     // Track which placeIds we've already used as alternatives
//     const usedAlternativePlaceIds = new Set<string>();
    
//     let removedCount = 0;
//     let duplicateCount = 0;
    
//     // Clean each stop's alternatives
//     Object.keys(this.alternativesMap).forEach(primaryPlaceId => {
//       const altInfo = this.alternativesMap[primaryPlaceId];
//       const originalCount = altInfo.alternatives.length;
      
//       // Filter out:
//       // 1. Venues that are in the primary route
//       // 2. Venues that are already alternatives for another stop
//       altInfo.alternatives = altInfo.alternatives.filter(alt => {
//         const altPlaceId = alt.placeId;
        
//         // Check if this venue is a primary stop
//         if (primaryPlaceIds.has(altPlaceId)) {
//           console.log(`   ❌ Removed "${alt.name}" - already in primary route`);
//           removedCount++;
//           return false;
//         }
        
//         // Check if this venue is already an alternative for another stop
//         if (usedAlternativePlaceIds.has(altPlaceId)) {
//           console.log(`   ❌ Removed "${alt.name}" - duplicate alternative`);
//           duplicateCount++;
//           return false;
//         }
        
//         // Keep this alternative and mark as used
//         usedAlternativePlaceIds.add(altPlaceId);
//         return true;
//       });
      
//       const newCount = altInfo.alternatives.length;
//       if (newCount < originalCount) {
//         console.log(`   🔧 Stop "${primaryPlaceId.substring(0, 20)}...": ${originalCount} → ${newCount} alternatives`);
//       }
      
//       // Remove stops with no alternatives left
//       if (altInfo.alternatives.length === 0) {
//         delete this.alternativesMap[primaryPlaceId];
//       }
//     });
    
//     console.log(`\n✅ Cleaning complete:`);
//     console.log(`   Removed ${removedCount} venues already in route`);
//     console.log(`   Removed ${duplicateCount} duplicate alternatives`);
//     console.log(`   Final: ${Object.keys(this.alternativesMap).length} stops with alternatives\n`);
//   }

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
//         // temperature: 0,
//         reasoning_effort: 'low',
//         messages: state.conversationHistory as any,
//         functions: [
//           {
//             name: 'execute_action',
//             description: `Execute an action based on your reasoning.

// Available actions and their parameters:

// ${actionParametersDescription}

// finish:
//     - result (REQUIRED): Rich, contextual description using all venue data
//     - mode (REQUIRED): "discovery" or "route"
//     - selected_venues (REQUIRED for route mode): Array of placeIds in order
    
// NOTE: When you call batch_search_venues, the system will automatically capture alternatives for each primary venue you select. You don't need to do anything special - just pick the best venues as you normally would.`,
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
//                   description: 'Parameters for the action',
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

//   private observe(actionName: ActionType, result: ToolResultType, state: AgentState): void {
//     let observation: string;
    
//     if (!result.success) {
//       observation = `Action '${actionName}' failed. Error: ${result.error}`;
//     } else {
//       switch (actionName) {
//         case 'batch_search_venues':
//           const batchResults = result.data?.results || [];
//           const compactSummary = batchResults.map((r: any) => {
//             if (!r.success || !r.venues || r.venues.length === 0) {
//               return `${r.query}:0`;
//             }
//             const venueList = r.venues.map((v: any) => 
//               `${v.name}|${v.address}|${v.placeId}|${v.rating || 'N/A'}⭐|${v.priceLevel || 'N/A'}|${v.description?.substring(0, 100) || 'No desc'}`
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
//               `${v.name}|${v.address}|${v.placeId}|${v.rating || 'N/A'}⭐|${v.priceLevel || 'N/A'}|${v.description?.substring(0, 100) || 'No desc'}`
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

//   private getSystemPrompt(userLocation?: { lat: number; lng: number; name: string }): string {
//     const toolDefinitions = toolRegistry.getToolDefinitions();
    
//     const locationContext = userLocation 
//   ? `**USER LOCATION:** ${userLocation.name} at ${userLocation.lat}, ${userLocation.lng}

// 🎯 CRITICAL: User location handling has TWO cases:

// **CASE 1: Discovery/Search (near me, nearest, etc.)**
// When user says "near me", "nearest", "around me", "close to me", "nearby":
// → Use near_coordinates parameter: "${userLocation.lat},${userLocation.lng}" but not if mentioned near a particular place

// **CASE 2: Routes (my location as waypoint)**
// When user says "from my location", "from me", "from here":
// → DON'T search for it! Use coordinates directly as waypoint.

// **DO NOT search for:** "my location", "here", "me", "current location", "where I am"
// These are NOT venue names - they refer to coordinates: ${userLocation.lat}, ${userLocation.lng}
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
// ╔═══════════════════════════════════════════════════════════════════════════════╗
// 🎯 CRITICAL: WAYPOINT ORDER PRESERVATION
// ╚═══════════════════════════════════════════════════════════════════════════════╝

// **You MUST preserve the EXACT order from the user's prompt!**

// ╔═══════════════════════════════════════════════════════════════════════════════╗
// 🎯 TWO MODES
// ╚═══════════════════════════════════════════════════════════════════════════════╝

// MODE 1 — DISCOVERY (Find Venues)
// Triggers like: "Find…", "Show me…", "Where are…", "Best…", "Search for…"

// Strategy:
// - ONE search_venues call only
// - Return top 10 results maximum if not mentioned
// - mode="discovery"
// - Format result text with compelling descriptions using venue data

// MODE 2 — ROUTE PLANNING (Connect Multiple Locations)
// Triggers like: "Route from…", "Path from… to… via…", "Plan route…"

// Strategy - USE BATCH SEARCH FOR SPEED:
// 1. **Identify ALL waypoints** (skip "my location", "here", "me")
// 2. **Use batch_search_venues** for actual venues only
// 3. **Select ONE primary venue** from each search result
// 4. **Skip distance calculations** - frontend handles this
// 5. **Call finish with correct order:**
//    - result: Rich narrative using ALL venue data (rating, price, types, description)
//    - mode: "route"
//    - selected_venues: [placeId1, "user-location", placeId2, ...] in EXACT order

// 🆕 **HANDLING COORDINATES IN LOCATION:**
// Agent 1 may provide coordinates (e.g., "42.365,-71.054") when user says "near me".
// Just pass these through to batch_search_venues - the tool will automatically use nearbySearch.

// Example Agent 1 output:
// "Find 4 venues in 42.365,-71.054: bakery, cafe, restaurant, bar"

// Your batch search:
// json
// {
//   "searches": [
//     {
//       "query": "bakery",
//       "location": "42.365,-71.054",  // Pass through as-is
//       "limit": 3
//     }
//   ]
// }


// The batch search tool will detect coordinates and search nearby automatically.

// 🆕 **ALTERNATIVES ARE AUTOMATICALLY CAPTURED:**
// When you use batch_search_venues and select the best venue from each category, the system automatically saves 2-3 alternative venues for each stop. You don't need to do anything special - just focus on picking the best primary route!

// ╔═══════════════════════════════════════════════════════════════════════════════╗
// 🛠️ AVAILABLE TOOLS
// ╚═══════════════════════════════════════════════════════════════════════════════╝

// ${toolDescriptions}

// finish:
//   • result (required): Rich, contextual description using ALL venue data
    
//     STRUCTURE:
//     - Opening: "[Emoji] Here's your [occasion] in [location]! [1-2 sentence vibe/flow overview]"
//     - Venues: Numbered list with RICH descriptions (2-3 sentences each)
//     - Closing: "✨ [Why this works + practical info]"
    
//     USE ALL VENUE DATA in descriptions:
//     - Name + what it's known for (from description/types)
//     - Atmosphere (casual/upscale/historic from price + types)
//     - What to do there (grab drinks/explore/enjoy views based on types)
//     - Why it fits THIS request (bar crawl→lively, date→romantic)
//     - Rating context (4.5+: "highly rated", <4.0: explain appeal)
//     - Price context ($: budget-friendly, $$$$: premium)
    
//     EXAMPLE: "🗺️ Here's your Fenway bar crawl!\n\n1. 🍺 Bleacher Bar (⭐ 4.5 • $$)\n   Start at this iconic sports bar built into Fenway Park's center field wall. Grab craft beers while catching the game atmosphere - legendary Boston experience.\n\n2. 🍺 Lansdowne Pub (⭐ 4.3 • $$)\n   Energetic multi-level pub with DJ nights and young crowd. Try the rotating craft selection.\n\n✨ Tight 0.3-mile radius = more drinks, less walking!"
  
//   • mode (required): "discovery" or "route"
//   • selected_venues (required for route): Array of placeIds ONLY
//     - Format: ["ChIJ...", "user-location", "ChIJ..."]

// ╔═══════════════════════════════════════════════════════════════════════════════╗
// 🚨 CRITICAL: selected_venues FORMAT
// ╚═══════════════════════════════════════════════════════════════════════════════╝

// **CORRECT:** ["ChIJqygAFrRZwokRwF0VrBoXS0E", "user-location", "ChIJb8Jg9pZYwokR-qHGtvSkLzs"]
// **WRONG:** ["Vessel|20 Hudson Yards|ChIJ...", ...]

// ╔═══════════════════════════════════════════════════════════════════════════════╗
// ✅ QUALITY STANDARDS
// ╚═══════════════════════════════════════════════════════════════════════════════╝

// - NEVER search for "my location", "here", "me", "current location"
// - ALWAYS preserve exact waypoint order from user's prompt
// - ONLY use placeId strings in selected_venues (format: "ChIJ...")
// - Extract exact placeIds from observations
// - Use real API data only (never fabricate)
// - CREATE RICH DESCRIPTIONS using all venue data (rating, price, types, description)
// - EXPLAIN WHY each venue fits the occasion
// - ADD CONTEXT about atmosphere, what to do, and flow between stops

// ╔═══════════════════════════════════════════════════════════════════════════════╗
// ❌ NEVER DO
// ╚═══════════════════════════════════════════════════════════════════════════════╝

// - Don't search for user location references as venue names
// - Don't reorder waypoints - keep user's exact order
// - Don't calculate distances (frontend handles this)
// - Don't use sub-locations when user wants main location
// - Don't give boring generic descriptions - use the venue data to make it compelling!

// Think step-by-step, recognize user location references, preserve order, and create rich, helpful itinerary descriptions!`;
//   }
// }

// backend/services/react-agent.ts - COMPLETE FILE WITH GEMINI GROUNDING SUPPORT

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
import type { GeminiVenueRecommendation } from './gemini-grounding-agent.js';  // 🆕 NEW

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

interface AgentMetadata {
  isItinerary?: boolean;
  originalPrompt?: string;
  geminiRecommendations?: GeminiVenueRecommendation[];  // 🆕 NEW
  useGroundingMode?: boolean;  // 🆕 NEW
}

// 🆕 NEW: Interface for tracking alternatives
interface AlternativesMap {
  [primaryPlaceId: string]: {
    alternatives: any[];
    searchQuery: string;
  };
}

export class ReActAgent {
  private safetyGuards: SafetyGuards;
  private config: SafetyConfig;
  private evaluator: RouteEvaluator;
  
  // 🆕 NEW: Track alternatives during execution
  private alternativesMap: AlternativesMap = {};

  constructor(config: SafetyConfig = DEFAULT_SAFETY_CONFIG) {
    this.config = config;
    this.safetyGuards = new SafetyGuards(config);
    this.evaluator = new RouteEvaluator();
  }

  // ============================================================================
  // 🆕 NEW METHOD: Grounding-Enhanced Execution Mode
  // ============================================================================

  /**
   * Execute with Gemini grounding recommendations
   * Takes Gemini's venue suggestions and enriches with exact Google Places data
   */
  async executeWithGrounding(
    userPrompt: string,
    geminiRecommendations: GeminiVenueRecommendation[],
    userLocation?: { lat: number; lng: number; name: string },
    metadata?: AgentMetadata
  ): Promise<ReActResponse> {
    console.log('\n🌟 ReAct Agent: GROUNDING-ENHANCED MODE');
    console.log(`📝 Processing ${geminiRecommendations.length} Gemini recommendations`);
    console.log('🎯 Will enrich with exact Google Places data');

    const state: AgentState = {
      status: 'thinking',
      currentIteration: 0,
      startTime: Date.now(),
      totalTokensUsed: 0,
      conversationHistory: [
        {
          role: 'system',
          content: this.getGroundingEnhancedSystemPrompt(userLocation),
          timestamp: Date.now()
        },
        {
          role: 'user',
          content: this.buildGroundingEnhancedPrompt(geminiRecommendations, userPrompt),
          timestamp: Date.now()
        }
      ],
      toolResults: [],
      isInCorrectionMode: false,
      correctionAttempts: 0
    };

    const stopCapture = startCapture(userPrompt);

    try {
      // Single iteration: Search for each Gemini venue and merge data
      state.currentIteration = 1;
      console.log('\n🔍 ITERATION 1: Enriching Gemini recommendations with Places API data');

      // Build batch search for all Gemini venues
      const searches = geminiRecommendations.map(geminiVenue => {
        // Extract location from description or use user prompt
        const locationHint = geminiVenue.general_location || 
                            userPrompt.match(/in\s+([^,]+)/i)?.[1] || 
                            'Boston';
        
        return {
          query: geminiVenue.name,
          location: locationHint,
          limit: 3  // Get top 3 matches to find best one
        };
      });

      console.log('📍 Searching Google Places for exact venue data...');
      console.log(`   Queries: ${searches.map(s => s.query).join(', ')}`);

      // Execute batch search
      const batchResult = await toolRegistry.executeTool(
        'batch_search_venues',
        { searches: JSON.stringify(searches) },
        { iteration: 1, timestamp: Date.now(), previousResults: [] }
      );

      if (!batchResult.success || !batchResult.data?.results) {
        throw new Error('Batch search failed');
      }

      // Merge Gemini descriptions with Places data
      const mergedVenues = this.mergeGeminiWithPlacesData(
        geminiRecommendations,
        batchResult.data.results
      );

      console.log(`✨ Successfully enriched ${mergedVenues.length}/${geminiRecommendations.length} venues`);

      // Store the tool result
      state.toolResults.push({
        action: 'batch_search_venues',
        success: true,
        data: { results: batchResult.data.results },
        timestamp: Date.now(),
        iteration: 1
      });

      // Build final result
      const resultMessage = this.buildGroundingResultMessage(mergedVenues, geminiRecommendations);

      state.finalResult = resultMessage;
      state.finishParameters = {
        result: resultMessage,
        mode: metadata?.isItinerary ? 'route' : 'discovery',
        selected_venue_ids: mergedVenues.map(v => v.placeId),
        alternatives_map: {}
      };
      state.status = 'complete';

      const executionTime = Date.now() - state.startTime;
      
      console.log('\n✅ GROUNDING-ENHANCED MODE COMPLETE');
      console.log(`   Enriched: ${mergedVenues.length} venues`);
      console.log(`   Execution time: ${executionTime}ms`);

      return {
        success: true,
        result: state.finalResult,
        state,
        iterations: 1,
        tokensUsed: state.totalTokensUsed,
        executionTimeMs: executionTime,
        stoppedReason: 'completed'
      };

    } catch (error) {
      console.error('\n❌ Grounding-enhanced mode error:', error);

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
      try { 
        stopCapture(`Status: ${state.status}\nIterations: ${state.currentIteration}\nVenues: ${state.finishParameters?.selected_venue_ids?.length || 0}`); 
      } catch (e) {}
    }
  }

  /**
   * 🆕 Build prompt for grounding-enhanced mode
   */
  private buildGroundingEnhancedPrompt(
    geminiRecommendations: GeminiVenueRecommendation[],
    originalPrompt: string
  ): string {
    let prompt = `User request: "${originalPrompt}"\n\n`;
    prompt += `Gemini AI has recommended these venues with rich context:\n\n`;

    geminiRecommendations.forEach((venue, idx) => {
      prompt += `${idx + 1}. **${venue.name}**\n`;
      prompt += `   Category: ${venue.category}\n`;
      prompt += `   Description: ${venue.description}\n`;
      if (venue.reasoning) {
        prompt += `   Why recommended: ${venue.reasoning}\n`;
      }
      if (venue.rating) {
        prompt += `   Gemini rating: ${venue.rating}★\n`;
      }
      if (venue.reviewsSummary) {
        prompt += `   Review insights: ${venue.reviewsSummary}\n`;
      }
      prompt += `\n`;
    });

    prompt += `\nYour task: These venues are being searched in Google Places API to get exact coordinates and details. The batch search is executing now.`;

    return prompt;
  }

  /**
   * 🆕 System prompt for grounding-enhanced mode
   */
  private getGroundingEnhancedSystemPrompt(userLocation?: { lat: number; lng: number; name: string }): string {
    const locationContext = userLocation 
      ? `User's current location: ${userLocation.name} (${userLocation.lat}, ${userLocation.lng})\n\n`
      : '';

    return `${locationContext}You are PlanMate in GROUNDING-ENHANCED mode.

🎯 YOUR JOB:
Gemini AI has already recommended venues with rich context and descriptions.
Google Places API is being called to get exact data (coordinates, placeIds, photos) for these venues.

✅ WHAT HAPPENS:
1. Batch search executes for all Gemini recommendations
2. Each recommendation is matched with exact Google Places data
3. Gemini's descriptions are preserved and merged with Places API data
4. Final result combines best of both: context (Gemini) + precision (Places)

🚫 WHAT YOU DON'T NEED TO DO:
- Don't plan again (Gemini already did it!)
- Don't search again (batch search is automatic)
- Don't reason about venue selection (Gemini already chose)
- Just acknowledge that venues are being enriched

The system automatically handles everything in this mode.`;
  }

  /**
   * 🆕 Merge Gemini recommendations with Google Places exact data
   */
  private mergeGeminiWithPlacesData(
    geminiVenues: GeminiVenueRecommendation[],
    placesResults: any[]
  ): any[] {
    const mergedVenues: any[] = [];

    geminiVenues.forEach((geminiVenue, idx) => {
      const placesResult = placesResults[idx];

      // Check if Places API found this venue
      if (!placesResult?.success || !placesResult.venues || placesResult.venues.length === 0) {
        console.warn(`   ⚠️ Could not find "${geminiVenue.name}" in Places API, skipping`);
        return;
      }

      // Take the best match (first result = highest rated and most relevant)
      const placesVenue = placesResult.venues[0];

      // Merge: Places data (exact coords, placeId) + Gemini description (rich context)
      const merged = {
        ...placesVenue,  // All Places API data (placeId, coords, address, photos, etc.)
        
        // Override/enhance with Gemini data
        description: geminiVenue.description,  // ⭐ Rich Gemini description
        gemini_reasoning: geminiVenue.reasoning,  // ⭐ Why Gemini picked this
        gemini_review_summary: geminiVenue.reviewsSummary,  // ⭐ Synthesized insights
        
        // Keep both ratings if available (Places is usually more accurate)
        gemini_rating: geminiVenue.rating,
        places_rating: placesVenue.rating,
        rating: placesVenue.rating || geminiVenue.rating,  // Prefer Places rating
        
        // Metadata
        enriched_with_grounding: true,
        gemini_confidence: geminiVenue.gemini_confidence || 0.9
      };

      console.log(`   ✅ Merged: ${geminiVenue.name}`);
      console.log(`      Places placeId: ${placesVenue.placeId}`);
      console.log(`      Gemini description: ${geminiVenue.description.substring(0, 60)}...`);
      
      mergedVenues.push(merged);
    });

    return mergedVenues;
  }

  /**
   * 🆕 Build result message for grounding-enhanced mode
   */
  private buildGroundingResultMessage(
    mergedVenues: any[],
    originalGeminiVenues: GeminiVenueRecommendation[]
  ): string {
    let message = `🌟 Here's your curated itinerary with ${mergedVenues.length} stops!\n\n`;

    mergedVenues.forEach((venue, idx) => {
      const rating = venue.rating || venue.gemini_rating || 'N/A';
      const priceLevel = venue.priceLevel || 'N/A';
      
      message += `${idx + 1}. **${venue.name}** (⭐ ${rating} • ${priceLevel})\n`;
      message += `   ${venue.description}\n`;
      
      if (venue.gemini_reasoning) {
        message += `   💡 ${venue.gemini_reasoning}\n`;
      }
      
      if (venue.gemini_review_summary) {
        message += `   📝 ${venue.gemini_review_summary}\n`;
      }
      
      message += `\n`;
    });

    if (mergedVenues.length < originalGeminiVenues.length) {
      const missing = originalGeminiVenues.length - mergedVenues.length;
      message += `\n⚠️ Note: ${missing} venue(s) could not be verified in Google Places and were excluded.`;
    }

    return message;
  }

  // ============================================================================
  // EXISTING EXECUTE METHOD (Standard ReAct mode)
  // ============================================================================

  async execute(
    userPrompt: string, 
    userLocation?: { lat: number; lng: number; name: string },
    metadata?: AgentMetadata
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

    // 🆕 RESET: Clear alternatives map for new execution
    this.alternativesMap = {};

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
      while (state.status !== 'complete' && state.status !== 'failed' && state.status !== 'stopped') {
        state.currentIteration++;
        
        console.log(`\n${'='.repeat(80)}`);
        console.log(`🔄 ITERATION ${state.currentIteration}`);
        console.log('='.repeat(80));

        const iterationStart = Date.now();

        const safetyCheck = this.safetyGuards.checkBeforeIteration(state);
        if (!safetyCheck.safe) {
          console.log(`\n⛔ Safety check failed: ${safetyCheck.reason}`);
          state.status = 'stopped';
          state.error = safetyCheck.reason;
          console.log(`⏱️ Iteration ${state.currentIteration} took ${Date.now() - iterationStart}ms (stopped)`);
          break;
        }

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

        if (state.isInCorrectionMode && 
            (action.action === 'search_venues' || action.action === 'batch_search_venues')) {
          
          console.log('⚠️  BLOCKED: Agent tried to search during correction mode');
          
          state.conversationHistory.push({
            role: 'user',
            content: '❌ ERROR: You already have all search results in the conversation history. DO NOT search again!\n\nJust reorder the placeIds you already found and call finish with the corrected order.',
            timestamp: Date.now(),
            iteration: state.currentIteration
          });
          
          state.status = 'thinking';
          console.log(`⏱️ Iteration ${state.currentIteration} took ${Date.now() - iterationStart}ms (blocked search)`);
          continue;
        }

        if (action.action === 'finish') {
          console.log('\n✅ Agent decided task is complete');
          
          if (!action.parameters.result || typeof action.parameters.result !== 'string') {
            console.log('⚠️  Warning: finish called without result parameter, using default');
            action.parameters.result = 'Task completed';
          }
          
          if (!action.parameters.mode || !['discovery', 'route'].includes(action.parameters.mode)) {
            console.log('⚠️  Warning: finish called without valid mode, defaulting to discovery');
            action.parameters.mode = 'discovery';
          }
          
          if (action.parameters.mode === 'route' && !Array.isArray(action.parameters.selected_venues)) {
            console.log('⚠️  Warning: route mode finish without selected_venues array, setting empty array');
            action.parameters.selected_venues = [];
          }
          
          // 🆕 NEW: Clean alternatives - remove duplicates and primary venues
          if (action.parameters.mode === 'route' && action.parameters.selected_venues) {
            this.cleanAlternatives(action.parameters.selected_venues);
          }
          
          console.log(`📋 Finish parameters validated:`, {
            hasResult: !!action.parameters.result,
            mode: action.parameters.mode,
            selectedVenuesCount: action.parameters.selected_venues?.length || 0,
            alternativesCount: Object.keys(this.alternativesMap).length
          });

          if (action.parameters.mode === 'route' && action.parameters.selected_venues.length > 0) {
            console.log('\n🔍 Running route order evaluation...');
            
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

            const isItinerary = metadata?.isItinerary ?? false;
            const originalPrompt = metadata?.originalPrompt ?? userPrompt;

            console.log(`   Route type: ${isItinerary ? 'ITINERARY' : 'EXPLICIT ROUTE'}`);
            console.log(`   Evaluating against: "${originalPrompt}"`);

            const evaluation = await this.evaluator.evaluateRoute(
              originalPrompt,
              action.parameters.selected_venues || [],
              allVenues,
              isItinerary
            );

            if (!evaluation.isValid) {
              if ((state.correctionAttempts ?? 0) >= this.config.maxCorrectionAttempts) {
                console.log(`⚠️  Max correction attempts (${this.config.maxCorrectionAttempts}) reached, accepting current order`);
                state.isInCorrectionMode = false;
              } else {
                console.log('❌ Route order validation failed, asking agent to correct...');
                
                state.correctionAttempts = (state.correctionAttempts ?? 0) + 1;
                state.isInCorrectionMode = true;
                
                const correctionFeedback = this.evaluator.generateCorrectionFeedback(evaluation);
                
                state.conversationHistory.push({
                  role: 'user',
                  content: correctionFeedback,
                  timestamp: Date.now(),
                  iteration: state.currentIteration
                });

                state.status = 'thinking';
                console.log(`⏱️ Iteration ${state.currentIteration} took ${Date.now() - iterationStart}ms (correction needed)`);
                continue;
              }
            } else {
              console.log('✅ Route order validation passed!');
              state.isInCorrectionMode = false;
            }
          }
          
          state.finalResult = action.parameters.result;
          state.finishParameters = {
            result: action.parameters.result,
            mode: action.parameters.mode as 'discovery' | 'route',
            selected_venue_ids: action.parameters.selected_venues || [],
            alternatives_map: this.alternativesMap
          };
          
          state.status = 'complete';
          console.log(`⏱️ Iteration ${state.currentIteration} took ${Date.now() - iterationStart}ms (finish)`);
          break;
        }

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

        console.log('\n⚡ ACTING...');
        state.status = 'acting';
        const result = await this.act(action, state);
        
        console.log(`   Success: ${result.success}`);
        if (result.success) {
          console.log(`   Data: ${JSON.stringify(result.data).substring(0, 200)}...`);
        } else {
          console.log(`   Error: ${result.error}`);
        }

        // 🆕 NEW: Capture alternatives from batch_search_venues results
        if (action.action === 'batch_search_venues' && result.success && result.data?.results) {
          this.captureAlternatives(result.data.results);
        }

        console.log('\n👁️  OBSERVING...');
        state.status = 'observing';
        this.observe(action.action, result, state);
        
        console.log(`   Added observation to conversation history`);
        console.log(`   Total messages: ${state.conversationHistory.length}`);
        console.log(`   Total tokens used: ${state.totalTokensUsed}`);
        console.log(`⏱️ Iteration ${state.currentIteration} took ${Date.now() - iterationStart}ms`);
      }

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
      console.log(`Alternatives captured: ${Object.keys(this.alternativesMap).length} stops`);
      
      if (state.status === 'stopped') {
        console.log(`⛔ Stopped reason: ${state.error}`);
      }
      
      console.log('='.repeat(80) + '\n');

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

  // 🆕 NEW: Method to capture alternatives from batch search results
  private captureAlternatives(batchResults: any[]): void {
    console.log('\n📦 Capturing alternatives from batch search...');
    
    batchResults.forEach((searchResult, index) => {
      if (!searchResult.success || !searchResult.venues || searchResult.venues.length === 0) {
        console.log(`   ⚠️  Search ${index + 1} (${searchResult.query}): No venues found`);
        return;
      }

      const venues = searchResult.venues;
      const query = searchResult.query;
      
      const primaryVenue = venues[0];
      const primaryPlaceId = primaryVenue.placeId;
      
      const alternatives = venues.slice(1, 3);
      
      if (alternatives.length > 0) {
        this.alternativesMap[primaryPlaceId] = {
          alternatives: alternatives,
          searchQuery: query
        };
        
        console.log(`   ✅ Stop ${index + 1} (${primaryVenue.name}): ${alternatives.length} alternatives captured`);
        alternatives.forEach((alt: { name: any; rating: any; }, i: number) => {
          console.log(`      ${i + 1}. ${alt.name} (${alt.rating || 'N/A'}⭐)`);
        });
      } else {
        console.log(`   ⚠️  Stop ${index + 1} (${primaryVenue.name}): No alternatives available`);
      }
    });
    
    console.log(`\n📦 Total alternatives captured: ${Object.keys(this.alternativesMap).length} stops\n`);
  }

  // 🆕 NEW: Clean alternatives - remove venues already in primary route and duplicates
  private cleanAlternatives(selectedVenueIds: string[]): void {
    console.log('\n🧹 Cleaning alternatives...');
    
    const primaryPlaceIds = new Set(selectedVenueIds.filter(id => id !== 'user-location'));
    console.log(`   Primary venues: ${primaryPlaceIds.size} stops`);
    
    const usedAlternativePlaceIds = new Set<string>();
    
    let removedCount = 0;
    let duplicateCount = 0;
    
    Object.keys(this.alternativesMap).forEach(primaryPlaceId => {
      const altInfo = this.alternativesMap[primaryPlaceId];
      const originalCount = altInfo.alternatives.length;
      
      altInfo.alternatives = altInfo.alternatives.filter(alt => {
        const altPlaceId = alt.placeId;
        
        if (primaryPlaceIds.has(altPlaceId)) {
          console.log(`   ❌ Removed "${alt.name}" - already in primary route`);
          removedCount++;
          return false;
        }
        
        if (usedAlternativePlaceIds.has(altPlaceId)) {
          console.log(`   ❌ Removed "${alt.name}" - duplicate alternative`);
          duplicateCount++;
          return false;
        }
        
        usedAlternativePlaceIds.add(altPlaceId);
        return true;
      });
      
      const newCount = altInfo.alternatives.length;
      if (newCount < originalCount) {
        console.log(`   🔧 Stop "${primaryPlaceId.substring(0, 20)}...": ${originalCount} → ${newCount} alternatives`);
      }
      
      if (altInfo.alternatives.length === 0) {
        delete this.alternativesMap[primaryPlaceId];
      }
    });
    
    console.log(`\n✅ Cleaning complete:`);
    console.log(`   Removed ${removedCount} venues already in route`);
    console.log(`   Removed ${duplicateCount} duplicate alternatives`);
    console.log(`   Final: ${Object.keys(this.alternativesMap).length} stops with alternatives\n`);
  }

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
    - result (REQUIRED): Rich, contextual description using all venue data
    - mode (REQUIRED): "discovery" or "route"
    - selected_venues (REQUIRED for route mode): Array of placeIds in order
    
NOTE: When you call batch_search_venues, the system will automatically capture alternatives for each primary venue you select. You don't need to do anything special - just pick the best venues as you normally would.`,
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
                  description: 'Parameters for the action',
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

  private observe(actionName: ActionType, result: ToolResultType, state: AgentState): void {
    let observation: string;
    
    if (!result.success) {
      observation = `Action '${actionName}' failed. Error: ${result.error}`;
    } else {
      switch (actionName) {
        case 'batch_search_venues':
          const batchResults = result.data?.results || [];
          const compactSummary = batchResults.map((r: any) => {
            if (!r.success || !r.venues || r.venues.length === 0) {
              return `${r.query}:0`;
            }
            const venueList = r.venues.map((v: any) => 
              `${v.name}|${v.address}|${v.placeId}|${v.rating || 'N/A'}⭐|${v.priceLevel || 'N/A'}|${v.description?.substring(0, 100) || 'No desc'}`
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
              `${v.name}|${v.address}|${v.placeId}|${v.rating || 'N/A'}⭐|${v.priceLevel || 'N/A'}|${v.description?.substring(0, 100) || 'No desc'}`
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

  private getSystemPrompt(userLocation?: { lat: number; lng: number; name: string }): string {
    const toolDefinitions = toolRegistry.getToolDefinitions();
    
    const locationContext = userLocation 
  ? `**USER LOCATION:** ${userLocation.name} at ${userLocation.lat}, ${userLocation.lng}

🎯 CRITICAL: User location handling has TWO cases:

**CASE 1: Discovery/Search (near me, nearest, etc.)**
When user says "near me", "nearest", "around me", "close to me", "nearby":
→ Use near_coordinates parameter: "${userLocation.lat},${userLocation.lng}" but not if mentioned near a particular place

**CASE 2: Routes (my location as waypoint)**
When user says "from my location", "from me", "from here":
→ DON'T search for it! Use coordinates directly as waypoint.

**DO NOT search for:** "my location", "here", "me", "current location", "where I am"
These are NOT venue names - they refer to coordinates: ${userLocation.lat}, ${userLocation.lng}
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
╔═══════════════════════════════════════════════════════════════════════════╗
🎯 CRITICAL: WAYPOINT ORDER PRESERVATION
╚═══════════════════════════════════════════════════════════════════════════╝

**You MUST preserve the EXACT order from the user's prompt!**

╔═══════════════════════════════════════════════════════════════════════════╗
🎯 TWO MODES
╚═══════════════════════════════════════════════════════════════════════════╝

MODE 1 – DISCOVERY (Find Venues)
Triggers like: "Find…", "Show me…", "Where are…", "Best…", "Search for…"

Strategy:
- ONE search_venues call only
- Return top 10 results maximum if not mentioned
- mode="discovery"
- Format result text with compelling descriptions using venue data

MODE 2 – ROUTE PLANNING (Connect Multiple Locations)
Triggers like: "Route from…", "Path from… to… via…", "Plan route…"

Strategy - USE BATCH SEARCH FOR SPEED:
1. **Identify ALL waypoints** (skip "my location", "here", "me")
2. **Use batch_search_venues** for actual venues only
3. **Select ONE primary venue** from each search result
4. **Skip distance calculations** - frontend handles this
5. **Call finish with correct order:**
   - result: Rich narrative using ALL venue data (rating, price, types, description)
   - mode: "route"
   - selected_venues: [placeId1, "user-location", placeId2, ...] in EXACT order

🆕 **HANDLING COORDINATES IN LOCATION:**
Agent 1 may provide coordinates (e.g., "42.365,-71.054") when user says "near me".
Just pass these through to batch_search_venues - the tool will automatically use nearbySearch.

Example Agent 1 output:
"Find 4 venues in 42.365,-71.054: bakery, cafe, restaurant, bar"

Your batch search:
{
  "searches": [
    {
      "query": "bakery",
      "location": "42.365,-71.054",
      "limit": 3
    }
  ]
}

The batch search tool will detect coordinates and search nearby automatically.

🆕 **ALTERNATIVES ARE AUTOMATICALLY CAPTURED:**
When you use batch_search_venues and select the best venue from each category, the system automatically saves 2-3 alternative venues for each stop. You don't need to do anything special - just focus on picking the best primary route!

╔═══════════════════════════════════════════════════════════════════════════╗
🛠️ AVAILABLE TOOLS
╚═══════════════════════════════════════════════════════════════════════════╝

${toolDescriptions}

finish:
  • result (required): Rich, contextual description using ALL venue data
    
    STRUCTURE:
    - Opening: "[Emoji] Here's your [occasion] in [location]! [1-2 sentence vibe/flow overview]"
    - Venues: Numbered list with RICH descriptions (2-3 sentences each)
    - Closing: "✨ [Why this works + practical info]"
    
    USE ALL VENUE DATA in descriptions:
    - Name + what it's known for (from description/types)
    - Atmosphere (casual/upscale/historic from price + types)
    - What to do there (grab drinks/explore/enjoy views based on types)
    - Why it fits THIS request (bar crawl→lively, date→romantic)
    - Rating context (4.5+: "highly rated", <4.0: explain appeal)
    - Price context ($: budget-friendly, $$$$: premium)
    
    EXAMPLE: "🗺️ Here's your Fenway bar crawl!\n\n1. 🍺 Bleacher Bar (⭐ 4.5 • $$)\n   Start at this iconic sports bar built into Fenway Park's center field wall. Grab craft beers while catching the game atmosphere - legendary Boston experience.\n\n2. 🍺 Lansdowne Pub (⭐ 4.3 • $$)\n   Energetic multi-level pub with DJ nights and young crowd. Try the rotating craft selection.\n\n✨ Tight 0.3-mile radius = more drinks, less walking!"
  
  • mode (required): "discovery" or "route"
  • selected_venues (required for route): Array of placeIds ONLY
    - Format: ["ChIJ...", "user-location", "ChIJ..."]

╔═══════════════════════════════════════════════════════════════════════════╗
🚨 CRITICAL: selected_venues FORMAT
╚═══════════════════════════════════════════════════════════════════════════╝

**CORRECT:** ["ChIJqygAFrRZwokRwF0VrBoXS0E", "user-location", "ChIJb8Jg9pZYwokR-qHGtvSkLzs"]
**WRONG:** ["Vessel|20 Hudson Yards|ChIJ...", ...]

╔═══════════════════════════════════════════════════════════════════════════╗
✅ QUALITY STANDARDS
╚═══════════════════════════════════════════════════════════════════════════╝

- NEVER search for "my location", "here", "me", "current location"
- ALWAYS preserve exact waypoint order from user's prompt
- ONLY use placeId strings in selected_venues (format: "ChIJ...")
- Extract exact placeIds from observations
- Use real API data only (never fabricate)
- CREATE RICH DESCRIPTIONS using all venue data (rating, price, types, description)
- EXPLAIN WHY each venue fits the occasion
- ADD CONTEXT about atmosphere, what to do, and flow between stops

╔═══════════════════════════════════════════════════════════════════════════╗
❌ NEVER DO
╚═══════════════════════════════════════════════════════════════════════════╝

- Don't search for user location references as venue names
- Don't reorder waypoints - keep user's exact order
- Don't calculate distances (frontend handles this)
- Don't use sub-locations when user wants main location
- Don't give boring generic descriptions - use the venue data to make it compelling!

Think step-by-step, recognize user location references, preserve order, and create rich, helpful itinerary descriptions!`;
  }
}