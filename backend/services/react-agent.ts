

// // backend/services/react-agent.ts - FIXED VERSION
// // ✅ FIX: Added clear rules for when to use user location vs venue-specific locations

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
// import type { GeminiVenueRecommendation } from './gemini-grounding-agent.js';

// const openai = new OpenAI({
//   apiKey: process.env.OPENAI_API_KEY
// });

// interface AgentMetadata {
//   isItinerary?: boolean;
//   originalPrompt?: string;
//   geminiRecommendations?: GeminiVenueRecommendation[];
//   useGroundingMode?: boolean;
// }

// interface AlternativesMap {
//   [primaryPlaceId: string]: {
//     alternatives: any[];
//     searchQuery: string;
//   };
// }

// export class ReActAgent {
//   private safetyGuards: SafetyGuards;
//   private config: SafetyConfig;
//   private evaluator: RouteEvaluator;
//   private alternativesMap: AlternativesMap = {};

//   constructor(config: SafetyConfig = DEFAULT_SAFETY_CONFIG) {
//     this.config = config;
//     this.safetyGuards = new SafetyGuards(config);
//     this.evaluator = new RouteEvaluator();
//   }

//   // ============================================================================
//   // GROUNDING-ENHANCED EXECUTION MODE
//   // ============================================================================

//   async executeWithGrounding(
//     userPrompt: string,
//     geminiRecommendations: GeminiVenueRecommendation[],
//     userLocation?: { lat: number; lng: number; name: string },
//     metadata?: AgentMetadata
//   ): Promise<ReActResponse> {
//     console.log('\n🌟 ReAct Agent: GROUNDING-ENHANCED MODE');
//     console.log(`📝 Processing ${geminiRecommendations.length} Gemini recommendations`);
//     console.log('🎯 Two-phase search: Exact venues + Alternatives');

//     this.alternativesMap = {};

//     const state: AgentState = {
//       status: 'thinking',
//       currentIteration: 0,
//       startTime: Date.now(),
//       totalTokensUsed: 0,
//       conversationHistory: [
//         {
//           role: 'system',
//           content: this.getGroundingEnhancedSystemPrompt(userLocation),
//           timestamp: Date.now()
//         },
//         {
//           role: 'user',
//           content: this.buildGroundingEnhancedPrompt(geminiRecommendations, userPrompt),
//           timestamp: Date.now()
//         }
//       ],
//       toolResults: [],
//       isInCorrectionMode: false,
//       correctionAttempts: 0
//     };

//     const stopCapture = startCapture(userPrompt);

//     try {
//       state.currentIteration = 1;
      
//       const locationHint = userPrompt.match(/in\s+([^,]+)/i)?.[1] || 
//                           geminiRecommendations[0]?.general_location;

//       // PHASE 1: Find EXACT venues
//       console.log('\n📍 PHASE 1: Searching for exact venues Gemini recommended...');
      
//       const exactSearches = geminiRecommendations.map(geminiVenue => ({
//         query: geminiVenue.name,
//         location: geminiVenue.general_location || locationHint,
//         limit: 1
//       }));

//     const exactResult = await toolRegistry.executeTool(
//       'batch_search_venues',
//       { searches: JSON.stringify(exactSearches) },
//       { iteration: 1, timestamp: Date.now(), previousResults: [] }
//     );

//     // Debug: log the full exactResult to diagnose failures in Phase 1
//     try {
//       console.log('   🔍 Phase 1 exactResult:', JSON.stringify(exactResult, null, 2));
//     } catch (e) {
//       console.log('   🔍 Phase 1 exactResult (non-serializable):', exactResult);
//     }

//     if (!exactResult.success || !exactResult.data?.results) {
//       console.error('   ❌ Phase 1 search failed. Tool response:', exactResult);
//       throw new Error('Phase 1 search failed: ' + (exactResult.error || 'unknown error'));
//     }

//       const primaryVenues = this.mergeGeminiWithPlacesData(
//         geminiRecommendations,
//         exactResult.data.results
//       );

//       console.log(`✅ Phase 1 complete: Found ${primaryVenues.length}/${geminiRecommendations.length} exact venues`);

//       // PHASE 2: Find ALTERNATIVES
//       console.log('\n📦 PHASE 2: Searching for alternatives near each venue...');

//       const alternativeSearches = primaryVenues.map((venue, idx) => {
//         const geminiVenue = geminiRecommendations[idx];
        
//         return {
//           query: geminiVenue.category,
//           location: `${venue.location.lat},${venue.location.lng}`,
//           radius: '0.5 miles',
//           limit: 5
//         };
//       });

//       console.log(`   Searching for alternatives near ${primaryVenues.length} venues...`);

