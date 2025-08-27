# RDS Monitoring Tools

This document describes the AWS RDS monitoring tools for performance analysis and troubleshooting.

## 1. aws_rds_get_cpu_metrics

**Purpose**: Monitor RDS instance CPU utilization over time with detailed statistics.

**Description**: Retrieves CPU utilization metrics from CloudWatch for any RDS instance. Returns time-series data with average, maximum, and minimum CPU usage percentages. Essential for performance monitoring and capacity planning.

**Required Parameters**:
- `dbInstanceIdentifier` (string): The exact RDS DB instance identifier/name (e.g., "mi-test-2", "prod-mysql-01")

**Optional Parameters**:
- `startMinutesAgo` (number, 1-1440, default: 60): How many minutes back to start collecting data
- `endMinutesAgo` (number, 0-1439, default: 0): How many minutes back to end data collection (0 = now)
- `periodMinutes` (number, 1-1440, default: 5): Data point interval in minutes (5 = one data point every 5 minutes)

**Quick Usage Examples**:
- Basic CPU check (last hour): `{"dbInstanceIdentifier": "mi-test-2"}`
- Last 2 hours with 10-min intervals: `{"dbInstanceIdentifier": "mi-test-2", "startMinutesAgo": 120, "periodMinutes": 10}`
- Last 24 hours: `{"dbInstanceIdentifier": "mi-test-2", "startMinutesAgo": 1440}`

**Response Format**:
Returns instance details + time-series CPU data with average/max/min percentages per time interval.

**Response**:
```json
{
  "dbInstanceIdentifier": "my-rds-instance",
  "dbInstanceClass": "db.t3.micro",
  "engine": "mysql",
  "engineVersion": "8.0.35",
  "dbInstanceStatus": "available",
  "cpuMetrics": {
    "startTime": "2025-08-27T02:45:22.000Z",
    "endTime": "2025-08-27T04:45:22.000Z",
    "periodMinutes": 5,
    "dataPoints": [
      {
        "timestamp": "2025-08-27T02:45:00.000Z",
        "average": 15.5,
        "maximum": 20.1,
        "minimum": 12.3,
        "unit": "Percent"
      }
    ]
  }
}
```

## 2. aws_rds_performance_insights_top_sql

**Purpose**: Identify slow/resource-intensive SQL queries causing performance issues.

**Description**: Uses AWS Performance Insights to find top SQL queries ranked by database load (Average Active Sessions). Shows actual SQL statements with their resource consumption. Critical for database performance troubleshooting and optimization.

**Required Parameters**:
- `dbInstanceIdentifier` (string): The exact RDS DB instance identifier/name (e.g., "mi-test-2", "prod-mysql-01")

**Optional Parameters**:
- `startMinutesAgo` (number, 5-10080, default: 60): How many minutes back to analyze (minimum 5 minutes, maximum 7 days)
- `endMinutesAgo` (number, 1-10079, default: 5): How many minutes back to end analysis (minimum 1 minute ago for data availability)
- `maxItems` (number, 1-100, default: 10): Maximum number of top SQL queries to return
- `filterType` (string, default: "All"): Filter by wait event type
  - "CPU": Only CPU-bound queries
  - "IO": Only I/O-bound queries  
  - "Lock": Only lock-related queries
  - "All": All query types

**Quick Usage Examples**:
- Find top slow queries (last hour): `{"dbInstanceIdentifier": "mi-test-2"}`
- Top 5 CPU-intensive queries (last 2 hours): `{"dbInstanceIdentifier": "mi-test-2", "startMinutesAgo": 120, "maxItems": 5, "filterType": "CPU"}`
- I/O-heavy queries (last 6 hours): `{"dbInstanceIdentifier": "mi-test-2", "startMinutesAgo": 360, "filterType": "IO"}`

