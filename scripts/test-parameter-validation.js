/**
 * Test script for the MCP AWS server parameter validation
 * This script tests the new parameter handling system to ensure tools
 * properly validate required parameters and provide clear error messages
 */

import { ParameterValidator, createParameterPrompts } from '../dist/parameterHandler.js';
import { z } from 'zod';

// Test scenarios
const testCases = [
  {
    name: 'S3 List - Missing required bucket parameter',
    schema: z.object({
      bucket: z.string(),
      prefix: z.string().optional(),
      maxKeys: z.number().int().min(1).max(1000).optional()
    }),
    parameterPrompts: createParameterPrompts(z.object({
      bucket: z.string(),
      prefix: z.string().optional(),
      maxKeys: z.number().int().min(1).max(1000).optional()
    }), {
      bucket: {
        description: "S3 bucket name (required) - exact bucket name like 'my-app-bucket'",
        examples: ["my-app-bucket", "data-lake-prod"]
      },
      prefix: {
        description: "Object prefix to filter results (optional)",
        examples: ["logs/", "uploads/2024/"]
      }
    }),
    input: { prefix: "logs/" }, // Missing required 'bucket'
    expectedValid: false,
    expectedMissingParams: ['bucket']
  },
  {
    name: 'S3 List - Valid input',
    schema: z.object({
      bucket: z.string(),
      prefix: z.string().optional(),
      maxKeys: z.number().int().min(1).max(1000).optional()
    }),
    parameterPrompts: createParameterPrompts(z.object({
      bucket: z.string(),
      prefix: z.string().optional(),
      maxKeys: z.number().int().min(1).max(1000).optional()
    }), {
      bucket: {
        description: "S3 bucket name (required)",
        examples: ["my-app-bucket"]
      }
    }),
    input: { bucket: "test-bucket", prefix: "logs/" },
    expectedValid: true,
    expectedMissingParams: []
  },
  {
    name: 'RDS CPU Metrics - Missing required dbInstanceIdentifier',
    schema: z.object({
      dbInstanceIdentifier: z.string(),
      startMinutesAgo: z.number().int().min(1).max(1440).default(60),
      endMinutesAgo: z.number().int().min(0).max(1439).default(0),
      periodMinutes: z.number().int().min(1).max(1440).default(5)
    }),
    parameterPrompts: createParameterPrompts(z.object({
      dbInstanceIdentifier: z.string(),
      startMinutesAgo: z.number().int().min(1).max(1440).default(60),
      endMinutesAgo: z.number().int().min(0).max(1439).default(0),
      periodMinutes: z.number().int().min(1).max(1440).default(5)
    }), {
      dbInstanceIdentifier: {
        description: "RDS DB instance identifier/name (required)",
        examples: ["mi-test-2", "prod-mysql-01"]
      }
    }),
    input: { startMinutesAgo: 120 }, // Missing required 'dbInstanceIdentifier'
    expectedValid: false,
    expectedMissingParams: ['dbInstanceIdentifier']
  },
  {
    name: 'Athena Query - Missing all required parameters',
    schema: z.object({
      database: z.string(),
      workgroup: z.string(),
      sql: z.string()
    }),
    parameterPrompts: createParameterPrompts(z.object({
      database: z.string(),
      workgroup: z.string(),
      sql: z.string()
    }), {
      database: {
        description: "Athena database name (required)",
        examples: ["default", "analytics"]
      },
      workgroup: {
        description: "Athena workgroup name (required)",
        examples: ["primary", "analytics"]
      },
      sql: {
        description: "SQL query to execute (required)",
        examples: ["SELECT * FROM table LIMIT 10"]
      }
    }),
    input: {}, // Missing all required parameters
    expectedValid: false,
    expectedMissingParams: ['database', 'workgroup', 'sql']
  },
  {
    name: 'CloudWatch Logs - Invalid parameter value',
    schema: z.object({
      logGroup: z.string(),
      query: z.string(),
      startMinutesAgo: z.number().int().min(1).max(1440).default(60)
    }),
    parameterPrompts: createParameterPrompts(z.object({
      logGroup: z.string(),
      query: z.string(),
      startMinutesAgo: z.number().int().min(1).max(1440).default(60)
    }), {
      logGroup: {
        description: "CloudWatch Log Group name (required)",
        examples: ["/aws/lambda/my-function"]
      },
      query: {
        description: "CloudWatch Logs Insights query (required)",
        examples: ["fields @timestamp, @message | sort @timestamp desc"]
      }
    }),
    input: { 
      logGroup: "/aws/lambda/test",
      query: "fields @timestamp",
      startMinutesAgo: 2000 // Invalid: exceeds max value of 1440
    },
    expectedValid: false,
    expectedMissingParams: []
  }
];

// Run tests
function runTests() {
  console.log('🧪 Testing MCP AWS Server Parameter Validation\n');
  
  let passed = 0;
  let failed = 0;
  
  for (const testCase of testCases) {
    console.log(`\n📋 Test: ${testCase.name}`);
    console.log(`Input: ${JSON.stringify(testCase.input)}`);
    
    const toolDef = {
      name: 'test-tool',
      description: 'Test tool',
      inputSchema: testCase.schema,
      parameterPrompts: testCase.parameterPrompts,
      handler: async () => ({})
    };
    
    const validation = ParameterValidator.validateParameters(toolDef, testCase.input);
    
    // Check validation result
    if (validation.isValid !== testCase.expectedValid) {
      console.log(`❌ FAIL: Expected valid=${testCase.expectedValid}, got valid=${validation.isValid}`);
      failed++;
      continue;
    }
    
    // Check missing parameters
    const actualMissingParams = validation.missingParams.map(p => p.name).sort();
    const expectedMissingParams = testCase.expectedMissingParams.sort();
    
    if (JSON.stringify(actualMissingParams) !== JSON.stringify(expectedMissingParams)) {
      console.log(`❌ FAIL: Expected missing params ${JSON.stringify(expectedMissingParams)}, got ${JSON.stringify(actualMissingParams)}`);
      failed++;
      continue;
    }
    
    if (!validation.isValid && validation.missingParams.length > 0) {
      console.log('📝 Generated user prompt:');
      const prompt = ParameterValidator.generateParameterPrompt('test-tool', validation.missingParams);
      console.log(prompt);
    }
    
    if (!validation.isValid && validation.validationErrors.length > 0) {
      console.log('⚠️ Generated validation errors:');
      const errorMsg = ParameterValidator.generateValidationErrorMessage('test-tool', validation.validationErrors);
      console.log(errorMsg);
    }
    
    console.log('✅ PASS');
    passed++;
  }
  
  console.log(`\n\n📊 Test Results: ${passed} passed, ${failed} failed`);
  
  if (failed === 0) {
    console.log('🎉 All tests passed! Parameter validation is working correctly.');
  } else {
    console.log('❌ Some tests failed. Please check the implementation.');
    process.exit(1);
  }
}

// Run the tests
runTests();
