#!/usr/bin/env node

/**
 * Test script for cursor-agent timeout fallback mechanism
 * This script tests the timeout fallback by using a very short timeout
 */

const { spawn } = require('child_process');
const path = require('path');

console.log('🧪 Testing Cursor Agent Timeout Fallback Mechanism');
console.log('================================================');

// Test with a very short timeout (10 seconds) to trigger fallback
const testArgs = {
  prompt: "Create a simple React component called TestComponent with a button that says 'Hello World'",
  projectPath: "./test-project", // You'll need to create this or use an existing project
  timeout: 10000, // 10 seconds - should trigger timeout
  context: "Testing timeout fallback mechanism",
  files: [],
  gitHubToken: undefined, // No auto-commit for testing
  gitUserName: undefined,
  gitUserEmail: undefined,
  gitRepository: undefined,
  isFirstPrompt: true,
  retryCount: 0,
  isRetry: false
};

console.log('📋 Test Configuration:');
console.log(`   - Prompt: ${testArgs.prompt}`);
console.log(`   - Project Path: ${testArgs.projectPath}`);
console.log(`   - Timeout: ${testArgs.timeout}ms (should trigger fallback)`);
console.log(`   - Retry Count: ${testArgs.retryCount}`);
console.log('');

// Start the MCP server and send the test request
console.log('🚀 Starting MCP Server test...');

const serverProcess = spawn('node', ['dist/server.js'], {
  stdio: ['pipe', 'pipe', 'pipe'],
  cwd: process.cwd()
});

// Send the test request
const testRequest = {
  jsonrpc: '2.0',
  id: 1,
  method: 'tools/call',
  params: {
    name: 'cursor/execute-prompt',
    arguments: testArgs
  }
};

console.log('📤 Sending test request...');
serverProcess.stdin.write(JSON.stringify(testRequest) + '\n');

// Handle server output
serverProcess.stdout.on('data', (data) => {
  const output = data.toString();
  console.log('📥 Server Output:');
  console.log(output);
});

serverProcess.stderr.on('data', (data) => {
  const error = data.toString();
  console.log('❌ Server Error:');
  console.log(error);
});

serverProcess.on('close', (code) => {
  console.log(`\n🏁 Server process exited with code ${code}`);
  console.log('\n📊 Test Results:');
  console.log('   - Check the logs above for timeout fallback behavior');
  console.log('   - Look for "TIMEOUT FALLBACK ACTIVATED" messages');
  console.log('   - Verify partial work capture and retry logic');
  console.log('   - Check if task file is created as final fallback');
});

// Set a test timeout
setTimeout(() => {
  console.log('\n⏰ Test timeout reached, terminating server...');
  serverProcess.kill();
}, 60000); // 1 minute test timeout

console.log('⏳ Test running... (will timeout after 1 minute)');

