//       const alternativesResult = await toolRegistry.executeTool(
//         'batch_search_venues',
//         { searches: JSON.stringify(alternativeSearches) },
//         { iteration: 1, timestamp: Date.now(), previousResults: state.toolResults }
//       );

//       if (alternativesResult.success && alternativesResult.data?.results) {
//         alternativesResult.data.results.forEach((searchResult: any, idx: number) => {
//           if (!searchResult.success || !searchResult.venues || searchResult.venues.length === 0) {
//             console.log(`   ⚠️ No alternatives found for venue ${idx + 1}`);
//             return;
//           }

//           const primaryVenue = primaryVenues[idx];
//           const primaryPlaceId = primaryVenue.placeId;
          
//           const alternatives = searchResult.venues.filter((v: any) => 
//             v.placeId !== primaryPlaceId
//           ).slice(0, 4);

//           if (alternatives.length > 0) {
//             this.alternativesMap[primaryPlaceId] = {
//               alternatives: alternatives,
//               searchQuery: geminiRecommendations[idx].category
//             };
            
//             console.log(`   ✅ Venue ${idx + 1} (${primaryVenue.name}): ${alternatives.length} alternatives`);
//             alternatives.slice(0, 3).forEach((alt: any, altIdx: number) => {
//               console.log(`      ${altIdx + 1}. ${alt.name} (${alt.rating || 'N/A'}⭐)`);
//             });
//           } else {
//             console.log(`   ⚠️ Venue ${idx + 1} (${primaryVenue.name}): No alternatives found`);
//           }
//         });
//       }

//       console.log(`\n📦 Phase 2 complete: ${Object.keys(this.alternativesMap).length} stops with alternatives`);

//       state.toolResults.push({
//         action: 'batch_search_venues',
//         success: true,
//         data: { results: exactResult.data.results },
//         timestamp: Date.now(),
//         iteration: 1
//       });

//       state.toolResults.push({
//         action: 'batch_search_venues',
//         success: true,
//         data: { results: alternativesResult.data?.results || [] },
//         timestamp: Date.now(),
//         iteration: 1
//       });

//       const resultMessage = this.buildGroundingResultMessage(primaryVenues, geminiRecommendations);
//       const selectedPlaceIds = primaryVenues.map(v => v.placeId);
//       this.cleanAlternatives(selectedPlaceIds);

//       state.finalResult = resultMessage;
//       state.finishParameters = {
//         result: resultMessage,
//         mode: metadata?.isItinerary ? 'route' : 'discovery',
//         selected_venue_ids: selectedPlaceIds,
//         alternatives_map: this.alternativesMap
//       };
//       state.status = 'complete';

//       const executionTime = Date.now() - state.startTime;
      
//       console.log('\n✅ GROUNDING-ENHANCED MODE COMPLETE');
//       console.log(`   Primary venues: ${primaryVenues.length}`);
//       console.log(`   Alternatives: ${Object.keys(this.alternativesMap).length} stops with alternatives`);
//       console.log(`   Execution time: ${executionTime}ms`);

//       if (Object.keys(this.alternativesMap).length > 0) {
//         console.log('\n📋 Final alternatives:');
//         Object.entries(this.alternativesMap).forEach(([placeId, info]) => {
//           const primaryVenue = primaryVenues.find(v => v.placeId === placeId);
//           console.log(`   ${primaryVenue?.name}: ${info.alternatives.length} alternatives`);
//         });
//       }

//       return {
//         success: true,
//         result: state.finalResult,
//         state,
//         iterations: 1,
//         tokensUsed: state.totalTokensUsed,
//         executionTimeMs: executionTime,
//         stoppedReason: 'completed'
//       };

//     } catch (error) {
//       console.error('\n❌ Grounding-enhanced mode error:', error);

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
//       try { 
//         stopCapture(`Status: ${state.status}\nIterations: ${state.currentIteration}\nVenues: ${state.finishParameters?.selected_venue_ids?.length || 0}\nAlternatives: ${Object.keys(this.alternativesMap).length}`); 
//       } catch (e) {}
//     }
//   }

//   private buildGroundingEnhancedPrompt(
//     geminiRecommendations: GeminiVenueRecommendation[],
//     originalPrompt: string
//   ): string {
//     let prompt = `User request: "${originalPrompt}"\n\n`;
//     prompt += `Gemini AI has recommended these venues with rich context:\n\n`;

//     geminiRecommendations.forEach((venue, idx) => {
//       prompt += `${idx + 1}. **${venue.name}**\n`;
//       prompt += `   Category: ${venue.category}\n`;
//       prompt += `   Description: ${venue.description}\n`;
//       if (venue.reasoning) {
//         prompt += `   Why recommended: ${venue.reasoning}\n`;
//       }
//       if (venue.rating) {
//         prompt += `   Gemini rating: ${venue.rating}★\n`;
//       }
//       if (venue.reviewsSummary) {
//         prompt += `   Review insights: ${venue.reviewsSummary}\n`;
//       }
//       prompt += `\n`;
//     });

