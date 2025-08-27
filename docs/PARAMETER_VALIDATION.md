# MCP AWS Server - Parameter Validation Improvements

## Overview

The MCP AWS server has been updated with a robust parameter validation system that addresses the issue of frequently passing incorrect parameters. Instead of tools failing and then asking for missing parameters, the server now:

1. **Validates all parameters upfront** before executing any tool
2. **Provides clear, user-friendly error messages** with examples and descriptions
3. **Prompts users for required parameters** immediately when they are missing
4. **Gives specific validation feedback** for invalid parameter values

## Key Improvements

### 1. Parameter Prompts System

Each tool now includes detailed `parameterPrompts` that provide:
- Clear descriptions of what each parameter does
- Examples of valid values
- Validation rules (min/max values, allowed options)
- Default values where applicable

### 2. Upfront Validation

The server validates parameters immediately when a tool is called:
- **Required parameter check**: Identifies missing required parameters
- **Type validation**: Ensures parameters are the correct type
- **Range validation**: Validates numeric ranges and string patterns
- **Enum validation**: Checks against allowed values

### 3. User-Friendly Error Messages

Instead of cryptic error messages, users now receive:

#### Missing Parameters Example:
```
Tool 'aws_s3_list' requires the following parameters:

**bucket** (required)
  S3 bucket name (required) - exact bucket name like 'my-app-bucket', 'data-lake-prod'
  Examples: my-app-bucket, data-lake-prod, backup-storage

Please provide these parameters and try again.
```

#### Invalid Parameters Example:
```
Tool 'aws_rds_get_cpu_metrics' parameter validation failed:

  • Parameter 'startMinutesAgo': Number must be less than or equal to 1440
  •   Expected: How many minutes ago to start collecting data (optional, default: 60 = last hour)
  •   Examples: 60, 120, 240, 1440

Please correct the parameters and try again.
```

## Updated Tools

All tools have been enhanced with comprehensive parameter validation:

### S3 Tools
- `aws_s3_list`: Requires `bucket`, optional `prefix` and `maxKeys`
- `aws_s3_get_text`: Requires `bucket` and `key`
- `aws_s3_put_text`: Requires `bucket`, `key`, and `text`

### CloudWatch Tools
- `aws_cw_logs_query`: Requires `logGroup` and `query`, optional `startMinutesAgo`

### RDS Tools
- `aws_rds_get_cpu_metrics`: Requires `dbInstanceIdentifier`
- `aws_rds_performance_insights_top_sql`: Requires `dbInstanceIdentifier`

### Athena Tools
- `aws_athena_query`: Requires `database`, `workgroup`, and `sql`

### ECS Tools
- `aws_ecs_list_tasks`: Requires `cluster`, optional `serviceName`

### ECR Tools
- `aws_ecr_list_images`: Requires `repositoryName`

### RDS Data API Tools
- `aws_rdsdata_execute`: Requires `resourceArn`, `secretArn`, and `sql`

### STS Tools
- `aws_sts_assume_role`: Optional `roleArn` (uses env default if not provided)

### Cost Explorer Tools
- `aws_cost_explorer_get_cost`: Requires `start` and `end` dates

## Benefits

1. **Reduced Failed Calls**: Users get immediate feedback about missing or invalid parameters
2. **Better User Experience**: Clear, helpful error messages with examples
3. **Faster Debugging**: Specific validation errors help users fix issues quickly
4. **Consistent Interface**: All tools follow the same parameter validation pattern
5. **Prevention of Silent Failures**: No more tools that run with incomplete data

## Technical Implementation

The improvements are built around:
- `ParameterValidator` class for validation logic
- `createParameterPrompts()` helper for generating parameter descriptions
- Enhanced Zod schemas with better error handling
- Structured error messages with examples and validation rules

## Testing

Run the validation test suite:
```bash
npm run build
node scripts/test-parameter-validation.js
```

This ensures the parameter validation system works correctly across all scenarios.

## Backward Compatibility

The changes are fully backward compatible. Existing tool calls will continue to work, but now with better error messages when parameters are missing or invalid.
