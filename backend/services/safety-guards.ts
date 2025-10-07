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
   * 3. Consecutive repetition - detects action loops
   * 4. Total action count - prevents action spam
   * 5. Stuck pattern detection - catches oscillating loops
   */
  
  export interface SafetyCheckResult {
    safe: boolean;
    reason?: string;
    shouldStop: boolean;
  }
  
  export class SafetyGuards {
    private config: SafetyConfig;
    private actionHistory: Map<ActionType, number>;
    private consecutiveActionCount: number;
    private lastAction: ActionType | null;
  
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
    checkBeforeAction(action: ActionType, state: AgentState): SafetyCheckResult {
      // 1. Check for consecutive repetition
      const consecutiveCheck = this.checkConsecutiveRepetition(action);
      if (!consecutiveCheck.safe) return consecutiveCheck;
  
      // 2. Check total action count
      const totalCheck = this.checkTotalActionCount(action);
      if (!totalCheck.safe) return totalCheck;
  
      // 3. Check for stuck patterns
      const patternCheck = this.checkStuckPattern(state);
      if (!patternCheck.safe) return patternCheck;
  
      // Update tracking
      this.recordAction(action);
  
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
     * 3. CONSECUTIVE REPETITION CHECK
     * Prevents: search_venues → search_venues → search_venues
     */
    private checkConsecutiveRepetition(action: ActionType): SafetyCheckResult {
      if (action === this.lastAction) {
        this.consecutiveActionCount++;
        
        if (this.consecutiveActionCount >= this.config.maxConsecutiveSameActions) {
          return {
            safe: false,
            shouldStop: true,
            reason: `Detected ${this.consecutiveActionCount} consecutive '${action}' actions. Agent appears stuck.`
          };
        }
      }
      
      return { safe: true, shouldStop: false };
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
    private recordAction(action: ActionType): void {
      // Update consecutive count
      if (action !== this.lastAction) {
        this.consecutiveActionCount = 1;
        this.lastAction = action;
      }
  
      // Update total count
      const currentCount = this.actionHistory.get(action) || 0;
      this.actionHistory.set(action, currentCount + 1);
    }
  
    /**
     * Get current safety statistics
     */
    getStats() {
      return {
        actionHistory: Object.fromEntries(this.actionHistory),
        consecutiveCount: this.consecutiveActionCount,
        lastAction: this.lastAction
      };
    }
  
    /**
     * Reset guards (for testing or new requests)
     */
    reset(): void {
      this.actionHistory.clear();
      this.consecutiveActionCount = 0;
      this.lastAction = null;
    }
  }