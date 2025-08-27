# MCP AWS Server

A Model Context Protocol server for AWS services, providing tools for S3, CloudWatch Logs, ECS, ECR, RDS Data API, Athena, STS, and Cost Explorer.

## Setup

1. Install dependencies:
```bash
npm install
```

2. Configure environment:
```bash
cp .env.example .env
# Edit .env with your AWS configuration
```

3. Build the server:
```bash
npm run build
```

4. Run the server:
```bash
npm start
```

## Configuration

Set the following environment variables in `.env`:

- `AWS_REGION`: AWS region (default: ap-northeast-1)
- `AWS_ACCESS_KEY_ID`: AWS access key (optional if using IAM roles)
- `AWS_SECRET_ACCESS_KEY`: AWS secret key (optional if using IAM roles)
- `MCP_AWS_DEFAULT_ROLE_ARN`: Default role ARN for STS assume role
- `MCP_ATHENA_TIMEOUT_MS`: Athena query timeout (default: 60000)
- `MCP_CW_TIMEOUT_MS`: CloudWatch Logs timeout (default: 45000)

## Available Tools

### S3
- `aws.s3_list`: List objects in S3 bucket
- `aws.s3_get_text`: Get S3 object as text
- `aws.s3_put_text`: Put text object to S3

### CloudWatch Logs
- `aws.cw_logs_query`: Run CloudWatch Logs Insights query

### ECS
- `aws.ecs_list_tasks`: List and describe ECS tasks

### ECR
- `aws.ecr_list_images`: List ECR images and details

### RDS Data API
- `aws.rdsdata_execute`: Execute SQL via RDS Data API

### RDS Monitoring
- `aws.rds_get_cpu_metrics`: Get CPU utilization metrics for RDS instance
- `aws.rds_performance_insights_top_sql`: Get top SQL queries from Performance Insights

### Athena
- `aws.athena_query`: Run Athena query

### STS
- `aws.sts_assume_role`: Assume IAM role

### Cost Explorer
- `aws.cost_explorer_get_cost`: Get AWS costs

## Usage in Cursor

Add to `.cursor/mcp.json`:

```json
{
  "servers": {
    "aws": {
      "command": "node",
      "args": ["dist/index.js"],
      "env": {
        "AWS_REGION": "ap-northeast-1"
      },
      "workingDirectory": "/path/to/mcp-aws"
    }
  }
}
```

## IAM Permissions

Ensure your AWS credentials have the necessary permissions for the tools you plan to use. See the guide for detailed permission requirements.