//     prompt += `\nYour task: These venues are being searched in Google Places API to get exact coordinates and details. The batch search is executing now.`;

//     return prompt;
//   }

//   private getGroundingEnhancedSystemPrompt(userLocation?: { lat: number; lng: number; name: string }): string {
//     const locationContext = userLocation 
//       ? `User's current location: ${userLocation.name} (${userLocation.lat}, ${userLocation.lng})\n\n`
//       : '';

//     return `${locationContext}You are PlanMate in GROUNDING-ENHANCED mode.

// 🎯 YOUR JOB:
// Gemini AI has already recommended venues with rich context and descriptions.
// Google Places API is being called to get exact data (coordinates, placeIds, photos) for these venues.

// ✅ WHAT HAPPENS:
// 1. Batch search executes for all Gemini recommendations
// 2. Each recommendation is matched with exact Google Places data
// 3. Gemini's descriptions are preserved and merged with Places API data
// 4. Final result combines best of both: context (Gemini) + precision (Places)

// 🚫 WHAT YOU DON'T NEED TO DO:
// - Don't plan again (Gemini already did it!)
// - Don't search again (batch search is automatic)
// - Don't reason about venue selection (Gemini already chose)
// - Just acknowledge that venues are being enriched

// The system automatically handles everything in this mode.`;
//   }

//   private mergeGeminiWithPlacesData(
//     geminiVenues: GeminiVenueRecommendation[],
//     placesResults: any[]
//   ): any[] {
//     const mergedVenues: any[] = [];

//     geminiVenues.forEach((geminiVenue, idx) => {
//       const placesResult = placesResults[idx];

//       if (!placesResult?.success || !placesResult.venues || placesResult.venues.length === 0) {
//         console.warn(`   ⚠️ Could not find "${geminiVenue.name}" in Places API, skipping`);
//         return;
//       }

//       const placesVenue = placesResult.venues[0];

//       const merged = {
//         ...placesVenue,
//         description: geminiVenue.description,
//         gemini_reasoning: geminiVenue.reasoning,
//         gemini_review_summary: geminiVenue.reviewsSummary,
//         gemini_rating: geminiVenue.rating,
//         places_rating: placesVenue.rating,
//         rating: placesVenue.rating || geminiVenue.rating,
//         enriched_with_grounding: true,
//         gemini_confidence: geminiVenue.gemini_confidence || 0.9
//       };

//       console.log(`   ✅ Merged: ${geminiVenue.name}`);
//       console.log(`      Places placeId: ${placesVenue.placeId}`);
//       console.log(`      Gemini description: ${geminiVenue.description.substring(0, 60)}...`);
      
//       mergedVenues.push(merged);
//     });

//     return mergedVenues;
//   }

//   private buildGroundingResultMessage(
//     mergedVenues: any[],
//     originalGeminiVenues: GeminiVenueRecommendation[]
//   ): string {
//     let message = `🌟 Here's your curated itinerary with ${mergedVenues.length} stops!\n\n`;

//     mergedVenues.forEach((venue, idx) => {
//       const rating = venue.rating || venue.gemini_rating || 'N/A';
//       const priceLevel = venue.priceLevel || 'N/A';
      
//       message += `${idx + 1}. **${venue.name}** (⭐ ${rating} • ${priceLevel})\n`;
//       message += `   ${venue.description}\n`;
      
//       if (venue.gemini_reasoning) {
//         message += `   💡 ${venue.gemini_reasoning}\n`;
//       }
      
//       if (venue.gemini_review_summary) {
//         message += `   📝 ${venue.gemini_review_summary}\n`;
//       }
      
//       message += `\n`;
//     });

//     if (mergedVenues.length < originalGeminiVenues.length) {
//       const missing = originalGeminiVenues.length - mergedVenues.length;
//       message += `\n⚠️ Note: ${missing} venue(s) could not be verified in Google Places and were excluded.`;
//     }

//     return message;
//   }

//   // ============================================================================
//   // STANDARD REACT EXECUTION MODE
//   // ============================================================================

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
          
//           if (action.parameters.mode === 'route' && action.parameters.selected_venues) {
//             this.cleanAlternatives(action.parameters.selected_venues);
//           }
          
//           console.log(`📋 Finish parameters validated:`, {
//             hasResult: !!action.parameters.result,
//             mode: action.parameters.mode,
//             selectedVenuesCount: action.parameters.selected_venues?.length || 0,
//             alternativesCount: Object.keys(this.alternativesMap).length
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
//       console.log(`Alternatives captured: ${Object.keys(this.alternativesMap).length} stops`);
      
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

//   private captureAlternatives(batchResults: any[]): void {
//     console.log('\n📦 Capturing alternatives from batch search...');
    
