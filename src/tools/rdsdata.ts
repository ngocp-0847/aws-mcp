import { z } from "zod";
import { rdsdata } from "../awsClients.js";
import { ExecuteStatementCommand } from "@aws-sdk/client-rds-data";
import { createParameterPrompts } from "../parameterHandler.js";

const rdsExecuteSchema = z.object({
  resourceArn: z.string(), // cluster or db ARN
  secretArn: z.string(),   // Secrets Manager secret ARN
  sql: z.string(),
  database: z.string().optional(),
  schema: z.string().optional()
});

export const rdsExecute = {
  name: "aws_rdsdata_execute",
  description: "Execute SQL via RDS Data API (Aurora Serverless v2).",
  inputSchema: rdsExecuteSchema,
  parameterPrompts: createParameterPrompts(rdsExecuteSchema, {
    resourceArn: {
      description: "RDS cluster or DB ARN (required) - full ARN of Aurora Serverless cluster",
      examples: [
        "arn:aws:rds:us-east-1:123456789012:cluster:my-aurora-cluster",
        "arn:aws:rds:ap-northeast-1:123456789012:cluster:prod-cluster"
      ]
    },
    secretArn: {
      description: "Secrets Manager secret ARN (required) - ARN containing DB credentials",
      examples: [
        "arn:aws:secretsmanager:us-east-1:123456789012:secret:rds-db-credentials/cluster-XYZ123",
        "arn:aws:secretsmanager:ap-northeast-1:123456789012:secret:aurora-creds-ABC456"
      ]
    },
    sql: {
      description: "SQL statement to execute (required) - valid SQL query or command",
      examples: [
        "SELECT * FROM users LIMIT 10",
        "INSERT INTO logs (message, timestamp) VALUES ('test', NOW())",
        "UPDATE users SET status = 'active' WHERE id = 1"
      ]
    },
    database: {
      description: "Database name (optional) - target database within the cluster",
      examples: ["myapp", "production", "analytics", "test"]
    },
    schema: {
      description: "Schema name (optional) - target schema within the database",
      examples: ["public", "app", "analytics", "staging"]
    }
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
