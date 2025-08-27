import { z } from "zod";
import { McpError, ErrorCode } from "@modelcontextprotocol/sdk/types.js";
import { logger } from "./debug.js";

export interface ParameterPrompt {
  name: string;
  description: string;
  required: boolean;
  type: 'string' | 'number' | 'boolean' | 'array';
  defaultValue?: any;
  examples?: string[];
  validation?: {
    min?: number;
    max?: number;
    pattern?: string;
    options?: string[];
  };
}

export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: z.ZodSchema;
  handler: (input: any) => Promise<any>;
  parameterPrompts: ParameterPrompt[];
}

export class ParameterValidator {
  
  // Common parameter name mappings for intelligent suggestions
  private static PARAMETER_ALIASES: Record<string, string[]> = {
    'dbInstanceIdentifier': ['db_identifier', 'database_id', 'instance_name', 'db_name', 'rds_instance'],
    'bucketName': ['bucket', 's3_bucket', 'bucket_id'],
    'clusterName': ['cluster', 'ecs_cluster', 'cluster_id'],
    'repositoryName': ['repository', 'repo', 'repo_name', 'ecr_repo'],
    'query': ['sql', 'sql_query', 'log_query', 'search_query'],
    'startTime': ['start', 'from', 'start_date', 'begin_time'],
    'endTime': ['end', 'to', 'end_date', 'finish_time'],
    'prefix': ['path', 'folder', 's3_prefix', 'object_prefix'],
    'maxResults': ['limit', 'max_items', 'count', 'max_count'],
    'tableName': ['table', 'athena_table', 'table_id'],
    'database': ['db', 'athena_database', 'database_name'],
    'roleArn': ['role', 'iam_role', 'assume_role', 'role_arn']
  };
  
  /**
   * Suggest correct parameter names based on common aliases
   */
  private static suggestParameterNames(providedParams: any, expectedParams: ParameterPrompt[]): string[] {
    const suggestions: string[] = [];
    const providedKeys = Object.keys(providedParams || {});
    
    for (const expectedParam of expectedParams) {
      if (expectedParam.required && !providedParams[expectedParam.name]) {
        // Look for potential aliases in provided parameters
        const aliases = this.PARAMETER_ALIASES[expectedParam.name] || [];
        
        for (const providedKey of providedKeys) {
          if (aliases.includes(providedKey.toLowerCase())) {
            suggestions.push(`Did you mean '${expectedParam.name}' instead of '${providedKey}'?`);
          }
        }
      }
    }
    
    return suggestions;
  }
  
  /**
   * Validate parameters and generate user-friendly error messages for missing required params
   */
  static validateParameters(toolDef: ToolDefinition, input: any): { 
    isValid: boolean; 
    missingParams: ParameterPrompt[]; 
    validationErrors: string[];
    suggestions?: string[];
    validatedInput?: any;
  } {
    try {
      // First try to parse with Zod schema
      const validatedInput = toolDef.inputSchema.parse(input);
      return { 
        isValid: true, 
        missingParams: [], 
        validationErrors: [],
        validatedInput 
      };
    } catch (error) {
      if (error instanceof z.ZodError) {
        const missingParams: ParameterPrompt[] = [];
        const validationErrors: string[] = [];

        for (const issue of error.issues) {
          const fieldPath = issue.path.join('.');
          const paramPrompt = toolDef.parameterPrompts.find(p => p.name === fieldPath);
          
          if (issue.code === z.ZodIssueCode.invalid_type && issue.received === 'undefined') {
            // Missing required parameter
            if (paramPrompt && paramPrompt.required) {
              missingParams.push(paramPrompt);
            }
          } else {
            // Other validation errors
            validationErrors.push(`Parameter '${fieldPath}': ${issue.message}`);
            if (paramPrompt) {
              validationErrors.push(`  Expected: ${paramPrompt.description}`);
              if (paramPrompt.examples) {
                validationErrors.push(`  Examples: ${paramPrompt.examples.join(', ')}`);
              }
            }
          }
        }

        return {
          isValid: false,
          missingParams,
          validationErrors,
          suggestions: this.suggestParameterNames(input, toolDef.parameterPrompts)
        };
      }
      
      // Unknown validation error
      return {
        isValid: false,
        missingParams: [],
        validationErrors: [`Validation failed: ${error}`],
        suggestions: []
      };
    }
  }

