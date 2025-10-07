// backend/services/tools/base-tool.ts

import type { BaseTool, ToolName, ToolDefinition, ToolResult, ToolExecutionContext } from '../../types/tools.js';

/**
 * Abstract base class for all tools
 * Provides common validation and structure
 */
export abstract class Tool implements BaseTool {
  abstract name: ToolName;
  abstract description: string;

  /**
   * Get the OpenAI function definition
   * Must be implemented by each tool
   */
  abstract getDefinition(): ToolDefinition;

  /**
   * Execute the tool
   * Must be implemented by each tool
   */
  abstract execute(parameters: Record<string, any>, context?: ToolExecutionContext): Promise<ToolResult>;

  /**
   * Validate parameters (can be overridden)
   */
  validate(parameters: Record<string, any>): { valid: boolean; error?: string } {
    // Check if parameters is defined
    if (!parameters || typeof parameters !== 'object') {
      return {
        valid: false,
        error: `Parameters must be an object, received: ${typeof parameters}`
      };
    }

    const definition = this.getDefinition();
    const required = definition.parameters.required;

    // Check required parameters
    for (const param of required) {
      if (!(param in parameters) || parameters[param] === undefined || parameters[param] === null) {
        return {
          valid: false,
          error: `Missing required parameter: ${param}`
        };
      }
    }

    return { valid: true };
  }

  /**
   * Helper to create success result
   */
  protected success(data: any, metadata?: ToolResult['metadata']): ToolResult {
    return {
      success: true,
      data,
      metadata
    };
  }

  /**
   * Helper to create error result
   */
  protected error(message: string, metadata?: ToolResult['metadata']): ToolResult {
    return {
      success: false,
      error: message,
      metadata
    };
  }
}