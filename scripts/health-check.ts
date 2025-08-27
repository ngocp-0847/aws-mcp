#!/usr/bin/env tsx
import 'dotenv/config';
import { spawn } from 'child_process';

/**
 * Health check script để kiểm tra MCP server
 */

async function healthCheck() {
  console.log('🔍 Running MCP Server Health Check...\n');

  // Test 1: Server can start
  console.log('1. Testing server startup...');
  const startupTest = await testServerStartup();
  console.log(startupTest ? '✅ Server starts successfully' : '❌ Server failed to start');

  // Test 2: List tools
  console.log('\n2. Testing list tools...');
  const toolsTest = await testListTools();
  console.log(toolsTest ? '✅ Tools list works' : '❌ Tools list failed');

  // Test 3: Environment variables
  console.log('\n3. Checking environment variables...');
  checkEnvironment();

  console.log('\n🏁 Health check completed');
}

async function testServerStartup(): Promise<boolean> {
  return new Promise((resolve) => {
    const child = spawn('tsx', ['src/index.ts'], {
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 5000
    });

    let hasStarted = false;
    
    child.stderr.on('data', (data) => {
      const output = data.toString();
      if (output.includes('MCP AWS server running')) {
        hasStarted = true;
        child.kill();
      }
    });

    child.on('close', () => {
      resolve(hasStarted);
    });

    child.on('error', () => {
      resolve(false);
    });

    // Timeout fallback
    setTimeout(() => {
      if (!hasStarted) {
        child.kill();
        resolve(false);
      }
    }, 5000);
  });
}

async function testListTools(): Promise<boolean> {
  return new Promise((resolve) => {
    const child = spawn('tsx', ['src/index.ts'], {
      stdio: ['pipe', 'pipe', 'pipe']
    });

    const request = {
      jsonrpc: "2.0",
      id: 1,
      method: "tools/list"
    };

    child.stdin.write(JSON.stringify(request) + '\n');

    let hasResponse = false;
    child.stdout.on('data', (data) => {
      try {
        const response = JSON.parse(data.toString());
        if (response.result && response.result.tools) {
          console.log(`   Found ${response.result.tools.length} tools`);
          hasResponse = true;
        }
      } catch (e) {
        // Ignore parse errors
      }
      child.kill();
    });

    child.on('close', () => {
      resolve(hasResponse);
    });

    setTimeout(() => {
      child.kill();
      resolve(false);
    }, 5000);
  });
}

function checkEnvironment() {
  const requiredVars = [
    'AWS_REGION',
    'AWS_ACCESS_KEY_ID', 
    'AWS_SECRET_ACCESS_KEY'
  ];

  const optionalVars = [
    'MCP_AWS_DEFAULT_ROLE_ARN',
    'MCP_ATHENA_TIMEOUT_MS',
    'MCP_CW_TIMEOUT_MS'
  ];

  console.log('   Required variables:');
  requiredVars.forEach(key => {
    const value = process.env[key];
    if (value) {
      const maskedValue = key.includes('SECRET') ? '***' : value.substring(0, 8) + '...';
      console.log(`   ✅ ${key}: ${maskedValue}`);
    } else {
      console.log(`   ❌ ${key}: not set`);
    }
  });

  console.log('   Optional variables:');
  optionalVars.forEach(key => {
    const value = process.env[key];
    console.log(`   ${value ? '✅' : '⚠️'} ${key}: ${value || 'not set'}`);
  });
}

healthCheck().catch(console.error);
