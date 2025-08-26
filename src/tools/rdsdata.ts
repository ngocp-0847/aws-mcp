import { z } from "zod";
import { rdsdata } from "../awsClients.js";
import { ExecuteStatementCommand } from "@aws-sdk/client-rds-data";

export const rdsExecute = {
  name: "aws_rdsdata_execute",
  description: "Execute SQL via RDS Data API (Aurora Serverless v2).",
  inputSchema: z.object({
    resourceArn: z.string(), // cluster or db ARN
    secretArn: z.string(),   // Secrets Manager secret ARN
    sql: z.string(),
    database: z.string().optional(),
    schema: z.string().optional()
  }),
  handler: async (input: any) => {
    const res = await rdsdata.send(new ExecuteStatementCommand({
      resourceArn: input.resourceArn,
      secretArn: input.secretArn,
      sql: input.sql,
      database: input.database,
      schema: input.schema,
      includeResultMetadata: true
    }));
    const cols = res.columnMetadata?.map(c => c.name ?? "") ?? [];
    const rows = (res.records ?? []).map(r =>
      Object.fromEntries(r!.map((f, i) => [cols[i], Object.values(f!)[0]]))
    );
    return { columns: cols, rows };
  }
};
