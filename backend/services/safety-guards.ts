// backend/services/safety-guards.ts

import type { 
  AgentState, 
  SafetyConfig, 
  ActionType,
  ToolResult 
} from '../types/react-agent.js';

/**
 * Safety guard system to prevent infinite loops, cost explosions, and stuck agents
 * 
 * Implements 5 protection mechanisms:
 * 1. Iteration limit - prevents infinite loops
 * 2. Token limit - prevents cost explosions
 * 3. Consecutive repetition - detects action loops (NOW CONTEXT-AWARE)
 * 4. Total action count - prevents action spam
 * 5. Stuck pattern detection - catches oscillating loops
 */

export interface SafetyCheckResult {
  safe: boolean;
  reason?: string;
  shouldStop: boolean;
}

// NEW: Track action with its parameters
interface ActionRecord {
  action: ActionType;
  parameters: Record<string, any>;
  timestamp: number;
}

export class SafetyGuards {
  private config: SafetyConfig;
  private actionHistory: Map<ActionType, number>;
  private consecutiveActionCount: number;
  private lastAction: ActionType | null;
  
  // NEW: Track recent actions with parameters for context-aware checking
  private recentActions: ActionRecord[] = [];

  constructor(config: SafetyConfig) {
    this.config = config;
    this.actionHistory = new Map();
    this.consecutiveActionCount = 0;
    this.lastAction = null;
  }

  /**
   * Comprehensive safety check before each iteration
   */
  checkBeforeIteration(state: AgentState): SafetyCheckResult {
    // 1. Check iteration limit
    const iterationCheck = this.checkIterationLimit(state);
    if (!iterationCheck.safe) return iterationCheck;

    // 2. Check token usage
    const tokenCheck = this.checkTokenLimit(state);
    if (!tokenCheck.safe) return tokenCheck;

    return { safe: true, shouldStop: false };
  }

  /**
   * Check if action is safe to execute
   */
  checkBeforeAction(action: ActionType, state: AgentState, parameters?: Record<string, any>): SafetyCheckResult {
    // 1. Check for consecutive repetition (NOW CONTEXT-AWARE)
    const consecutiveCheck = this.checkConsecutiveRepetition(action, parameters);
    if (!consecutiveCheck.safe) return consecutiveCheck;

    // 2. Check total action count
    const totalCheck = this.checkTotalActionCount(action);
    if (!totalCheck.safe) return totalCheck;

    // 3. Check for stuck patterns
    const patternCheck = this.checkStuckPattern(state);
    if (!patternCheck.safe) return patternCheck;

    // Update tracking
    this.recordAction(action, parameters);

    return { safe: true, shouldStop: false };
  }

  /**
   * 1. ITERATION LIMIT CHECK
   * Prevents infinite loops
   */
  private checkIterationLimit(state: AgentState): SafetyCheckResult {
    if (state.currentIteration >= this.config.maxIterations) {
      return {
        safe: false,
        shouldStop: true,
        reason: `Reached maximum iterations (${this.config.maxIterations}). Stopping to prevent infinite loop.`
      };
    }
    return { safe: true, shouldStop: false };
  }

  /**
   * 2. TOKEN LIMIT CHECK
   * Prevents cost explosion
   */
  private checkTokenLimit(state: AgentState): SafetyCheckResult {
    if (state.totalTokensUsed >= this.config.maxTokens) {
      return {
        safe: false,
        shouldStop: true,
        reason: `Token limit reached (${this.config.maxTokens}). Stopping to prevent excessive costs.`
      };
    }
    return { safe: true, shouldStop: false };
  }

  /**
   * 3. CONSECUTIVE REPETITION CHECK (NOW CONTEXT-AWARE!)
   * Prevents: search_venues → search_venues → search_venues
   * BUT allows if they're searching for DIFFERENT things
   */
  private checkConsecutiveRepetition(action: ActionType, parameters?: Record<string, any>): SafetyCheckResult {
    if (action === this.lastAction) {
      // Check if this is a MEANINGFUL repetition by comparing parameters
      const isDifferentSearch = this.isActionMeaningfullyDifferent(action, parameters);
      
      if (isDifferentSearch) {
        // Different search parameters - this is OK! Reset counter
        console.log(`   ✅ Consecutive '${action}' allowed - parameters are different`);
        this.consecutiveActionCount = 1; // Reset since it's different
        return { safe: true, shouldStop: false };
      }
      
      // Same action with same/similar parameters - count it
      this.consecutiveActionCount++;
      
      if (this.consecutiveActionCount >= this.config.maxConsecutiveSameActions) {
        return {
          safe: false,
          shouldStop: true,
          reason: `Detected ${this.consecutiveActionCount} consecutive identical '${action}' actions. Agent appears stuck.`
        };
      }
    }
    
    return { safe: true, shouldStop: false };
  }

