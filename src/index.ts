import 'dotenv/config';
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
} from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { logger } from "./debug.js";
import { ParameterValidator, ToolDefinition, ParameterPrompt } from "./parameterHandler.js";

import { s3List, s3GetText, s3PutText, s3ListBuckets } from "./tools/s3.js";
import { cwQuery } from "./tools/cloudwatch.js";
import { ecsListTasks } from "./tools/ecs.js";
import { ecrListImages } from "./tools/ecr.js";
import { rdsExecute } from "./tools/rdsdata.js";
import { rdsGetCpuMetrics, rdsGetTopSql } from "./tools/rds.js";
import { athenaQuery } from "./tools/athena.js";
import { stsAssume } from "./tools/sts.js";
import { ceGetCost } from "./tools/cost.js";
import { validateParameters } from "./tools/validation.js";

const server = new Server({
  name: "mcp-aws",
  version: "0.1.0"
}, {
  capabilities: {
    tools: {}
  }
});

const tools: ToolDefinition[] = [
  validateParameters, // Put validation tool first for easy discovery
  s3ListBuckets, s3List, s3GetText, s3PutText,
  cwQuery,
  ecsListTasks,
  ecrListImages,
  rdsExecute,
  rdsGetCpuMetrics,
  rdsGetTopSql,
  athenaQuery,
  stsAssume,
  ceGetCost
];

/**
 * Enrich JSON schema with detailed parameter information for better AI understanding
 */
function enrichSchemaWithPrompts(zodSchema: z.ZodSchema, parameterPrompts: ParameterPrompt[]): any {
  const baseSchema = zodSchema as any;
  
  // Convert Zod schema to JSON schema format
  let jsonSchema: any = {};
  
  if (zodSchema instanceof z.ZodObject) {
    const shape = zodSchema.shape;
    const properties: any = {};
    const required: string[] = [];
    
    for (const [key, fieldSchema] of Object.entries(shape)) {
      const prompt = parameterPrompts.find(p => p.name === key);
      const fieldDef = fieldSchema as any;
      
      // Extract basic type information
      let propertySchema: any = {
        type: getJsonSchemaType(fieldSchema),
      };
      
      if (prompt) {
        // Add rich description with examples and validation info
        let description = prompt.description;
        
        if (prompt.examples && prompt.examples.length > 0) {
          description += `\nExamples: ${prompt.examples.join(', ')}`;
        }
        
        if (prompt.validation) {
          const validation = prompt.validation;
          if (validation.min !== undefined) {
            propertySchema.minimum = validation.min;
            description += `\nMinimum: ${validation.min}`;
          }
          if (validation.max !== undefined) {
            propertySchema.maximum = validation.max;
            description += `\nMaximum: ${validation.max}`;
          }
          if (validation.options) {
            propertySchema.enum = validation.options;
            description += `\nValid options: ${validation.options.join(', ')}`;
          }
          if (validation.pattern) {
            propertySchema.pattern = validation.pattern;
            description += `\nPattern: ${validation.pattern}`;
          }
        }
        
        if (prompt.defaultValue !== undefined) {
          propertySchema.default = prompt.defaultValue;
          description += `\nDefault: ${prompt.defaultValue}`;
        }
        
        propertySchema.description = description;
      }
      
      // Handle enum types
      if (fieldSchema instanceof z.ZodEnum) {
        propertySchema.enum = (fieldSchema as any)._def.values;
      }
      
      // Handle default values from Zod
      if (fieldSchema instanceof z.ZodDefault) {
        propertySchema.default = (fieldSchema as any)._def.defaultValue();
      } else if (!isZodOptional(fieldSchema)) {
        required.push(key);
      }
      
      properties[key] = propertySchema;
    }
    
    jsonSchema = {
      type: "object",
      properties,
      required: required.length > 0 ? required : undefined,
      additionalProperties: false
    };
  }
  
  return jsonSchema;
}

function getJsonSchemaType(zodSchema: any): string {
  if (zodSchema instanceof z.ZodString) return "string";
  if (zodSchema instanceof z.ZodNumber) return "number"; 
  if (zodSchema instanceof z.ZodBoolean) return "boolean";
  if (zodSchema instanceof z.ZodArray) return "array";
  if (zodSchema instanceof z.ZodEnum) return "string";
  if (zodSchema instanceof z.ZodOptional) return getJsonSchemaType(zodSchema.unwrap());
  if (zodSchema instanceof z.ZodDefault) return getJsonSchemaType((zodSchema as any).removeDefault());
  return "string"; // fallback
}

function isZodOptional(schema: any): boolean {
  return schema instanceof z.ZodOptional || 
         schema instanceof z.ZodDefault ||
         (schema._def && schema._def.typeName === 'ZodOptional');
}

// List tools handler
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: tools.map(tool => {
      // Enrich the schema with parameter prompts information
      const enrichedSchema = enrichSchemaWithPrompts(tool.inputSchema, tool.parameterPrompts);
      
      return {
        name: tool.name,
        description: tool.description,
        inputSchema: enrichedSchema
      };
    })
  };
});

// Call tool handler
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  
  logger.debug(`Tool called: ${name}`, args);
  
  const tool = tools.find(t => t.name === name);
  if (!tool) {
    logger.error(`Tool not found: ${name}`);
    throw new McpError(ErrorCode.MethodNotFound, `Tool ${name} not found`);
  }

  // Validate parameters using the new parameter handler
  const validation = ParameterValidator.validateParameters(tool, args);
  
  if (!validation.isValid) {
    if (validation.missingParams.length > 0) {
      // Generate user-friendly prompt for missing required parameters
      let promptMessage = ParameterValidator.generateParameterPrompt(name, validation.missingParams);
      
      // Add suggestions if available
      if (validation.suggestions && validation.suggestions.length > 0) {
        promptMessage += "\n\nSuggestions:\n";
        for (const suggestion of validation.suggestions) {
          promptMessage += `  • ${suggestion}\n`;
        }
      }
      
      logger.error(`Tool ${name} called with missing required parameters`, validation.missingParams.map(p => p.name));
      
      throw new McpError(ErrorCode.InvalidParams, promptMessage);
    }
    
    if (validation.validationErrors.length > 0) {
      // Generate validation error message
      const errorMessage = ParameterValidator.generateValidationErrorMessage(name, validation.validationErrors);
      logger.error(`Tool ${name} called with invalid parameters`, validation.validationErrors);
      
      throw new McpError(ErrorCode.InvalidParams, errorMessage);
    }
  }

  try {
    logger.debug(`Executing tool: ${name} with validated input`);
    const startTime = Date.now();
    const result = await tool.handler(validation.validatedInput!);
    const duration = Date.now() - startTime;
    
    logger.debug(`Tool ${name} completed in ${duration}ms`);
    logger.debug(`Tool ${name} result size: ${JSON.stringify(result).length} characters`);
    
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(result, null, 2)
        }
      ]
    };
  } catch (error) {
    logger.error(`Tool ${name} execution failed`, error);
    throw new McpError(ErrorCode.InternalError, `Tool execution failed: ${error}`);
  }
});

// Start the server
async function main() {
  logger.info("Starting MCP AWS server...");
  
  const transport = new StdioServerTransport();
  await server.connect(transport);
  
  logger.info("MCP AWS server running on stdio");
  logger.debug("Available tools:", tools.map(t => t.name));
}

main().catch((error) => {
  logger.error("Server failed to start", error);
  process.exit(1);
});