//     batchResults.forEach((searchResult, index) => {
//       if (!searchResult.success || !searchResult.venues || searchResult.venues.length === 0) {
//         console.log(`   ⚠️  Search ${index + 1} (${searchResult.query}): No venues found`);
//         return;
//       }

//       const venues = searchResult.venues;
//       const query = searchResult.query;
      
//       const primaryVenue = venues[0];
//       const primaryPlaceId = primaryVenue.placeId;
      
//       const alternatives = venues.slice(1, 3);
      
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

//   private cleanAlternatives(selectedVenueIds: string[]): void {
//     console.log('\n🧹 Cleaning alternatives...');
    
//     const primaryPlaceIds = new Set(selectedVenueIds.filter(id => id !== 'user-location'));
//     console.log(`   Primary venues: ${primaryPlaceIds.size} stops`);
    
//     const usedAlternativePlaceIds = new Set<string>();
    
//     let removedCount = 0;
//     let duplicateCount = 0;
    
//     Object.keys(this.alternativesMap).forEach(primaryPlaceId => {
//       const altInfo = this.alternativesMap[primaryPlaceId];
//       const originalCount = altInfo.alternatives.length;
      
//       altInfo.alternatives = altInfo.alternatives.filter(alt => {
//         const altPlaceId = alt.placeId;
        
//         if (primaryPlaceIds.has(altPlaceId)) {
//           console.log(`   ❌ Removed "${alt.name}" - already in primary route`);
//           removedCount++;
//           return false;
//         }
        
//         if (usedAlternativePlaceIds.has(altPlaceId)) {
//           console.log(`   ❌ Removed "${alt.name}" - duplicate alternative`);
//           duplicateCount++;
//           return false;
//         }
        
//         usedAlternativePlaceIds.add(altPlaceId);
//         return true;
//       });
      
//       const newCount = altInfo.alternatives.length;
//       if (newCount < originalCount) {
//         console.log(`   🔧 Stop "${primaryPlaceId.substring(0, 20)}...": ${originalCount} → ${newCount} alternatives`);
//       }
      
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
//     - result (REQUIRED): Rich, contextual description using all venue data
//     - mode (REQUIRED): "discovery" or "route"
//     - selected_venues (REQUIRED for route mode): Array of placeIds in order
    
// NOTE: When you call batch_search_venues, the system will automatically capture alternatives for each primary venue you select.`,
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

//   // ============================================================================
//   // ✅ FIXED SYSTEM PROMPT - Clear Search Location Rules
//   // ============================================================================

//   private getSystemPrompt(userLocation?: { lat: number; lng: number; name: string }): string {
//     const toolDefinitions = toolRegistry.getToolDefinitions();
    
//     const locationContext = userLocation 
//   ? `**USER LOCATION:** ${userLocation.name} at coordinates ${userLocation.lat}, ${userLocation.lng}

// ╔═══════════════════════════════════════════════════════════════════════════╗
// 🎯 CRITICAL: WHEN TO USE USER LOCATION COORDINATES
// ╚═══════════════════════════════════════════════════════════════════════════╝

// **✅ USE USER COORDINATES when user says:**
// - "near me", "around me", "nearby", "close to me"
// - "coffee shops near me" → search location: "${userLocation.lat},${userLocation.lng}"
// - "restaurants around here" → search location: "${userLocation.lat},${userLocation.lng}"

// **❌ DO NOT USE USER COORDINATES for:**
// - Named venues: "Harvard University" → search location: "Cambridge, MA"
// - Famous places: "MIT", "Fenway Park" → search by venue name + known city
// - "near [other place]": "Starbucks near MIT" → use MIT area coordinates, NOT user location

// ╔═══════════════════════════════════════════════════════════════════════════╗
// 📍 SEARCH LOCATION STRATEGY FOR ROUTES
// ╚═══════════════════════════════════════════════════════════════════════════╝

// When planning routes, determine the LOGICAL location for each waypoint:

// **Example: "route from my location to Harvard to Starbucks near MIT"**

// CORRECT SEARCH LOCATIONS:
// {
//   "searches": [
//     {
//       "query": "Harvard University",
//       "location": "Cambridge, MA",           // ✅ Harvard is in Cambridge
//       "limit": 3
//     },
//     {
//       "query": "Starbucks",
//       "location": "42.3601,-71.0942",       // ✅ MIT coordinates (not user!)
//       "limit": 3
//     }
//   ]
// }

// WRONG:
// {
//   "searches": [
//     {
//       "query": "Harvard University",
//       "location": "${userLocation.lat},${userLocation.lng}",  // ❌ Using user coords!
//       "limit": 3
//     }
//   ]
// }