  /**
   * NEW: Check if consecutive actions are meaningfully different
   * Returns true if the actions are different enough to be considered valid
   */
  private isActionMeaningfullyDifferent(action: ActionType, currentParams?: Record<string, any>): boolean {
    if (!currentParams || this.recentActions.length === 0) {
      return false;
    }

    // Get the last action of the same type
    const lastSameAction = this.recentActions
      .slice()
      .reverse()
      .find(record => record.action === action);

    if (!lastSameAction) {
      return true; // First time doing this action
    }

    const lastParams = lastSameAction.parameters;

    // Check based on action type
    switch (action) {
      case 'search_venues':
      case 'search_events':
        // Different if query OR location changed significantly
        const queryChanged = this.hasSignificantChange(lastParams.query, currentParams.query);
        const locationChanged = this.hasSignificantChange(lastParams.location, currentParams.location);
        const coordinatesChanged = this.hasSignificantChange(
          lastParams.near_coordinates, 
          currentParams.near_coordinates
        );
        
        return queryChanged || locationChanged || coordinatesChanged;

      case 'calculate_distance':
        // Different if origin OR destination changed
        const originChanged = this.hasSignificantChange(lastParams.origin, currentParams.origin);
        const destChanged = this.hasSignificantChange(lastParams.destination, currentParams.destination);
        
        return originChanged || destChanged;

      case 'validate_availability':
        // Different if checking different venue/event
        const nameChanged = this.hasSignificantChange(lastParams.name, currentParams.name);
        const dateChanged = this.hasSignificantChange(lastParams.dateTime, currentParams.dateTime);
        
        return nameChanged || dateChanged;

      default:
        return false;
    }
  }

  /**
   * NEW: Helper to check if a parameter value changed significantly
   */
  private hasSignificantChange(oldValue: any, newValue: any): boolean {
    // If either is undefined/null, consider them the same unless one exists and other doesn't
    if (!oldValue && !newValue) return false;
    if (!oldValue || !newValue) return true;

    // Normalize strings for comparison (trim, lowercase)
    if (typeof oldValue === 'string' && typeof newValue === 'string') {
      const normalized1 = oldValue.trim().toLowerCase();
      const normalized2 = newValue.trim().toLowerCase();
      
      // Check if they're completely different (not just minor variations)
      return normalized1 !== normalized2;
    }

    // For other types, do direct comparison
    return oldValue !== newValue;
  }

  /**
   * 4. TOTAL ACTION COUNT CHECK
   * Prevents overuse of single action type
   */
  private checkTotalActionCount(action: ActionType): SafetyCheckResult {
    const count = this.actionHistory.get(action) || 0;
    
    if (count >= this.config.maxSameActionTotal) {
      return {
        safe: false,
        shouldStop: true,
        reason: `Action '${action}' called ${count} times (max: ${this.config.maxSameActionTotal}). Preventing action spam.`
      };
    }
    
    return { safe: true, shouldStop: false };
  }

  /**
   * 5. STUCK PATTERN DETECTION
   * Detects if agent is repeating the same sequence
   * Example: search → validate → search → validate → search → validate
   */
  private checkStuckPattern(state: AgentState): SafetyCheckResult {
    // Only check if we have enough history
    if (state.toolResults.length < 6) {
      return { safe: true, shouldStop: false };
    }

    // Get last 6 actions
    const recentActions = state.toolResults
      .slice(-6)
      .map(r => r.action);

    // Check if pattern A-B-A-B-A-B exists
    const first = recentActions[0];
    const second = recentActions[1];
    
    const isAlternating = recentActions.every((action, i) => {
      return i % 2 === 0 ? action === first : action === second;
    });

    if (isAlternating && first !== second) {
      return {
        safe: false,
        shouldStop: true,
        reason: `Detected alternating pattern: ${first} ↔ ${second}. Agent appears stuck in loop.`
      };
    }

    return { safe: true, shouldStop: false };
  }

  /**
   * Record action for tracking
   */
  private recordAction(action: ActionType, parameters?: Record<string, any>): void {
    // Update consecutive count
    if (action !== this.lastAction) {
      this.consecutiveActionCount = 1;
      this.lastAction = action;
    }

    // Update total count
    const currentCount = this.actionHistory.get(action) || 0;
    this.actionHistory.set(action, currentCount + 1);

    // NEW: Record action with parameters for context-aware checking
    this.recentActions.push({
      action,
      parameters: parameters || {},
      timestamp: Date.now()
    });

    // Keep only last 10 actions to prevent memory bloat
    if (this.recentActions.length > 10) {
      this.recentActions.shift();
    }
  }

  /**
   * Get current safety statistics
   */
  getStats() {
    return {
      actionHistory: Object.fromEntries(this.actionHistory),
      consecutiveCount: this.consecutiveActionCount,
      lastAction: this.lastAction,
      recentActionsCount: this.recentActions.length
    };
  }

  /**
   * Reset guards (for testing or new requests)
   */
  reset(): void {
    this.actionHistory.clear();
    this.consecutiveActionCount = 0;
    this.lastAction = null;
    this.recentActions = [];
  }
}