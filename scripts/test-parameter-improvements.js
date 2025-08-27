/**
 * Test script to demonstrate parameter validation improvements
 */

import { validateParameters } from '../dist/tools/validation.js';
import { rdsGetTopSql } from '../dist/tools/rds.js';
import { ParameterValidator } from '../dist/parameterHandler.js';

async function testParameterValidation() {
  console.log('=== Testing Parameter Validation Improvements ===\n');

  // Test 1: Validation Tool with correct parameters
  console.log('1. Testing validation tool with CORRECT parameters:');
  try {
    const result1 = await validateParameters.handler({
      toolName: 'aws_rds_performance_insights_top_sql',
      parameters: {
        dbInstanceIdentifier: 'mi-test-2'
      }
    });
    console.log('✅ Result:', JSON.stringify(result1, null, 2));
  } catch (error) {
    console.log('❌ Error:', error);
  }

  console.log('\n' + '='.repeat(60) + '\n');

  // Test 2: Validation Tool with wrong parameter name
  console.log('2. Testing validation tool with WRONG parameter name (should suggest correction):');
  try {
    const result2 = await validateParameters.handler({
      toolName: 'aws_rds_performance_insights_top_sql',
      parameters: {
        db_identifier: 'mi-test-2'  // Wrong parameter name
      }
    });
    console.log('Result:', JSON.stringify(result2, null, 2));
  } catch (error) {
    console.log('❌ Error:', error);
  }

  console.log('\n' + '='.repeat(60) + '\n');

  // Test 3: Direct validation with ParameterValidator
  console.log('3. Testing direct ParameterValidator with wrong parameter:');
  const validation = ParameterValidator.validateParameters(rdsGetTopSql, {
    db_identifier: 'mi-test-2'  // Wrong parameter name
  });
  
  console.log('Validation Result:');
  console.log('- Valid:', validation.isValid);
  console.log('- Missing params:', validation.missingParams.map(p => p.name));
  console.log('- Suggestions:', validation.suggestions);

  if (!validation.isValid) {
    const errorMessage = ParameterValidator.generateParameterPrompt(
      'aws_rds_performance_insights_top_sql', 
      validation.missingParams
    );
    console.log('\nGenerated Error Message:');
    console.log(errorMessage);
  }

  console.log('\n' + '='.repeat(60) + '\n');

  // Test 4: Show enhanced schema
  console.log('4. Enhanced Parameter Schema (what AI client sees):');
  for (const param of rdsGetTopSql.parameterPrompts) {
    console.log(`\n• ${param.name} (${param.required ? 'required' : 'optional'}):`);
    console.log(`  Description: ${param.description}`);
    if (param.examples) {
      console.log(`  Examples: ${param.examples.join(', ')}`);
    }
    if (param.defaultValue !== undefined) {
      console.log(`  Default: ${param.defaultValue}`);
    }
  }
}

// Run tests if this file is executed directly
testParameterValidation().catch(console.error);