// **ROUTE WAYPOINT RULES:**
// - "my location" / "from here" → DON'T search, use "user-location" in selected_venues
// - Named venue (Harvard, MIT, Fenway) → search by name + city/area
// - "near [place]" → search using THAT place's coordinates
// - "near me" → use user coordinates
// ` 
//   : `**USER LOCATION:** Not provided.

// If user mentions "near me", "my location" → inform them location services are not available.
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

// ╔═══════════════════════════════════════════════════════════════════════════╗
// 🎯 CRITICAL: WAYPOINT ORDER PRESERVATION
// ╚═══════════════════════════════════════════════════════════════════════════╝

// **You MUST preserve the EXACT order from the user's prompt!**

// ╔═══════════════════════════════════════════════════════════════════════════╗
// 🎯 TWO MODES
// ╚═══════════════════════════════════════════════════════════════════════════╝

// MODE 1 – DISCOVERY (Find Venues)
// Triggers: "Find…", "Show me…", "Where are…", "Best…", "Search for…"

// Strategy:
// - ONE search_venues call only
// - Return top 10 results
// - mode="discovery"
// - Rich descriptions using venue data

// MODE 2 – ROUTE PLANNING (Connect Multiple Locations)
// Triggers: "Route from…", "Path from… to… via…", "Plan route…"

// Strategy - USE BATCH SEARCH FOR SPEED:
// 1. **Identify ALL waypoints** (skip "my location", "here", "me")
// 2. **Use batch_search_venues** for actual venues only
// 3. **Choose correct search location for each venue** (see rules above!)
// 4. **Select ONE primary venue** from each search result
// 5. **Call finish with correct order:**
//    - result: Rich narrative with ALL venue data
//    - mode: "route"
//    - selected_venues: ["ChIJ...", "user-location", "ChIJ..."] in EXACT order

// ╔═══════════════════════════════════════════════════════════════════════════╗
// 🛠️ AVAILABLE TOOLS
// ╚═══════════════════════════════════════════════════════════════════════════╝

// ${toolDescriptions}

// finish:
//   • result (required): Rich description using ALL venue data (name, rating, price, description, atmosphere, why it fits)
//   • mode (required): "discovery" or "route"
//   • selected_venues (required for route): Array of placeIds ONLY ["ChIJ...", "user-location", "ChIJ..."]

// ╔═══════════════════════════════════════════════════════════════════════════╗
// ✅ QUALITY STANDARDS
// ╚═══════════════════════════════════════════════════════════════════════════╝

// - NEVER search for "my location", "here", "me", "current location"
// - ALWAYS preserve exact waypoint order from user's prompt
// - ONLY use placeId strings in selected_venues (format: "ChIJ...")
// - Use correct search locations (user coords only for "near me", otherwise venue-specific)
// - CREATE RICH DESCRIPTIONS using all venue data
// - EXPLAIN WHY each venue fits the occasion

// Think step-by-step, use correct search locations, preserve order, and create rich descriptions!`;
//   }
// }

// backend/services/react-agent.ts - COMPLETE FIXED VERSION

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
import type { GeminiVenueRecommendation } from './gemini-grounding-agent.js';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

