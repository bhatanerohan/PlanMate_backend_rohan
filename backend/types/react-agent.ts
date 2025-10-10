// backend/types/react-agent.ts

/**
 * Core types for the ReAct agent system
 */

// ============================================================================
// AGENT STATE
// ============================================================================

export type AgentStatus = 
  | 'thinking'    // LLM is reasoning
  | 'acting'      // Executing a tool
  | 'observing'   // Processing tool results
  | 'complete'    // Task finished
  | 'failed'      // Encountered error
  | 'stopped';    // Hit safety limit

export interface AgentState {
  status: AgentStatus;
  currentIteration: number;
  startTime: number;
  totalTokensUsed: number;
  conversationHistory: ConversationMessage[];
  toolResults: ToolResult[];
  finalResult?: string;
  finishParameters?: FinishParameters;  // ← NEW: Store finish parameters
  error?: string;
}

// ============================================================================
// CONVERSATION MESSAGES
// ============================================================================

export interface ConversationMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
  timestamp: number;
  iteration?: number;
}

// ============================================================================
// AGENT ACTIONS
// ============================================================================

export type ActionType = 
  | 'search_venues'
  | 'search_events'
  // | 'calculate_distance'
  | 'calculate_route'        // ⭐ NEW
  | 'validate_availability'
  | 'finish';

export interface AgentAction {
  action: ActionType;
  reasoning: string;
  parameters: Record<string, any>;
}

// Add this interface for structured finish parameters
export interface FinishParameters {
  result: string;
  mode: 'discovery' | 'route';
  selected_venue_ids?: string[];  // placeIds of selected venues
}

// ============================================================================
// TOOL RESULTS
// ============================================================================

export interface ToolResult {
  action: ActionType;
  success: boolean;
  data?: any;
  error?: string;
  timestamp: number;
  iteration: number;
}

// ============================================================================
// SAFETY CONFIGURATION
// ============================================================================

export interface SafetyConfig {
  maxIterations: number;        // Maximum think-act-observe cycles
  maxTokens: number;             // Maximum total tokens (prevent cost explosion)
  maxConsecutiveSameActions: number;  // Prevent action loops
  maxSameActionTotal: number;    // Limit repeated action types
}

export const DEFAULT_SAFETY_CONFIG: SafetyConfig = {
  maxIterations: 15,             // Allow up to 15 think-act cycles
  maxTokens: 150000,              // ~$0.15 at GPT-4 prices
  maxConsecutiveSameActions: 3,  // Don't repeat same action 3x in a row
  maxSameActionTotal: 15          // Don't call same action >6 times total
};

// ============================================================================
// AGENT RESPONSE
// ============================================================================

export interface ReActResponse {
  success: boolean;
  result?: string;
  state: AgentState;
  iterations: number;
  tokensUsed: number;
  executionTimeMs: number;
  stoppedReason?: 'completed' | 'max_iterations' | 'token_limit' | 'repetition_detected' | 'error';
  error?: string;
}

// ============================================================================
// AGENT METRICS (for monitoring)
// ============================================================================

export interface AgentMetrics {
  totalIterations: number;
  thinkingTime: number;
  actingTime: number;
  observingTime: number;
  tokensPerIteration: number[];
  actionsExecuted: ActionType[];
}