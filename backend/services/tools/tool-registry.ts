// backend/services/tools/tool-registry.ts

import type { BaseTool, ToolName, ToolDefinition, ToolResult, ToolExecutionContext } from '../../types/tools.js';
import { VenueSearchTool } from './venue-search.js';
import { EventSearchTool } from './event-search.js';
// import { DistanceCalculatorTool } from './distance-calculator.js';
import { RouteCalculatorTool } from './route-calculator.js';  // ⭐ NEW
import { AvailabilityValidatorTool } from './availability-validator.js';

/**
 * Tool Registry
 * Central registry for all available tools
 * Makes it easy to add/remove tools and ensures consistency
 */
export class ToolRegistry {
  private tools: Map<ToolName, BaseTool>;

  constructor() {
    this.tools = new Map();
    this.registerDefaultTools();
  }

  /**
   * Register all default tools
   */
  private registerDefaultTools(): void {
    this.register(new VenueSearchTool());
    this.register(new EventSearchTool());
    // this.register(new DistanceCalculatorTool());
    this.register(new RouteCalculatorTool());  // ⭐ NEW
    this.register(new AvailabilityValidatorTool());

    console.log(`✅ Registered ${this.tools.size} tools:`, Array.from(this.tools.keys()));
  }

  /**
   * Register a new tool
   */
  register(tool: BaseTool): void {
    if (this.tools.has(tool.name)) {
      console.warn(`⚠️  Tool '${tool.name}' already registered. Overwriting...`);
    }
    this.tools.set(tool.name, tool);
  }

  /**
   * Unregister a tool
   */
  unregister(toolName: ToolName): boolean {
    return this.tools.delete(toolName);
  }

  /**
   * Get a tool by name
   */
  getTool(toolName: ToolName): BaseTool | undefined {
    return this.tools.get(toolName);
  }

  /**
   * Check if a tool exists
   */
  hasTool(toolName: ToolName): boolean {
    return this.tools.has(toolName);
  }

  /**
   * Get all registered tool names
   */
  getToolNames(): ToolName[] {
    return Array.from(this.tools.keys());
  }

  /**
   * Get all tool definitions for OpenAI function calling
   */
  getToolDefinitions(): ToolDefinition[] {
    return Array.from(this.tools.values()).map(tool => tool.getDefinition());
  }

  /**
   * Execute a tool
   * This is the main method the agent will call
   */
  async executeTool(
    toolName: ToolName,
    parameters: Record<string, any>,
    context?: ToolExecutionContext
  ): Promise<ToolResult> {
    const tool = this.getTool(toolName);

    if (!tool) {
      return {
        success: false,
        error: `Tool '${toolName}' not found in registry. Available tools: ${this.getToolNames().join(', ')}`
      };
    }

    // Validate parameters
    const validation = tool.validate(parameters);
    if (!validation.valid) {
      return {
        success: false,
        error: `Parameter validation failed for '${toolName}': ${validation.error}`
      };
    }

    // Execute tool
    try {
      console.log(`⚙️  Executing tool: ${toolName}`);
      const result = await tool.execute(parameters, context);
      console.log(`✅ Tool '${toolName}' completed: ${result.success ? 'SUCCESS' : 'FAILED'}`);
      return result;
    } catch (error) {
      console.error(`❌ Tool '${toolName}' threw error:`, error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error during tool execution'
      };
    }
  }

  /**
   * Get statistics about tool usage
   */
  getStats(): {
    totalTools: number;
    toolNames: ToolName[];
  } {
    return {
      totalTools: this.tools.size,
      toolNames: this.getToolNames()
    };
  }
}

// Export singleton instance
export const toolRegistry = new ToolRegistry();