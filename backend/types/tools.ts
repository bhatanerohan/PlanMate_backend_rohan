// backend/types/tools.ts

/**
 * Tool system types for the ReAct agent
 * Defines the interface for all tools that can be called by the agent
 */

export type ToolName = 
  | 'search_venues'
  | 'search_events'
  // | 'calculate_distance'
  | 'calculate_route'        // ⭐ NEW
  | 'validate_availability'
  | 'finish';


export interface ToolDefinition {
  name: ToolName;
  description: string;
  parameters: {
    type: 'object';
    properties: Record<string, {
      type: string;
      description: string;
      enum?: string[];
    }>;
    required: string[];
  };
}

export interface ToolExecutionContext {
  iteration: number;
  timestamp: number;
  previousResults?: ToolResult[];
}

export interface ToolResult {
  success: boolean;
  data?: any;
  error?: string;
  metadata?: {
    apiCalls?: number;
    latency?: number;
    source?: string;
  };
}

export interface BaseTool {
  name: ToolName;
  description: string;
  
  /**
   * Get the OpenAI function definition for this tool
   */
  getDefinition(): ToolDefinition;
  
  /**
   * Execute the tool with given parameters
   */
  execute(parameters: Record<string, any>, context?: ToolExecutionContext): Promise<ToolResult>;
  
  /**
   * Validate parameters before execution
   */
  validate(parameters: Record<string, any>): { valid: boolean; error?: string };
}