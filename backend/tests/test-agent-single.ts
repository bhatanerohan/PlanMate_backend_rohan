// backend/tests/test-agent-single.ts

import { ReActAgent } from '../services/react-agent.js';
import { DEFAULT_SAFETY_CONFIG } from '../types/react-agent.js';

const prompt = process.argv[2];

if (!prompt) {
  console.log('\n❌ No prompt provided!\n');
  console.log('Usage: npm run test:agent "your prompt here"\n');
  console.log('Examples:');
  console.log('  npm run test:agent "Find coffee shops near me"');
  console.log('  npm run test:agent "Plan romantic dinner tonight"');
  console.log('  npm run test:agent "Weekend trip to Boston"\n');
  process.exit(1);
}

console.log('\n' + '█'.repeat(90));
console.log('🤖 ReAct Agent Test');
console.log('█'.repeat(90));
console.log(`📝 Prompt: "${prompt}"`);
console.log('⚙️  Safety Config:', JSON.stringify(DEFAULT_SAFETY_CONFIG, null, 2));
console.log('█'.repeat(90));

const agent = new ReActAgent(DEFAULT_SAFETY_CONFIG);

agent.execute(prompt)
  .then(response => {
    console.log('\n' + '█'.repeat(90));
    console.log('🏁 FINAL RESULT');
    console.log('█'.repeat(90));
    console.log(`✅ Success: ${response.success}`);
    console.log(`📊 Iterations: ${response.iterations}`);
    console.log(`🎯 Stopped Reason: ${response.stoppedReason}`);
    console.log(`⏱️  Execution Time: ${response.executionTimeMs}ms`);
    console.log(`🪙 Tokens Used: ${response.tokensUsed}`);
    
    if (response.success && response.result) {
      console.log('\n📋 Agent Result:');
      console.log('-'.repeat(90));
      console.log(response.result);
      console.log('-'.repeat(90));
    }
    
    if (response.error) {
      console.log('\n❌ Error:', response.error);
    }
    
    console.log('\n' + '█'.repeat(90) + '\n');
  })
  .catch(error => {
    console.error('\n❌ Fatal Error:', error.message);
    console.log('█'.repeat(90) + '\n');
    process.exit(1);
  });