interface AgentMetadata {
  isItinerary?: boolean;
  originalPrompt?: string;
  geminiRecommendations?: GeminiVenueRecommendation[];
  useGroundingMode?: boolean;
}

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
  private alternativesMap: AlternativesMap = {};

  constructor(config: SafetyConfig = DEFAULT_SAFETY_CONFIG) {
    this.config = config;
    this.safetyGuards = new SafetyGuards(config);
    this.evaluator = new RouteEvaluator();
  }

  /**
   * 🆕 Extract city name from user location for search queries
   * Converts "Chinatown, New York, New York, United States" → "New York, New York"
   */
  private extractCityFromUserLocation(userLocation?: { lat: number; lng: number; name: string }): string | null {
    if (!userLocation || !userLocation.name) {
      return null;
    }
    
    const parts = userLocation.name.split(',').map((p: string) => p.trim());
    
    // Handle different location name formats:
    // "Chinatown, New York, New York, United States" → ["Chinatown", "New York", "New York", "United States"]
    // "Boston, Massachusetts, United States" → ["Boston", "Massachusetts", "United States"]
    // "Manhattan, NY, USA" → ["Manhattan", "NY", "USA"]
    
    if (parts.length >= 3) {
      // Get city (2nd part) and state (3rd part)
      const city = parts[1];
      const state = parts[2];
      
      // Check if state is a US state code or full name
      const isStateCode = state.length <= 3;
      
      return isStateCode ? `${city}, ${state}` : city;
    } else if (parts.length === 2) {
      // Just city and country: "Paris, France"
      return parts[0];
    } else {
      // Single part or unexpected format
      return parts[0];
    }
  }

  // ============================================================================
  // GROUNDING-ENHANCED EXECUTION MODE
  // ============================================================================

  async executeWithGrounding(
    userPrompt: string,
    geminiRecommendations: GeminiVenueRecommendation[],
    userLocation?: { lat: number; lng: number; name: string },
    metadata?: AgentMetadata
  ): Promise<ReActResponse> {
    console.log('\n🌟 ReAct Agent: GROUNDING-ENHANCED MODE');
    console.log(`📝 Processing ${geminiRecommendations.length} Gemini recommendations`);
    console.log('🎯 Two-phase search: Exact venues + Alternatives');

    this.alternativesMap = {};

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
      state.currentIteration = 1;
      
      // 🆕 SMART LOCATION EXTRACTION
      const extractCityFromPrompt = (prompt: string): string | undefined => {
        // Try to extract city from common patterns
        const patterns = [
          /in\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/,  // "in Boston", "in New York"
          /near\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/,  // "near Manhattan"
        ];
        
        for (const pattern of patterns) {
          const match = prompt.match(pattern);
          if (match) return match[1];
        }
        return undefined;
      };

      // 🆕 PRIORITY ORDER FOR LOCATION FALLBACK:
      // 1. Extract city from user location if available
      // 2. Extract city from prompt
      // 3. Use first Gemini venue's location
      // 4. Default to coordinates if we have user location
      // 5. Last resort: "Boston, MA"
      
      let fallbackLocation: string;
      
      if (userLocation) {
        // Priority 1: Extract clean city name from user location
        const extractedCity = this.extractCityFromUserLocation(userLocation);
        
        if (extractedCity) {
          fallbackLocation = extractedCity;
          console.log(`📍 Using extracted city from user location: ${fallbackLocation}`);
        } else {
          // If extraction fails, use coordinates
          fallbackLocation = `${userLocation.lat},${userLocation.lng}`;
          console.log(`📍 Using user coordinates as fallback: ${fallbackLocation}`);
        }
      } else {
        // No user location - try prompt or defaults
        fallbackLocation = 
          extractCityFromPrompt(userPrompt) ||
          geminiRecommendations[0]?.general_location ||
          'Boston, MA';
        
        console.log(`📍 Using fallback location (no user location): ${fallbackLocation}`);
      }

      // ============================================================================
      // PHASE 1: Find EXACT venues
      // ============================================================================
      console.log('\n📍 PHASE 1: Searching for exact venues Gemini recommended...');
      
      const exactSearches = geminiRecommendations.map((geminiVenue, idx) => {
        // Use venue's location OR the smart fallback
        const location = geminiVenue.general_location || fallbackLocation;
        
        console.log(`   ${idx + 1}. "${geminiVenue.name}" in "${location}"`);
        
        return {
        query: geminiVenue.name,
          location: location,
        limit: 1
        };
      });

      console.log(`\n🔍 Executing batch search for ${exactSearches.length} venues...`);

      let exactResult;
      try {
        exactResult = await toolRegistry.executeTool(
        'batch_search_venues',
        { searches: JSON.stringify(exactSearches) },
        { iteration: 1, timestamp: Date.now(), previousResults: [] }
      );

        // Debug log
        console.log(`   Tool execution result: success=${exactResult.success}`);
        if (!exactResult.success) {
          console.error(`   Tool error: ${exactResult.error}`);
        }

      } catch (toolError) {
        console.error('   ❌ Tool execution threw an exception:', toolError);
        throw new Error(`Tool execution failed: ${toolError instanceof Error ? toolError.message : 'unknown error'}`);
      }

      // Validate result structure
      if (!exactResult.success) {
        console.error('   ❌ Phase 1 search failed');
        console.error('   Tool response:', JSON.stringify(exactResult, null, 2));
        throw new Error('Phase 1 search failed: ' + (exactResult.error || 'Tool returned success=false'));
      }

      if (!exactResult.data) {
        console.error('   ❌ Phase 1 search returned no data');
        console.error('   Tool response:', JSON.stringify(exactResult, null, 2));
        throw new Error('Phase 1 search failed: No data in response');
      }

      if (!exactResult.data.results || !Array.isArray(exactResult.data.results)) {
        console.error('   ❌ Phase 1 search returned invalid results structure');
        console.error('   Tool response:', JSON.stringify(exactResult, null, 2));
        throw new Error('Phase 1 search failed: Invalid results structure');
      }

      console.log(`   ✅ Tool returned ${exactResult.data.results.length} search results`);

      const primaryVenues = this.mergeGeminiWithPlacesData(
        geminiRecommendations,
        exactResult.data.results
      );

      console.log(`✅ Phase 1 complete: Found ${primaryVenues.length}/${geminiRecommendations.length} exact venues`);

      // If we found 0 venues, fail early
      if (primaryVenues.length === 0) {
        throw new Error('Could not find any of the recommended venues in Google Places');
      }

      // ============================================================================
      // PHASE 2: Find ALTERNATIVES
      // ============================================================================
      console.log('\n📦 PHASE 2: Searching for alternatives near each venue...');

      const alternativeSearches = primaryVenues.map((venue, idx) => {
        const geminiVenue = geminiRecommendations.find(gv => gv.name === venue.name);
        const category = geminiVenue?.category || 'restaurant';
        
        return {
          query: category,
          location: `${venue.location.lat},${venue.location.lng}`,
          radius: '0.5 miles',
          limit: 5
        };
      });

      console.log(`   Searching for alternatives near ${primaryVenues.length} venues...`);

      const alternativesResult = await toolRegistry.executeTool(
        'batch_search_venues',
        { searches: JSON.stringify(alternativeSearches) },
        { iteration: 1, timestamp: Date.now(), previousResults: state.toolResults }
      );

      if (alternativesResult.success && alternativesResult.data?.results) {
        alternativesResult.data.results.forEach((searchResult: any, idx: number) => {
          if (!searchResult.success || !searchResult.venues || searchResult.venues.length === 0) {
            console.log(`   ⚠️ No alternatives found for venue ${idx + 1}`);
            return;
          }

          const primaryVenue = primaryVenues[idx];
          const primaryPlaceId = primaryVenue.placeId;
          
          const alternatives = searchResult.venues.filter((v: any) => 
            v.placeId !== primaryPlaceId
          ).slice(0, 4);

          if (alternatives.length > 0) {
            this.alternativesMap[primaryPlaceId] = {
              alternatives: alternatives,
              searchQuery: alternativeSearches[idx].query
            };
            
            console.log(`   ✅ Venue ${idx + 1} (${primaryVenue.name}): ${alternatives.length} alternatives`);
            alternatives.slice(0, 3).forEach((alt: any, altIdx: number) => {
              console.log(`      ${altIdx + 1}. ${alt.name} (${alt.rating || 'N/A'}⭐)`);
            });
          } else {
            console.log(`   ⚠️ Venue ${idx + 1} (${primaryVenue.name}): No alternatives found`);
          }
        });
      }

      console.log(`\n📦 Phase 2 complete: ${Object.keys(this.alternativesMap).length} stops with alternatives`);

      // Store tool results
      state.toolResults.push({
        action: 'batch_search_venues',
        success: true,
        data: { results: exactResult.data.results },
        timestamp: Date.now(),
        iteration: 1
      });

      if (alternativesResult.success && alternativesResult.data) {
      state.toolResults.push({
        action: 'batch_search_venues',
        success: true,
          data: { results: alternativesResult.data.results || [] },
        timestamp: Date.now(),
        iteration: 1
      });
      }

      // Build final result
      const resultMessage = this.buildGroundingResultMessage(primaryVenues, geminiRecommendations);
      const selectedPlaceIds = primaryVenues.map(v => v.placeId);
      this.cleanAlternatives(selectedPlaceIds);

      state.finalResult = resultMessage;
      state.finishParameters = {
        result: resultMessage,
        mode: metadata?.isItinerary ? 'route' : 'discovery',
        selected_venue_ids: selectedPlaceIds,
        alternatives_map: this.alternativesMap
      };
      state.status = 'complete';

      const executionTime = Date.now() - state.startTime;
      
      console.log('\n✅ GROUNDING-ENHANCED MODE COMPLETE');
      console.log(`   Primary venues: ${primaryVenues.length}`);
      console.log(`   Alternatives: ${Object.keys(this.alternativesMap).length} stops with alternatives`);
      console.log(`   Execution time: ${executionTime}ms`);

      if (Object.keys(this.alternativesMap).length > 0) {
        console.log('\n📋 Final alternatives:');
        Object.entries(this.alternativesMap).forEach(([placeId, info]) => {
          const primaryVenue = primaryVenues.find(v => v.placeId === placeId);
          console.log(`   ${primaryVenue?.name}: ${info.alternatives.length} alternatives`);
        });
      }

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
      console.error('   Error type:', error instanceof Error ? error.constructor.name : typeof error);
      console.error('   Error details:', error);

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
        stopCapture(`Status: ${state.status}\nIterations: ${state.currentIteration}\nVenues: ${state.finishParameters?.selected_venue_ids?.length || 0}\nAlternatives: ${Object.keys(this.alternativesMap).length}`); 
      } catch (e) {}
    }
  }

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

  private mergeGeminiWithPlacesData(
    geminiVenues: GeminiVenueRecommendation[],
    placesResults: any[]
  ): any[] {
    const mergedVenues: any[] = [];

    geminiVenues.forEach((geminiVenue, idx) => {
      const placesResult = placesResults[idx];

      if (!placesResult?.success || !placesResult.venues || placesResult.venues.length === 0) {
        console.warn(`   ⚠️ Could not find "${geminiVenue.name}" in Places API, skipping`);
        return;
      }

      const placesVenue = placesResult.venues[0];

      const merged = {
        ...placesVenue,
        description: geminiVenue.description,
        gemini_reasoning: geminiVenue.reasoning,
        gemini_review_summary: geminiVenue.reviewsSummary,
        gemini_rating: geminiVenue.rating,
        places_rating: placesVenue.rating,
        rating: placesVenue.rating || geminiVenue.rating,
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
  // STANDARD REACT EXECUTION MODE
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
    
NOTE: When you call batch_search_venues, the system will automatically capture alternatives for each primary venue you select.`,
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
  ? `**USER LOCATION:** ${userLocation.name} at coordinates ${userLocation.lat}, ${userLocation.lng}

╔═══════════════════════════════════════════════════════════════════════════╗
🎯 CRITICAL: WHEN TO USE USER LOCATION COORDINATES
╚═══════════════════════════════════════════════════════════════════════════╝

**✅ USE USER COORDINATES when user says:**
- "near me", "around me", "nearby", "close to me"
- "coffee shops near me" → search location: "${userLocation.lat},${userLocation.lng}"
- "restaurants around here" → search location: "${userLocation.lat},${userLocation.lng}"

**❌ DO NOT USE USER COORDINATES for:**
- Named venues: "Harvard University" → search location: "Cambridge, MA"
- Famous places: "MIT", "Fenway Park" → search by venue name + known city
- "near [other place]": "Starbucks near MIT" → use MIT area coordinates, NOT user location

╔═══════════════════════════════════════════════════════════════════════════╗
📍 SEARCH LOCATION STRATEGY FOR ROUTES
╚═══════════════════════════════════════════════════════════════════════════╝

When planning routes, determine the LOGICAL location for each waypoint:

**Example: "route from my location to Harvard to Starbucks near MIT"**

CORRECT SEARCH LOCATIONS:
{
  "searches": [
    {
      "query": "Harvard University",
      "location": "Cambridge, MA",           // ✅ Harvard is in Cambridge
      "limit": 3
    },
    {
      "query": "Starbucks",
      "location": "42.3601,-71.0942",       // ✅ MIT coordinates (not user!)
      "limit": 3
    }
  ]
}

WRONG:
{
  "searches": [
    {
      "query": "Harvard University",
      "location": "${userLocation.lat},${userLocation.lng}",  // ❌ Using user coords!
      "limit": 3
    }
  ]
}

**ROUTE WAYPOINT RULES:**
- "my location" / "from here" → DON'T search, use "user-location" in selected_venues
- Named venue (Harvard, MIT, Fenway) → search by name + city/area
- "near [place]" → search using THAT place's coordinates
- "near me" → use user coordinates
` 
  : `**USER LOCATION:** Not provided.

If user mentions "near me", "my location" → inform them location services are not available.
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
Triggers: "Find…", "Show me…", "Where are…", "Best…", "Search for…"

Strategy:
- ONE search_venues call only
- Return top 10 results
- mode="discovery"
- Rich descriptions using venue data

MODE 2 – ROUTE PLANNING (Connect Multiple Locations)
Triggers: "Route from…", "Path from… to… via…", "Plan route…"

Strategy - USE BATCH SEARCH FOR SPEED:
1. **Identify ALL waypoints** (skip "my location", "here", "me")
2. **Use batch_search_venues** for actual venues only
3. **Choose correct search location for each venue** (see rules above!)
4. **Select ONE primary venue** from each search result
5. **Call finish with correct order:**
   - result: Rich narrative with ALL venue data
   - mode: "route"
   - selected_venues: ["ChIJ...", "user-location", "ChIJ..."] in EXACT order

╔═══════════════════════════════════════════════════════════════════════════╗
🛠️ AVAILABLE TOOLS
╚═══════════════════════════════════════════════════════════════════════════╝

${toolDescriptions}

finish:
  • result (required): Rich description using ALL venue data (name, rating, price, description, atmosphere, why it fits)
  • mode (required): "discovery" or "route"
  • selected_venues (required for route): Array of placeIds ONLY ["ChIJ...", "user-location", "ChIJ..."]

╔═══════════════════════════════════════════════════════════════════════════╗
✅ QUALITY STANDARDS
╚═══════════════════════════════════════════════════════════════════════════╝

- NEVER search for "my location", "here", "me", "current location"
- ALWAYS preserve exact waypoint order from user's prompt
- ONLY use placeId strings in selected_venues (format: "ChIJ...")
- Use correct search locations (user coords only for "near me", otherwise venue-specific)
- CREATE RICH DESCRIPTIONS using all venue data
- EXPLAIN WHY each venue fits the occasion

Think step-by-step, use correct search locations, preserve order, and create rich descriptions!`;
  }
}