**Response Format**:
Returns ranked list of SQL queries with:
- Full SQL statement text
- Database load impact (AAS - Average Active Sessions)
- SQL ID for tracking
- Ranking by resource consumption

**Important Notes**:
- Requires Performance Insights enabled on RDS instance
- Data must be at least 1 minute old (AWS limitation)
- Higher AAS values indicate more resource-intensive queries

**Response**:
```json
{
  "dbInstanceIdentifier": "mi-test-2",
  "resourceId": "db-CSTFCXEJSA546YPCCLGNQIIADY",
  "engine": "aurora-mysql",
  "engineVersion": "8.0.mysql_aurora.3.08.2",
  "timeRange": {
    "startTime": "2025-08-27T05:05:17.530Z",
    "endTime": "2025-08-27T06:00:17.530Z"
  },
  "filterType": "All",
  "totalQueries": 1,
  "topSqlQueries": [
    {
      "rank": 1,
      "sqlId": "F7CD6FAEB92CFB5A67FAFFFAE14D1315196BC2C1",
      "totalLoadAAS": 0.0005952380952380953,
      "statement": "SELECT count(*) as aliveStockCount\nFROM carTrade.carsensor_stock cs\njoin marketInteligence.group_rel_shopcode grs on grs.cs_shopid = cs.shopid\nWHERE LastPublished >= '2025-04-01'\nand startPublished <= '2025-04-01'\nand grs.group_id = '26'"
    }
  ]
}
```

## Prerequisites & Setup

**AWS Credentials**: Configure AWS credentials via AWS CLI, environment variables, or IAM roles.

**Required IAM Permissions**:
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "rds:DescribeDBInstances",
        "cloudwatch:GetMetricStatistics",
        "pi:DescribeDimensionKeys",
        "pi:GetDimensionKeyDetails"
      ],
      "Resource": "*"
    }
  ]
}
```

**Performance Insights**: Must be enabled on RDS instance for `aws_rds_performance_insights_top_sql` tool.

## Common Use Cases

### Performance Troubleshooting Workflow:
1. **Check CPU trends**: Use `aws_rds_get_cpu_metrics` to identify high CPU periods
2. **Find slow queries**: Use `aws_rds_performance_insights_top_sql` during high CPU periods
3. **Analyze by type**: Filter by "CPU", "IO", or "Lock" to identify bottleneck type

### AI Assistant Quick Commands:
- "Get CPU metrics for mi-test-2" → Use `aws_rds_get_cpu_metrics` with just `dbInstanceIdentifier`
- "Find slow SQL on mi-test-2" → Use `aws_rds_performance_insights_top_sql` with just `dbInstanceIdentifier`  
- "Show top 5 CPU-heavy queries last 2 hours" → Add `maxItems: 5`, `startMinutesAgo: 120`, `filterType: "CPU"`

## Error Handling & Troubleshooting

**Common Errors**:
- `DB instance [name] not found` → Check instance identifier spelling
- `Performance Insights not enabled` → Enable PI in RDS console  
- `Start time cannot be more than 7 days ago` → Reduce `startMinutesAgo` value
- `End time must be at least 1 minute ago` → Increase `endMinutesAgo` to minimum 1

**Best Practices**:
- Start with default parameters for quick checks
- Use shorter time ranges (60-120 minutes) for faster responses
- Filter by event type ("CPU", "IO", "Lock") when investigating specific issues
- Check CPU metrics first, then drill down with Performance Insights

## Tool Comparison

| Use Case | Tool | Key Parameters |
|----------|------|----------------|
| Monitor CPU trends | `aws_rds_get_cpu_metrics` | `dbInstanceIdentifier` only |
| Find slow queries | `aws_rds_performance_insights_top_sql` | `dbInstanceIdentifier` + `filterType` |
| Investigate CPU spikes | Both tools | Same time range parameters |
| Capacity planning | `aws_rds_get_cpu_metrics` | Longer `startMinutesAgo` (1440 for 24h) |