  /**
   * Generate user-friendly prompt for missing parameters with JSON example
   */
  static generateParameterPrompt(toolName: string, missingParams: ParameterPrompt[]): string {
    const lines = [
      `MCP error -32602: Tool '${toolName}' requires the following parameters:`,
      ""
    ];

    // Generate example JSON object
    const exampleJson: any = {};
    
    for (const param of missingParams) {
      lines.push(`**${param.name}** (${param.required ? 'required' : 'optional'})`);
      lines.push(`  ${param.description}`);
      
      if (param.examples && param.examples.length > 0) {
        lines.push(`  Examples: ${param.examples.join(', ')}`);
        // Use first example for JSON template
        exampleJson[param.name] = param.examples[0];
      } else if (param.defaultValue !== undefined) {
        exampleJson[param.name] = param.defaultValue;
      } else {
        // Provide placeholder based on type
        switch (param.type) {
          case 'string':
            exampleJson[param.name] = param.validation?.options ? param.validation.options[0] : "example-value";
            break;
          case 'number':
            exampleJson[param.name] = param.validation?.min || 1;
            break;
          case 'boolean':
            exampleJson[param.name] = true;
            break;
          case 'array':
            exampleJson[param.name] = ["example"];
            break;
          default:
            exampleJson[param.name] = "example-value";
        }
      }
      
      if (param.validation) {
        const validation = param.validation;
        if (validation.min !== undefined || validation.max !== undefined) {
          lines.push(`  Range: ${validation.min ?? 'any'} to ${validation.max ?? 'any'}`);
        }
        if (validation.options) {
          lines.push(`  Valid options: ${validation.options.join(', ')}`);
        }
        if (validation.pattern) {
          lines.push(`  Pattern: ${validation.pattern}`);
        }
      }
      
      if (param.defaultValue !== undefined) {
        lines.push(`  Default: ${param.defaultValue}`);
      }
      
      lines.push("");
    }

    lines.push("Example usage:");
    lines.push("```json");
    lines.push(JSON.stringify(exampleJson, null, 2));
    lines.push("```");
    lines.push("");
    lines.push("Please provide these parameters and try again.");
    return lines.join('\n');
  }

  /**
   * Generate validation error message
   */
  static generateValidationErrorMessage(toolName: string, validationErrors: string[]): string {
    const lines = [
      `Tool '${toolName}' parameter validation failed:`,
      ""
    ];
    
    for (const error of validationErrors) {
      lines.push(`  • ${error}`);
    }
    
    lines.push("");
    lines.push("Please correct the parameters and try again.");
    return lines.join('\n');
  }
}

/**
 * Helper function to create parameter prompts from Zod schema
 */
export function createParameterPrompts(schema: z.ZodSchema, customPrompts: Partial<Record<string, Partial<ParameterPrompt>>> = {}): ParameterPrompt[] {
  const prompts: ParameterPrompt[] = [];
  
  if (schema instanceof z.ZodObject) {
    const shape = schema.shape;
    
    for (const [key, fieldSchema] of Object.entries(shape)) {
      const custom = customPrompts[key] || {};
      const isOptional = isZodOptional(fieldSchema);
      const prompt: ParameterPrompt = {
        name: key,
        description: custom.description || `Parameter: ${key}`,
        required: !isOptional,
        type: getZodType(fieldSchema),
        examples: custom.examples,
        validation: custom.validation,
        defaultValue: custom.defaultValue
      };
      
      // Extract default value from Zod schema if available
      if (fieldSchema instanceof z.ZodDefault) {
        prompt.defaultValue = (fieldSchema as any)._def.defaultValue();
        prompt.required = false;
      }
      
      prompts.push(prompt);
    }
  }
  
  return prompts;
}

function isZodOptional(schema: any): boolean {
  return schema instanceof z.ZodOptional || 
         schema instanceof z.ZodDefault ||
         (schema._def && schema._def.typeName === 'ZodOptional');
}

function getZodType(schema: any): 'string' | 'number' | 'boolean' | 'array' {
  if (schema instanceof z.ZodString) return 'string';
  if (schema instanceof z.ZodNumber) return 'number';
  if (schema instanceof z.ZodBoolean) return 'boolean';
  if (schema instanceof z.ZodArray) return 'array';
  if (schema instanceof z.ZodOptional) return getZodType(schema.unwrap());
  if (schema instanceof z.ZodDefault) return getZodType((schema as any).removeDefault());
  return 'string'; // fallback
}
