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
import { ParameterValidator, ToolDefinition } from "./parameterHandler.js";

import { s3List, s3GetText, s3PutText, s3ListBuckets } from "./tools/s3.js";
import { cwQuery } from "./tools/cloudwatch.js";
import { ecsListTasks } from "./tools/ecs.js";
import { ecrListImages } from "./tools/ecr.js";
import { rdsExecute } from "./tools/rdsdata.js";
import { rdsGetCpuMetrics, rdsGetTopSql } from "./tools/rds.js";
import { athenaQuery } from "./tools/athena.js";
import { stsAssume } from "./tools/sts.js";
import { ceGetCost } from "./tools/cost.js";

const server = new Server({
  name: "mcp-aws",
  version: "0.1.0"
}, {
  capabilities: {
    tools: {}
  }
});

const tools: ToolDefinition[] = [
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

// List tools handler
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: tools.map(tool => ({
      name: tool.name,
      description: tool.description,
      inputSchema: tool.inputSchema
    }))
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
      const promptMessage = ParameterValidator.generateParameterPrompt(name, validation.missingParams);
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
