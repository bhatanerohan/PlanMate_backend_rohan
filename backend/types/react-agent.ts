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
  finishParameters?: FinishParameters;
  error?: string;
  isInCorrectionMode?: boolean;
  correctionAttempts?: number;
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
  | 'batch_search_venues'
  | 'calculate_route'
  | 'validate_availability'
  | 'finish';

export interface AgentAction {
  action: ActionType;
  reasoning: string;
  parameters: Record<string, any>;
}

// 🆕 NEW: Alternative venues structure
export interface AlternativeVenuesInfo {
  alternatives: any[];  // Array of venue objects
  searchQuery: string;  // Original query that found these venues
}

export interface FinishParameters {
  result: string;
  mode: 'discovery' | 'route';
  selected_venue_ids?: string[];
  alternatives_map?: Record<string, AlternativeVenuesInfo>;  // 🆕 NEW: Map of primary placeId → alternatives
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
// EVALUATION TYPES
// ============================================================================

export interface EvaluationResult {
  isValid: boolean;
  issues: string[];
  suggestions?: string;
}

export interface RouteEvaluation extends EvaluationResult {
  expectedOrder: string[];
  actualOrder: string[];
  missingWaypoints: string[];
  extraWaypoints: string[];
}

// ============================================================================
// SAFETY CONFIGURATION
// ============================================================================

export interface SafetyConfig {
  maxIterations: number;
  maxTokens: number;
  maxConsecutiveSameActions: number;
  maxSameActionTotal: number;
  maxCorrectionAttempts: number;
}

export const DEFAULT_SAFETY_CONFIG: SafetyConfig = {
  maxIterations: 15,
  maxTokens: 150000,
  maxConsecutiveSameActions: 3,
  maxSameActionTotal: 15,
  maxCorrectionAttempts: 2
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