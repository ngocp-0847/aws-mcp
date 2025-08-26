import { z } from "zod";
import { athena } from "../awsClients.js";
import { StartQueryExecutionCommand, GetQueryExecutionCommand, GetQueryResultsCommand } from "@aws-sdk/client-athena";

export const athenaQuery = {
  name: "aws.athena_query",
  description: "Run an Athena query and wait for results (best for small/medium result sets).",
  inputSchema: z.object({
    database: z.string(),
    workgroup: z.string(),
    sql: z.string()
  }),
  handler: async (input: any) => {
    const start = await athena.send(new StartQueryExecutionCommand({
      QueryString: input.sql,
      QueryExecutionContext: { Database: input.database },
      WorkGroup: input.workgroup
    }));
    const qid = start.QueryExecutionId!;
    const timeout = Number(process.env.MCP_ATHENA_TIMEOUT_MS ?? 60000);
    const startAt = Date.now();

    while (true) {
      const q = await athena.send(new GetQueryExecutionCommand({ QueryExecutionId: qid }));
      const state = q.QueryExecution?.Status?.State;
      if (state === "SUCCEEDED") break;
      if (state === "FAILED" || state === "CANCELLED") return { state, queryId: qid, reason: q.QueryExecution?.Status?.StateChangeReason };
      if (Date.now() - startAt > timeout) return { state: "TIMEOUT", queryId: qid };
      await new Promise(r => setTimeout(r, 1000));
    }

    const out = await athena.send(new GetQueryResultsCommand({ QueryExecutionId: qid }));
    const [header, ...data] = out.ResultSet?.Rows ?? [];
    const cols = header?.Data?.map(d => d.VarCharValue ?? "") ?? [];
    const rows = data.map(r => Object.fromEntries((r.Data ?? []).map((d, i) => [cols[i], d.VarCharValue ?? null])));
    return { state: "SUCCEEDED", columns: cols, rows };
  }
};
