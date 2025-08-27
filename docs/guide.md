Dưới đây là một **MCP server cho AWS Services** (Node/TypeScript, AWS SDK v3) với các “tools” hay dùng: S3, CloudWatch Logs Insights, ECS, ECR, RDS Data API, Athena, STS AssumeRole, Cost Explorer. Bạn chỉ cần copy cấu trúc, `npm i`, set `.env`, và khai báo trong Cursor.

---

# 1) Cấu trúc thư mục

```
mcp-aws/
├─ src/
│  ├─ index.ts
│  ├─ awsClients.ts
│  ├─ tools/
│  │  ├─ s3.ts
│  │  ├─ cloudwatch.ts
│  │  ├─ ecs.ts
│  │  ├─ ecr.ts
│  │  ├─ rdsdata.ts
│  │  ├─ athena.ts
│  │  ├─ sts.ts
│  │  └─ cost.ts
├─ package.json
├─ tsconfig.json
├─ .env.example
└─ README.md
```

---

# 2) `package.json`

```json
{
  "name": "mcp-aws",
  "version": "0.1.0",
  "type": "module",
  "main": "dist/index.js",
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "start": "node dist/index.js",
    "dev": "tsx src/index.ts"
  },
  "dependencies": {
    "@aws-sdk/client-athena": "^3.632.0",
    "@aws-sdk/client-cloudwatch-logs": "^3.632.0",
    "@aws-sdk/client-cost-explorer": "^3.632.0",
    "@aws-sdk/client-ecr": "^3.632.0",
    "@aws-sdk/client-ecs": "^3.632.0",
    "@aws-sdk/client-rds-data": "^3.632.0",
    "@aws-sdk/client-s3": "^3.632.0",
    "@aws-sdk/client-sts": "^3.632.0",
    "@modelcontextprotocol/sdk": "^0.2.0",
    "dotenv": "^16.4.5"
  },
  "devDependencies": {
    "tsx": "^4.16.2",
    "typescript": "^5.5.4"
  }
}
```

---

# 3) `tsconfig.json`

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ES2022",
    "moduleResolution": "Bundler",
    "outDir": "dist",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true
  },
  "include": ["src"]
}
```

---

# 4) `.env.example`

```bash
AWS_REGION=ap-northeast-1
# Nếu dùng access keys cục bộ (khuyên dùng profile/role hơn):
AWS_ACCESS_KEY_ID=
AWS_SECRET_ACCESS_KEY=
# Tuỳ chọn: default role để assume
MCP_AWS_DEFAULT_ROLE_ARN=
# Tuỳ chọn: timeouts/limits (ms)
MCP_ATHENA_TIMEOUT_MS=60000
MCP_CW_TIMEOUT_MS=45000
```

> Thực tế: bạn nên dùng **AWS SSO / profile** hoặc **EC2/ECS task role**. Keys chỉ dùng dev cục bộ.

---

# 5) `src/awsClients.ts`

```ts
import 'dotenv/config';
import {
  S3Client, 
} from '@aws-sdk/client-s3';
import {
  CloudWatchLogsClient,
} from '@aws-sdk/client-cloudwatch-logs';
import { ECSClient } from '@aws-sdk/client-ecs';
import { ECRClient } from '@aws-sdk/client-ecr';
import { RDSDataClient } from '@aws-sdk/client-rds-data';
import { STSClient } from '@aws-sdk/client-sts';
import { AthenaClient } from '@aws-sdk/client-athena';
import { CostExplorerClient } from '@aws-sdk/client-cost-explorer';

const region = process.env.AWS_REGION || 'ap-northeast-1';

export const s3 = new S3Client({ region });
export const cwl = new CloudWatchLogsClient({ region });
export const ecs = new ECSClient({ region });
export const ecr = new ECRClient({ region });
export const rdsdata = new RDSDataClient({ region });
export const sts = new STSClient({ region });
export const athena = new AthenaClient({ region });
export const cost = new CostExplorerClient({ region });
```

---

# 6) Các tools

### `src/tools/s3.ts`

```ts
import { z } from "@modelcontextprotocol/sdk/types";
import { s3 } from "../awsClients.js";
import { ListObjectsV2Command, GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { Readable } from "node:stream";

export const s3List = {
  name: "aws.s3_list",
  description: "List objects in S3 (bucket/prefix).",
  inputSchema: z.object({
    bucket: z.string(),
    prefix: z.string().optional(),
    maxKeys: z.number().int().min(1).max(1000).optional()
  }),
  handler: async (input: any) => {
    const out = await s3.send(new ListObjectsV2Command({
      Bucket: input.bucket,
      Prefix: input.prefix,
      MaxKeys: input.maxKeys ?? 100
    }));
    return { objects: (out.Contents ?? []).map(o => ({ key: o.Key, size: o.Size, lastModified: o.LastModified })) };
  }
};

async function streamToString(stream: Readable): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  return Buffer.concat(chunks).toString('utf-8');
}

