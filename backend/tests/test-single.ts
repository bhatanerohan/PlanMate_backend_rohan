// backend/test-single.ts
import { classifyIntent } from '../services/intent-classifier.js';

const prompt = process.argv[2];

if (!prompt) {
  console.log('Usage: npm run test:single "your prompt here"');
  console.log('\nExamples:');
  console.log('  npm run test:single "I\'m hungry"');
  console.log('  npm run test:single "find a concert tonight"');
  console.log('  npm run test:single "plan my weekend in NYC"');
  process.exit(1);
}

console.log(`\n${'='.repeat(70)}`);
console.log(`Testing: "${prompt}"`);
console.log('='.repeat(70));

classifyIntent(prompt)
  .then(result => {
    console.log('\n✅ Classification Result:\n');
    console.log(`   📍 Is Relevant:  ${result.isRelevant ? '✓ YES' : '✗ NO'}`);
    console.log(`   📂 Category:     ${result.category}`);
    console.log(`   💭 Reasoning:    ${result.reasoning}`);
    console.log('\n' + '='.repeat(70) + '\n');
  })
  .catch(error => {
    console.error('\n❌ Error:', error.message);
    console.log('='.repeat(70) + '\n');
  });