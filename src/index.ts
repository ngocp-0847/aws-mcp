import 'dotenv/config';
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { z } from "zod";

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

for (const t of tools) {
  server.tool(t.name, t.description, t.inputSchema as z.ZodTypeAny, t.handler);
}

server.start(); // stdio
