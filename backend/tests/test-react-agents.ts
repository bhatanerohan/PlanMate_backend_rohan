// backend/tests/test-react-agent.ts

import { ReActAgent } from '../services/react-agent.js';
import { DEFAULT_SAFETY_CONFIG } from '../types/react-agent.js';

/**
 * Test the ReAct agent with different prompts
 * Tools return mock data for now - we'll implement real APIs in Phase 2
 */

async function testAgent(prompt: string): Promise<void> {
  console.log('\n' + '█'.repeat(90));
  console.log(`🧪 TESTING: "${prompt}"`);
  console.log('█'.repeat(90));

  const agent = new ReActAgent(DEFAULT_SAFETY_CONFIG);
  
  const response = await agent.execute(prompt);

  console.log('\n' + '█'.repeat(90));
  console.log('🏁 FINAL RESULT');
  console.log('█'.repeat(90));
  console.log(`Success: ${response.success}`);
  console.log(`Stopped Reason: ${response.stoppedReason}`);
  console.log(`Iterations: ${response.iterations}`);
  console.log(`Tokens Used: ${response.tokensUsed}`);
  console.log(`Execution Time: ${response.executionTimeMs}ms`);
  
  if (response.success && response.result) {
    console.log('\n📋 Agent Result:');
    console.log(response.result);
  }
  
  if (response.error) {
    console.log('\n❌ Error:', response.error);
  }
  
  console.log('\n' + '█'.repeat(90) + '\n\n');
}

async function runTests(): Promise<void> {
  const testPrompts = [
    // Simple test
    "Find me a coffee shop nearby",
    
    // Complex test
    "Plan a romantic date night in Boston with dinner and an activity",
    
    // This should trigger safety mechanisms
    // "Find me everything" // Uncomment to test repetition detection
  ];

  for (const prompt of testPrompts) {
    try {
      await testAgent(prompt);
      // Wait a bit between tests
      await new Promise(resolve => setTimeout(resolve, 2000));
    } catch (error) {
      console.error('Test failed:', error);
    }
  }
}

// Run tests
runTests().catch(console.error);