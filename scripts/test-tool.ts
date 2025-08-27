#!/usr/bin/env tsx
import 'dotenv/config';
import { spawn } from 'child_process';

/**
 * Test tool để debug MCP server
 * Sử dụng: npm run test-tool -- <tool-name> <arguments>
 */

const toolName = process.argv[2];
const toolArgs = process.argv[3] ? JSON.parse(process.argv[3]) : {};

if (!toolName) {
  console.log('Usage: npm run test-tool -- <tool-name> [arguments-json]');
  console.log('Example: npm run test-tool -- aws_s3_list \'{"bucket": "my-bucket"}\'');
  process.exit(1);
}

async function testTool() {
  console.log(`Testing tool: ${toolName}`);
  console.log(`Arguments:`, JSON.stringify(toolArgs, null, 2));
  
  const child = spawn('tsx', ['src/index.ts'], {
    stdio: ['pipe', 'pipe', 'pipe'],
    env: { ...process.env, DEBUG: '1' }
  });

  // Gửi request đến MCP server
  const request = {
    jsonrpc: "2.0",
    id: 1,
    method: "tools/call",
    params: {
      name: toolName,
      arguments: toolArgs
    }
  };

  child.stdin.write(JSON.stringify(request) + '\n');
  child.stdin.end();

  // Lắng nghe response
  child.stdout.on('data', (data) => {
    console.log('Response:', data.toString());
  });

  child.stderr.on('data', (data) => {
    console.log('Debug:', data.toString());
  });

  child.on('close', (code) => {
    console.log(`Process exited with code ${code}`);
  });
}

testTool().catch(console.error);