export const s3GetText = {
  name: "aws.s3_get_text",
  description: "Get an S3 object as text.",
  inputSchema: z.object({
    bucket: z.string(),
    key: z.string()
  }),
  handler: async (input: any) => {
    const out = await s3.send(new GetObjectCommand({ Bucket: input.bucket, Key: input.key }));
    const body = await streamToString(out.Body as Readable);
    return { key: input.key, text: body };
  }
};

export const s3PutText = {
  name: "aws.s3_put_text",
  description: "Put a text object to S3.",
  inputSchema: z.object({
    bucket: z.string(),
    key: z.string(),
    text: z.string(),
    contentType: z.string().default("text/plain; charset=utf-8")
  }),
  handler: async (input: any) => {
    await s3.send(new PutObjectCommand({ Bucket: input.bucket, Key: input.key, Body: input.text, ContentType: input.contentType }));
    return { ok: true, bucket: input.bucket, key: input.key };
  }
};
```

### `src/tools/cloudwatch.ts`

```ts
import { z } from "@modelcontextprotocol/sdk/types";
import { cwl } from "../awsClients.js";
import { StartQueryCommand, GetQueryResultsCommand } from "@aws-sdk/client-cloudwatch-logs";

export const cwQuery = {
  name: "aws.cw_logs_query",
  description: "Run a CloudWatch Logs Insights query and wait for results (short windows).",
  inputSchema: z.object({
    logGroup: z.string(),
    query: z.string(),
    startMinutesAgo: z.number().int().min(1).max(1440).default(60)
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
```

### `src/tools/ecs.ts`

```ts
import { z } from "@modelcontextprotocol/sdk/types";
import { ecs } from "../awsClients.js";
import { ListTasksCommand, DescribeTasksCommand } from "@aws-sdk/client-ecs";

export const ecsListTasks = {
  name: "aws.ecs_list_tasks",
  description: "List and describe ECS tasks for a cluster/service.",
  inputSchema: z.object({
    cluster: z.string(),
    serviceName: z.string().optional()
  }),
  handler: async (input: any) => {
    const list = await ecs.send(new ListTasksCommand({
      cluster: input.cluster,
      serviceName: input.serviceName
    }));
    if (!list.taskArns || list.taskArns.length === 0) return { tasks: [] };
    const desc = await ecs.send(new DescribeTasksCommand({ cluster: input.cluster, tasks: list.taskArns }));
    return { tasks: (desc.tasks ?? []).map(t => ({ taskArn: t.taskArn, lastStatus: t.lastStatus, desiredStatus: t.desiredStatus, containers: t.containers })) };
  }
};
```

### `src/tools/ecr.ts`

```ts
import { z } from "@modelcontextprotocol/sdk/types";
import { ecr } from "../awsClients.js";
import { ListImagesCommand, DescribeImagesCommand } from "@aws-sdk/client-ecr";

export const ecrListImages = {
  name: "aws.ecr_list_images",
  description: "List ECR images and details.",
  inputSchema: z.object({
    repositoryName: z.string(),
    maxResults: z.number().int().min(1).max(1000).optional()
  }),
  handler: async (input: any) => {
    const list = await ecr.send(new ListImagesCommand({
      repositoryName: input.repositoryName,
      maxResults: input.maxResults ?? 100
    }));
    const imageIds = list.imageIds ?? [];
    if (imageIds.length === 0) return { images: [] };
    const desc = await ecr.send(new DescribeImagesCommand({ repositoryName: input.repositoryName, imageIds }));
    return { images: (desc.imageDetails ?? []).map(d => ({ imageTags: d.imageTags, imagePushedAt: d.imagePushedAt, size: d.imageSizeInBytes })) };
  }
};
```

### `src/tools/rdsdata.ts`

```ts
import { z } from "@modelcontextprotocol/sdk/types";
import { rdsdata } from "../awsClients.js";
import { ExecuteStatementCommand } from "@aws-sdk/client-rds-data";

export const rdsExecute = {
  name: "aws.rdsdata_execute",
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
```

### `src/tools/athena.ts`

```ts
import { z } from "@modelcontextprotocol/sdk/types";
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
```

### `src/tools/sts.ts`

```ts
import { z } from "@modelcontextprotocol/sdk/types";
import { sts } from "../awsClients.js";
import { AssumeRoleCommand } from "@aws-sdk/client-sts";

export const stsAssume = {
  name: "aws.sts_assume_role",
  description: "Assume an AWS IAM role and return temporary credentials (use cautiously).",
  inputSchema: z.object({
    roleArn: z.string().optional(),
    sessionName: z.string().default("mcp-session"),
    durationSeconds: z.number().int().min(900).max(43200).default(3600)
  }),
  handler: async (input: any) => {
    const roleArn = input.roleArn ?? process.env.MCP_AWS_DEFAULT_ROLE_ARN;
    if (!roleArn) return { error: "roleArn is required (no default configured)" };
    const r = await sts.send(new AssumeRoleCommand({
      RoleArn: roleArn,
      RoleSessionName: input.sessionName,
      DurationSeconds: input.durationSeconds
    }));
    return {
      accessKeyId: r.Credentials?.AccessKeyId,
      secretAccessKey: r.Credentials?.SecretAccessKey,
      sessionToken: r.Credentials?.SessionToken,
      expiration: r.Credentials?.Expiration
    };
  }
};
```

### `src/tools/cost.ts`

```ts
import { z } from "@modelcontextprotocol/sdk/types";
import { cost } from "../awsClients.js";
import { GetCostAndUsageCommand } from "@aws-sdk/client-cost-explorer";

export const ceGetCost = {
  name: "aws.cost_explorer_get_cost",
  description: "Get AWS cost by time range (USD).",
  inputSchema: z.object({
    start: z.string(), // YYYY-MM-DD
    end: z.string(),   // YYYY-MM-DD (exclusive)
    granularity: z.enum(["DAILY", "MONTHLY"]).default("DAILY"),
    metric: z.enum(["UnblendedCost", "AmortizedCost", "NetAmortizedCost", "NetUnblendedCost", "UsageQuantity"]).default("UnblendedCost")
  }),
  handler: async (input: any) => {
    const r = await cost.send(new GetCostAndUsageCommand({
      TimePeriod: { Start: input.start, End: input.end },
      Granularity: input.granularity,
      Metrics: [input.metric]
    }));
    return {
      results: (r.ResultsByTime ?? []).map(b => ({
        timeStart: b.TimePeriod?.Start,
        amount: b.Total?.[input.metric]?.Amount,
        unit: b.Total?.[input.metric]?.Unit
      }))
    };
  }
};
```

---

# 7) `src/index.ts` (đăng ký server MCP + tools)

```ts
import 'dotenv/config';
import { Server } from "@modelcontextprotocol/sdk/server";
import { z } from "@modelcontextprotocol/sdk/types";

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
```

---

# 8) Cấu hình trong **Cursor** (`.cursor/mcp.json`)

```json
{
  "servers": {
    "aws": {
      "command": "node",
      "args": ["dist/index.js"],
      "env": {
        "AWS_REGION": "ap-northeast-1",
        "MCP_ATHENA_TIMEOUT_MS": "60000",
        "MCP_CW_TIMEOUT_MS": "45000"
      },
      "workingDirectory": "/absolute/path/to/mcp-aws"
    }
  }
}
```

> Dùng `npm run build` trước; hoặc với dev: `"command": "npm", "args": ["run", "dev"]`.

---

# 9) Cách dùng nhanh trong Cursor

* Mở Command Palette → **Add MCP server** (hoặc để Cursor tự đọc `.cursor/mcp.json`).
* Trong chat/Composer, gọi tool theo tên:

  * `aws.s3_list` → liệt kê object:

    ```json
    {"bucket":"my-bucket","prefix":"logs/","maxKeys":50}
    ```
  * `aws.cw_logs_query` → query Logs Insights:

    ```json
    {"logGroup":"/ecs/logs/minodebatch-cluster-stg","query":"fields @timestamp, @message | sort @timestamp desc | limit 20","startMinutesAgo":120}
    ```
  * `aws.ecs_list_tasks`:

    ```json
    {"cluster":"minodebatch-cluster","serviceName":"carsensor_stock_summary"}
    ```
  * `aws.ecr_list_images`:

    ```json
    {"repositoryName":"minodebatch-stg"}
    ```
  * `aws.rdsdata_execute` (Aurora Serverless v2 Data API):

    ```json
    {"resourceArn":"arn:aws:rds:ap-northeast-1:123:cluster:mi-test-2","secretArn":"arn:aws:secretsmanager:ap-northeast-1:123:secret:db-cred","sql":"SELECT 1"}
    ```
  * `aws.athena_query`:

    ```json
    {"database":"logs_db","workgroup":"primary","sql":"SELECT * FROM cloudtrail_logs LIMIT 10"}
    ```
  * `aws.sts_assume_role`:

    ```json
    {"roleArn":"arn:aws:iam::123:role/DevOpsReadOnly","sessionName":"cursor-review","durationSeconds":3600}
    ```
  * `aws.cost_explorer_get_cost`:

    ```json
    {"start":"2025-08-01","end":"2025-09-01","granularity":"DAILY","metric":"UnblendedCost"}
    ```

Bạn có thể gán alias trong Cursor để gọi nhanh (ví dụ `/ecr images minodebatch-stg` → map sang `aws.ecr_list_images`).

---

# 10) Quyền IAM (tối thiểu & tách theo tool)

Tạo **IAM policy chỉ-đọc** theo nhu cầu, rồi gán vào role/profile chạy MCP server:

* S3 (read/write nếu cần put):

  * `s3:ListBucket`, `s3:GetObject` (+ `s3:PutObject` nếu dùng `aws.s3_put_text`) cho đúng bucket/prefix.
* CloudWatch Logs:

  * `logs:StartQuery`, `logs:GetQueryResults`, `logs:StopQuery`, `logs:DescribeLogGroups`.
* ECS/ECR:

  * `ecs:ListTasks`, `ecs:DescribeTasks`, `ecs:DescribeClusters`, `ecs:DescribeServices`
  * `ecr:ListImages`, `ecr:DescribeImages`, `ecr:DescribeRepositories`
* RDS Data API:

  * `rds-data:ExecuteStatement`, `rds-data:BatchExecuteStatement`
  * Quyền `secretsmanager:GetSecretValue` cho secret DB.
* Athena:

  * `athena:StartQueryExecution`, `athena:GetQueryExecution`, `athena:GetQueryResults`
  * `s3:*` đọc/ghi cho query result bucket (nếu workgroup yêu cầu).
* STS:

  * `sts:AssumeRole` (và trust policy ở role đích cho phép principal chạy MCP assume).
* Cost Explorer:

  * `ce:GetCostAndUsage`

> **Nguyên tắc**: least-privilege, scoping theo ARN/bucket/prefix. Tách policy theo từng tool để bật/tắt dễ.

---

# 11) Lưu ý vận hành & bảo mật

* **Không trả credentials lâu sống** cho model: `aws.sts_assume_role` chỉ dùng khi thực sự cần, và chỉ hiển thị thời gian sống ngắn. Tốt nhất dùng **task role / instance profile**.
* Thiết lập **timeouts** cho Athena/CloudWatch để tránh chờ dài.
* Với query lớn (Athena), hãy dùng `LIMIT`, hoặc để `workgroup` áp quota nghiêm.
* Nhật ký (logging) của server MCP: tránh log dữ liệu nhạy cảm (SQL/keys).
* Có thể thêm **rate-limit** và **allowlist** tham số (ví dụ giới hạn logGroup, bucket cho repo/proj của bạn).

---

# 12) Tích hợp Prompt đặc thù (tự động “gợi ý tool”)

Bạn có thể tạo `.github/prompts/aws-ops.md` để hướng model **ưu tiên dùng tools** này khi debug:

```md
# AWS Ops Helper (for Cursor + MCP)

- When user mentions ECS, ECR, CloudWatch, RDS, Athena, prefer invoking MCP tools:
  - aws.cw_logs_query for errors within last 120m
  - aws.ecs_list_tasks to see task statuses
  - aws.ecr_list_images to inspect pushed tags
  - aws.rdsdata_execute for quick SQL checks (read-only)
  - aws.athena_query for S3 logs/CloudTrail tables
- Always include `LIMIT` in queries.
- Never print credentials or secrets.
```

Trong Cursor, map alias `/awsops` → chèn prompt này trước khi đề xuất gọi tools.

---

Nếu bạn muốn, mình có thể **bổ sung tool “EventBridge schedule check”, “Route53 DNS lookup”, hoặc “CloudWatch Metric Get”** theo đúng use case của bạn (ECS batch, NAT cost, Aurora v2 ACUs, v.v.).
