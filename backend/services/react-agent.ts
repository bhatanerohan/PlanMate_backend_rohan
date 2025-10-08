// backend/services/react-agent.ts

import OpenAI from 'openai';
import dotenv from 'dotenv';
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
   * This is where the magic happens!
   */
  async execute(userPrompt: string): Promise<ReActResponse> {
    console.log('\n🚀 Starting ReAct Agent...');
    console.log(`📝 User Prompt: "${userPrompt}"\n`);

    // Initialize state
    const state: AgentState = {
      status: 'thinking',
      currentIteration: 0,
      startTime: Date.now(),
      totalTokensUsed: 0,
      conversationHistory: [
        {
          role: 'system',
          content: this.getSystemPrompt(),
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

    try {
      // Execute ReAct loop
      while (state.status !== 'complete' && state.status !== 'failed' && state.status !== 'stopped') {
        state.currentIteration++;
        
        console.log(`\n${'='.repeat(80)}`);
        console.log(`🔄 ITERATION ${state.currentIteration}`);
        console.log('='.repeat(80));

        // SAFETY CHECK BEFORE ITERATION
        const safetyCheck = this.safetyGuards.checkBeforeIteration(state);
        if (!safetyCheck.safe) {
          console.log(`\n⛔ Safety check failed: ${safetyCheck.reason}`);
          state.status = 'stopped';
          state.error = safetyCheck.reason;
          break;
        }

        // ========================================
        // STEP 1: THINK
        // ========================================
        console.log('\n💭 THINKING...');
        const action = await this.think(state);
        
        if (!action) {
          state.status = 'failed';
          state.error = 'Failed to get valid action from agent';
          break;
        }

        console.log(`   Reasoning: ${action.reasoning}`);
        console.log(`   Action: ${action.action}`);
        console.log(`   Parameters:`, JSON.stringify(action.parameters, null, 2));

        // Check if agent wants to finish
        if (action.action === 'finish') {
          console.log('\n✅ Agent decided task is complete');
          state.status = 'complete';
          state.finalResult = action.parameters.result || 'Task completed';
          break;
        }

        // SAFETY CHECK BEFORE ACTION
        const actionSafetyCheck = this.safetyGuards.checkBeforeAction(action.action, state);
        if (!actionSafetyCheck.safe) {
          console.log(`\n⛔ Action safety check failed: ${actionSafetyCheck.reason}`);
          state.status = 'stopped';
          state.error = actionSafetyCheck.reason;
          break;
        }

        // ========================================
        // STEP 2: ACT
        // ========================================
        console.log('\n⚡ ACTING...');
        state.status = 'acting';
        const result = await this.act(action, state);
        
        console.log(`   Success: ${result.success}`);
        if (result.success) {
          console.log(`   Data: ${JSON.stringify(result.data).substring(0, 200)}...`);
        } else {
          console.log(`   Error: ${result.error}`);
        }

        // ========================================
        // STEP 3: OBSERVE
        // ========================================
        console.log('\n👁️  OBSERVING...');
        state.status = 'observing';
        this.observe(action.action, result, state);
        
        console.log(`   Added observation to conversation history`);
        console.log(`   Total messages: ${state.conversationHistory.length}`);
        console.log(`   Total tokens used: ${state.totalTokensUsed}`);
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
    }
  }

  /**
   * THINK: Agent reasons about what to do next
   */
  private async think(state: AgentState): Promise<AgentAction | null> {
    try {
      // Get tool definitions for the system prompt
      const toolDefinitions = toolRegistry.getToolDefinitions();
      
      // Build detailed parameter descriptions for each action
      const actionParametersDescription = toolDefinitions.map(tool => {
        const props = Object.entries(tool.parameters.properties)
          .map(([name, def]: [string, any]) => `    - ${name}: ${def.description}`)
          .join('\n');
        return `  ${tool.name}:\n${props}`;
      }).join('\n\n');

      const response = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        temperature: 0.7,
        messages: state.conversationHistory as any,
        functions: [
          {
            name: 'execute_action',
            description: `Execute an action based on your reasoning.

Available actions and their parameters:

${actionParametersDescription}

finish:
    - result: The final result to return to the user`,
            parameters: {
              type: 'object',
              properties: {
                reasoning: {
                  type: 'string',
                  description: 'Your reasoning for this action'
                },
                action: {
                  type: 'string',
                  enum: ['search_venues', 'search_events', 'calculate_distance', 'validate_availability', 'finish'],
                  description: 'The action to take'
                },
                parameters: {
                  type: 'object',
                  description: 'Parameters for the action (must match the requirements for the chosen action)',
                  properties: {},  // Intentionally generic - LLM will use description above
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
      
      // Ensure parameters is at least an empty object
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
   * ACT: Execute the chosen action using the tool registry
   */
  private async act(action: AgentAction, state: AgentState): Promise<ToolResultType> {
    try {
      // Use tool registry to execute the action
      const result = await toolRegistry.executeTool(
        action.action,
        action.parameters,
        {
          iteration: state.currentIteration,
          timestamp: Date.now(),
          previousResults: state.toolResults
        }
      );

      // Convert tool result to our format and store
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
   * OBSERVE: Add tool result to conversation history
   */
  private observe(actionName: ActionType, result: ToolResultType, state: AgentState): void {
    const observation = result.success
      ? `Action '${actionName}' succeeded. Result: ${JSON.stringify(result.data)}`
      : `Action '${actionName}' failed. Error: ${result.error}`;

    state.conversationHistory.push({
      role: 'user',  // Tool results come back as 'user' messages
      content: `OBSERVATION: ${observation}`,
      timestamp: Date.now(),
      iteration: state.currentIteration
    });
  }

  /**
   * System prompt for the agent
   * Dynamically includes tool definitions from registry
   */
  // backend/services/react-agent.ts
// UPDATE the getSystemPrompt() method:

private getSystemPrompt(): string {
  const toolDefinitions = toolRegistry.getToolDefinitions();
  
  const toolDescriptions = toolDefinitions
    .map(tool => {
      const params = Object.entries(tool.parameters.properties)
        .map(([name, def]: [string, any]) => {
          const required = tool.parameters.required.includes(name) ? '(required)' : '(optional)';
          return `   • ${name} ${required}: ${def.description}`;
        })
        .join('\n');
      
      return `${tool.name}\n${params}`;
    })
    .join('\n\n');

  return `You are TRIPMATE, an expert travel-planning concierge using ReAct reasoning (Think → Act → Observe) to build geographically optimized itineraries.

Your mission: Help users find venues, plan outings, and generate optimized timelines using real Google Places and Ticketmaster data.

───────────────────────────────────
🎯 MODES & BEHAVIOR
───────────────────────────────────

MODE 1 – SIMPLE SEARCH  
Triggers: "Find…", "Show me…", "Best…", "Where can I get…"
- Perform 1 search only  
- Return top 5-10 results with name, address, rating  
- Do NOT build itinerary or add times  
- Mention other options exist  
- Keep it simple - just a clean list

MODE 2 – EVENT / ACTIVITY PLAN  
Triggers: "Plan…", "Date night…", "Dinner and show…", "Romantic…"
- Chain 2–4 searches (e.g., dinner → activity)  
- Apply geographic optimization between stops (≤ 1 mile preferred)
- **Use calculate_route to get actual walking distance and time**  ⭐ NEW
- Include specific times ("6:30 PM Dinner → 8:00 PM Show")  
- Provide 1 main plan + 2–3 alternatives with brief reasoning  
- Explain why the plan works geographically

MODE 3 – SINGLE DAY ITINERARY  
Triggers: "Day trip…", "Full day in…", "Spend a day…", "What should I do today…"
- Hour-by-hour schedule (Morning → Lunch → Afternoon → Dinner → Evening)  
- **Use calculate_route between consecutive stops**  ⭐ NEW
- Show walking distances and times from actual routes
- Total walking ≤ 3 miles preferred  
- Display distance & estimated walk time for each transition  
- Create logical geographic flow

MODE 4 – MULTI-DAY TRIP  
Triggers: "X days…", "Weekend in…", "Vacation in…", "Week in…"
- Day-by-day breakdown with themes per day  
- Geo-optimize within each day using calculate_route  ⭐ NEW
- Include meals, attractions, evening activities  
- Balance activity levels across days  
- Each day should have its own character/theme

───────────────────────────────────
🗺️ GEOGRAPHIC OPTIMIZATION
───────────────────────────────────

CRITICAL RULES FOR ITINERARIES (Modes 2, 3, 4):

1️⃣ First search: Use city name only (broad search across city)
   Example: search_venues(query: "romantic restaurants", location: "Boston")

2️⃣ All subsequent searches: Use near_coordinates from previous venue
   Example: search_venues(query: "dessert", location: "Boston", near_coordinates: "42.365,-71.054", radius: "0.5 miles")

3️⃣ **After finding 2+ venues: ALWAYS use calculate_route**  ⭐ NEW
   Example: calculate_route(waypoints: '[{"lat":42.365,"lng":-71.054},{"lat":42.367,"lng":-71.056}]', mode: "walking")
   This gives you ACTUAL walking distance and time, not estimates

4️⃣ Check route results and re-optimize if needed:
   • If walking route > 1 mile or > 20 minutes → search for closer alternatives
   • If walking route < 0.5 miles and < 10 minutes → perfect!
   • Consider driving if distance > 2 miles

5️⃣ Always show actual route metrics in your output:
   Format: "→ 0.4 miles, 8 min walk (via calculate_route)"

6️⃣ For multi-stop itineraries: Calculate route with ALL waypoints at once
   Example: 3 stops = calculate_route with 3 waypoints for total path

7️⃣ Extract coordinates from every result to use in next search
   Results include: "location": {"coordinates": "42.365,-71.054"}

───────────────────────────────────
📊 OUTPUT FORMAT
───────────────────────────────────

ALWAYS INCLUDE:
- Specific times (e.g., "6:30 PM", not just "evening")
- Full addresses
- Ratings (e.g., "4.7★")
- **Actual distance and walking time from calculate_route** ⭐ NEW
- Booking links for events/restaurants when available
- Brief "why this works" explanation for each choice
- 2–3 alternative plans after main recommendation

FORMAT STRUCTURE:

For Simple Search (Mode 1):
  Clean list, no timeline needed

For Planning (Modes 2, 3, 4):
  Main recommendation first (detailed with actual route metrics)
  Then alternatives (concise)
  Show distances between all stops using calculate_route results

Use clear Markdown sections with emojis for scannability.

───────────────────────────────────
🔄 REACT LOOP PROCESS
───────────────────────────────────

THINK → 
  • What mode is this query?
  • What information do I need?
  • Should I use coordinates from previous result?
  • Do I need to calculate actual route distance?
  • Is current plan optimal or should I re-search?

ACT → Execute exactly ONE tool per iteration:
  • search_venues
  • search_events
  • calculate_route  ⭐ NEW - Use this after finding 2+ venues
  
OBSERVE → 
  • Extract coordinates from results
  • Check distances from calculate_route
  • Assess if plan is optimal
  • Decide: continue searching or finish?

REPEAT → Until you have everything needed

FINISH → Present structured plan with alternatives and actual route metrics

───────────────────────────────────
🛠️ AVAILABLE TOOLS
───────────────────────────────────

${toolDescriptions}

finish
   • result (required): Your final itinerary/recommendation

IMPORTANT TOOL USAGE NOTES:

For search_venues:
- Tools will automatically expand search radius up to 3.5 miles if no results found
- Don't worry about trying different radii - the tool handles it
- If you get empty results even after expansion, try different query or area

For search_events:
- If searching for specific event type (e.g., "theater") returns empty, tool will automatically try ANY events
- Use query: "events" if you want any type of event from the start
- Tool uses 25-mile radius for coordinate searches automatically
- If still no results, suggest user try different dates or broader location

For calculate_route:  ⭐ NEW
- Use AFTER you have 2+ venue/event coordinates
- Always use "walking" mode for distances < 2 miles
- Waypoints must be JSON array: '[{"lat":42.36,"lng":-71.06},{"lat":42.37,"lng":-71.07}]'
- Returns actual distance, duration, and path geometry
- If route is too long (>1 mile), search for closer alternatives
- You can calculate route with up to 25 waypoints for multi-stop itineraries

───────────────────────────────────
✅ QUALITY STANDARDS
───────────────────────────────────

- Use real API data only (never fabricate venues or events)
- Be efficient but thorough - use as many searches as needed for quality
- **Always use calculate_route for multi-stop plans to get real distances** ⭐ NEW
- Explain geographic reasoning using actual route data
- Respect logical timing (dinner before show, include buffer time)
- Always provide alternatives for flexibility
- Prefer walking unless distance requires transit (>1.5 miles)
- For planning queries: ALWAYS use coordinates after first search
- Show your geographic thinking in output with real metrics

───────────────────────────────────
❌ NEVER DO
───────────────────────────────────

- Don't create itineraries for simple search queries
- Don't ignore geographic optimization for multi-stop plans
- Don't estimate distances - use calculate_route for actual metrics  ⭐ NEW
- Don't place stops > 1 mile apart without calculating actual route first
- Don't forget to show distances between venues using real route data
- Don't give only one option (always provide 2-3 alternatives)
- Don't use broad city searches after your first search - use coordinates!

───────────────────────────────────

Think step-by-step, calculate actual routes, optimize geography intelligently, explain your reasoning with real data, and create amazing experiences!`;
}
}