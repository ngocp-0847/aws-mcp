import { z } from "zod";
import { cwl } from "../awsClients.js";
import { StartQueryCommand, GetQueryResultsCommand } from "@aws-sdk/client-cloudwatch-logs";
import { createParameterPrompts } from "../parameterHandler.js";

const cwQuerySchema = z.object({
  logGroup: z.string(),
  query: z.string(),
  startMinutesAgo: z.number().int().min(1).max(1440).default(60)
});

export const cwQuery = {
  name: "aws_cw_logs_query",
  description: "Run a CloudWatch Logs Insights query and wait for results (short windows).",
  inputSchema: cwQuerySchema,
  parameterPrompts: createParameterPrompts(cwQuerySchema, {
    logGroup: {
      description: "CloudWatch Log Group name (required) - exact log group name like '/aws/lambda/my-function'",
      examples: ["/aws/lambda/my-function", "/aws/ecs/my-service", "/aws/apigateway/my-api", "application-logs"]
    },
    query: {
      description: "CloudWatch Logs Insights query (required) - SQL-like query to search logs",
      examples: [
        "fields @timestamp, @message | sort @timestamp desc | limit 20",
        "filter @message like /ERROR/ | fields @timestamp, @message",
        "stats count() by bin(5m)"
      ]
    },
    startMinutesAgo: {
      description: "How many minutes ago to start searching (optional, 1-1440 minutes)",
      validation: { min: 1, max: 1440 },
      defaultValue: 60,
      examples: ["60", "120", "1440"]
    }
  }),
  handler: async (input: any) => {
    const end = Math.floor(Date.now() / 1000);
    const start = end - input.startMinutesAgo * 60;

    const startRes = await cwl.send(new StartQueryCommand({
      logGroupName: input.logGroup,
      queryString: input.query,
      startTime: start,
      endTime: end,
      limit: 1000
    }));
    const qid = startRes.queryId!;
    const timeout = Number(process.env.MCP_CW_TIMEOUT_MS ?? 45000);
    const startAt = Date.now();

    while (true) {
      const r = await cwl.send(new GetQueryResultsCommand({ queryId: qid }));
      if (r.status === "Complete") {
        const rows = (r.results ?? []).map(row => Object.fromEntries(row!.map(c => [c.field!, c.value!])));
        return { status: r.status, results: rows };
      }
      if (Date.now() - startAt > timeout) return { status: "Timeout", queryId: qid };
      await new Promise(res => setTimeout(res, 1000));
    }
  }
};
