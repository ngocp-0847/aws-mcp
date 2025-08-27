import { z } from "zod";
import { athena } from "../awsClients.js";
import { StartQueryExecutionCommand, GetQueryExecutionCommand, GetQueryResultsCommand } from "@aws-sdk/client-athena";
import { createParameterPrompts } from "../parameterHandler.js";
const athenaQuerySchema = z.object({
    database: z.string(),
    workgroup: z.string(),
    sql: z.string()
});
export const athenaQuery = {
    name: "aws_athena_query",
    description: "Run an Athena query and wait for results (best for small/medium result sets).",
    inputSchema: athenaQuerySchema,
    parameterPrompts: createParameterPrompts(athenaQuerySchema, {
        database: {
            description: "Athena database name (required) - target database for the query",
            examples: ["default", "analytics", "data_lake", "prod_db"]
        },
        workgroup: {
            description: "Athena workgroup name (required) - workgroup to execute the query in",
            examples: ["primary", "analytics", "dev", "prod"]
        },
        sql: {
            description: "SQL query to execute (required) - valid Athena/Presto SQL statement",
            examples: [
                "SELECT * FROM my_table LIMIT 10",
                "SELECT COUNT(*) FROM logs WHERE date = '2024-01-01'",
                "SHOW TABLES"
            ]
        }
    }),
    handler: async (input) => {
        const start = await athena.send(new StartQueryExecutionCommand({
            QueryString: input.sql,
            QueryExecutionContext: { Database: input.database },
            WorkGroup: input.workgroup
        }));
        const qid = start.QueryExecutionId;
        const timeout = Number(process.env.MCP_ATHENA_TIMEOUT_MS ?? 60000);
        const startAt = Date.now();
        while (true) {
            const q = await athena.send(new GetQueryExecutionCommand({ QueryExecutionId: qid }));
            const state = q.QueryExecution?.Status?.State;
            if (state === "SUCCEEDED")
                break;
            if (state === "FAILED" || state === "CANCELLED")
                return { state, queryId: qid, reason: q.QueryExecution?.Status?.StateChangeReason };
            if (Date.now() - startAt > timeout)
                return { state: "TIMEOUT", queryId: qid };
            await new Promise(r => setTimeout(r, 1000));
        }
        const out = await athena.send(new GetQueryResultsCommand({ QueryExecutionId: qid }));
        const [header, ...data] = out.ResultSet?.Rows ?? [];
        const cols = header?.Data?.map(d => d.VarCharValue ?? "") ?? [];
        const rows = data.map(r => Object.fromEntries((r.Data ?? []).map((d, i) => [cols[i], d.VarCharValue ?? null])));
        return { state: "SUCCEEDED", columns: cols, rows };
    }
};
