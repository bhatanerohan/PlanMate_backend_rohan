
import { GeminiGroundingAgent } from '../services/gemini-grounding-agent.js';
import fs from 'fs';
import path from 'path';

// Mock console to avoid cluttering output
const originalConsoleLog = console.log;
const originalConsoleWarn = console.warn;
const originalConsoleError = console.error;

// Silence internal logs from the agent
console.log = () => { };
console.warn = () => { };
console.error = () => { };

async function testParsing() {
    const agent = new GeminiGroundingAgent();

    // Access private method via any cast
    const parseMethod = (agent as any).parseGeminiResponse.bind(agent);

    const testCases = [
        {
            name: 'Clean JSON',
            input: `{"venues": [{"name": "Test Venue", "priority": "must_have"}]}`,
            shouldPass: true
        },
        {
            name: 'Markdown Code Block',
            input: "```json\n" + `{"venues": [{"name": "Test Venue", "priority": "must_have"}]}` + "\n```",
            shouldPass: true
        },
        {
            name: 'Text Before JSON',
            input: `Here is the JSON you requested: {"venues": [{"name": "Test Venue", "priority": "must_have"}]} Hope this helps!`,
            shouldPass: true
        },
        {
            name: 'Text After JSON',
            input: `{"venues": [{"name": "Test Venue", "priority": "must_have"}]} Note: I found some great places.`,
            shouldPass: true
        },
        {
            name: 'Text Before and After',
            input: `Sure! {"venues": [{"name": "Test Venue", "priority": "must_have"}]} enjoy!`,
            shouldPass: true
        },
        {
            name: 'Nested Objects',
            input: `{"plan": {"type": "tour"}, "venues": [{"name": "Test Venue", "location": {"lat": 1, "lng": 1}}]}`,
            shouldPass: true
        },
        {
            name: 'No Venues Array (Should Error)',
            input: `{"other": "stuff"}`,
            shouldPass: false
        }
    ];

    let output = 'TEST RESULTS:\n';
    let passed = 0;
    let failed = 0;

    for (const test of testCases) {
        try {
            const result = await parseMethod(test.input, false);

            // If we expected failure
            if (!test.shouldPass) {
                output += `❌ FAIL: ${test.name} (Expected error but got result)\n`;
                failed++;
                continue;
            }

            if (result && result.venues && result.venues.length > 0) {
                output += `✅ PASS: ${test.name}\n`;
                passed++;
            } else {
                output += `❌ FAIL: ${test.name} (No venues returned)\n`;
                failed++;
            }
        } catch (e) {
            if (!test.shouldPass) {
                output += `✅ PASS: ${test.name} (Got expected error)\n`;
                passed++;
            } else {
                output += `❌ FAIL: ${test.name} (Error: ${e})\n`;
                failed++;
            }
        }
    }

    output += `\nResults: ${passed} passed, ${failed} failed\n`;

    // Restore console for final output (though we write to file mainly)
    console.log = originalConsoleLog;
    console.warn = originalConsoleWarn;
    console.error = originalConsoleError;

    // Write to file
    fs.writeFileSync('test-results.txt', output);
    console.log('Test complete. Results written to test-results.txt');
}

testParsing().catch(err => {
    console.log = originalConsoleLog;
    console.error(err);
});
