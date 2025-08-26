import 'dotenv/config';
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ErrorCode, ListToolsRequestSchema, McpError, } from "@modelcontextprotocol/sdk/types.js";
import { s3List, s3GetText, s3PutText } from "./tools/s3.js";
import { cwQuery } from "./tools/cloudwatch.js";
import { ecsListTasks } from "./tools/ecs.js";
import { ecrListImages } from "./tools/ecr.js";
import { rdsExecute } from "./tools/rdsdata.js";
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
const tools = [
    s3List, s3GetText, s3PutText,
    cwQuery,
    ecsListTasks,
    ecrListImages,
    rdsExecute,
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
    const tool = tools.find(t => t.name === name);
    if (!tool) {
        throw new McpError(ErrorCode.MethodNotFound, `Tool ${name} not found`);
    }
    try {
        const result = await tool.handler(args);
        return {
            content: [
                {
                    type: "text",
                    text: JSON.stringify(result, null, 2)
                }
            ]
        };
    }
    catch (error) {
        throw new McpError(ErrorCode.InternalError, `Tool execution failed: ${error}`);
    }
});
// Start the server
async function main() {
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error("MCP AWS server running on stdio");
}
main().catch((error) => {
    console.error("Server failed to start:", error);
    process.exit(1);
});
