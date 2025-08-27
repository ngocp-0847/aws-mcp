import { z } from "zod";
import { cw, rds, pi } from "../awsClients.js";
import { GetMetricStatisticsCommand } from "@aws-sdk/client-cloudwatch";
import { DescribeDBInstancesCommand } from "@aws-sdk/client-rds";
import { 
  GetResourceMetricsCommand, 
  DescribeDimensionKeysCommand,
  GetDimensionKeyDetailsCommand 
} from "@aws-sdk/client-pi";

export const rdsGetCpuMetrics = {
  name: "aws_rds_get_cpu_metrics",
  description: "Get CPU utilization metrics for RDS instance by name. Monitor database performance over time with detailed CPU statistics (avg/max/min percentages). Essential for performance monitoring and capacity planning. Only requires dbInstanceIdentifier - other parameters optional.",
  inputSchema: z.object({
    dbInstanceIdentifier: z.string().describe("RDS DB instance identifier/name (required) - exact name like 'mi-test-2', 'prod-mysql-01'"),
    startMinutesAgo: z.number().int().min(1).max(1440).default(60).describe("How many minutes ago to start collecting data (optional, default: 60 = last hour)"),
    endMinutesAgo: z.number().int().min(0).max(1439).default(0).describe("How many minutes ago to end data collection (optional, default: 0 = now)"),
    periodMinutes: z.number().int().min(1).max(1440).default(5).describe("Data point interval in minutes (optional, default: 5 = every 5 minutes)")
  }),
  handler: async (input: any) => {
    const now = new Date();
    const endTime = new Date(now.getTime() - (input.endMinutesAgo || 0) * 60 * 1000);
    const startTime = new Date(now.getTime() - input.startMinutesAgo * 60 * 1000);
    
    // First, get the DB instance to validate it exists
    try {
      const describeRes = await rds.send(new DescribeDBInstancesCommand({
        DBInstanceIdentifier: input.dbInstanceIdentifier
      }));
      
      if (!describeRes.DBInstances || describeRes.DBInstances.length === 0) {
        return { error: `DB instance ${input.dbInstanceIdentifier} not found` };
      }
      
      const dbInstance = describeRes.DBInstances[0];
      
      // Get CPU utilization metrics from CloudWatch
      const metricsRes = await cw.send(new GetMetricStatisticsCommand({
        Namespace: "AWS/RDS",
        MetricName: "CPUUtilization",
        Dimensions: [{
          Name: "DBInstanceIdentifier",
          Value: input.dbInstanceIdentifier
        }],
        StartTime: startTime,
        EndTime: endTime,
        Period: input.periodMinutes * 60,
        Statistics: ["Average", "Maximum", "Minimum"]
      }));
      
      const dataPoints = (metricsRes.Datapoints || [])
        .sort((a, b) => (a.Timestamp?.getTime() || 0) - (b.Timestamp?.getTime() || 0))
        .map(dp => ({
          timestamp: dp.Timestamp?.toISOString(),
          average: dp.Average,
          maximum: dp.Maximum,
          minimum: dp.Minimum,
          unit: dp.Unit
        }));
      
      return {
        dbInstanceIdentifier: input.dbInstanceIdentifier,
        dbInstanceClass: dbInstance.DBInstanceClass,
        engine: dbInstance.Engine,
        engineVersion: dbInstance.EngineVersion,
        dbInstanceStatus: dbInstance.DBInstanceStatus,
        cpuMetrics: {
          startTime: startTime.toISOString(),
          endTime: endTime.toISOString(),
          periodMinutes: input.periodMinutes,
          dataPoints: dataPoints
        }
      };
      
    } catch (error: any) {
      return { 
        error: `Failed to get CPU metrics for ${input.dbInstanceIdentifier}: ${error.message}` 
      };
    }
  }
};

export const rdsGetTopSql = {
  name: "aws_rds_performance_insights_top_sql",
  description: "Get top slow SQL queries ranked by database load (AAS - Average Active Sessions) from RDS Performance Insights. Identifies resource-intensive queries causing performance issues. Shows actual SQL statements with load metrics. Only requires dbInstanceIdentifier. Optional: filter by CPU/IO/Lock, adjust time range, limit results. Requires Performance Insights enabled on RDS instance.",
  inputSchema: z.object({
    dbInstanceIdentifier: z.string().describe("RDS DB instance identifier/name (required) - exact name like 'mi-test-2', 'prod-mysql-01'"),
    startMinutesAgo: z.number().int().min(5).max(10080).default(60).describe("How many minutes ago to start analysis (optional, default: 60 = last hour, min: 5, max: 10080 = 7 days)"),
    endMinutesAgo: z.number().int().min(1).max(10079).default(5).describe("How many minutes ago to end analysis (optional, default: 5 = 5 minutes ago, min: 1 for data availability)"),
    maxItems: z.number().int().min(1).max(100).default(10).describe("Maximum number of top SQL queries to return (optional, default: 10, max: 100)"),
    filterType: z.enum(["CPU", "IO", "Lock", "All"]).default("All").describe("Filter by wait event type (optional, default: All) - CPU: CPU-bound queries, IO: I/O-bound, Lock: lock-related, All: all types")
  }),
  handler: async (input: any) => {
    const now = new Date();
    const endTime = new Date(now.getTime() - (input.endMinutesAgo || 0) * 60 * 1000);
    const startTime = new Date(now.getTime() - input.startMinutesAgo * 60 * 1000);
    
    // Performance Insights requires start time to be at least 5 minutes ago
    // and end time to be at least 1 minute ago for data to be available
    const minStartTime = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000); // 7 days ago max
    const maxEndTime = new Date(now.getTime() - 60 * 1000); // at least 1 minute ago
    
    if (startTime < minStartTime) {
      return { error: "Start time cannot be more than 7 days ago" };
    }
    
    if (endTime > maxEndTime) {
      return { error: "End time must be at least 1 minute ago" };
    }
    
    try {
      // First, get the DB instance to get the resource ID for Performance Insights
      const describeRes = await rds.send(new DescribeDBInstancesCommand({
        DBInstanceIdentifier: input.dbInstanceIdentifier
      }));
      
      if (!describeRes.DBInstances || describeRes.DBInstances.length === 0) {
        return { error: `DB instance ${input.dbInstanceIdentifier} not found` };
      }
      
      const dbInstance = describeRes.DBInstances[0];
      const resourceId = dbInstance.DbiResourceId;
      
      if (!resourceId) {
        return { error: `Resource ID not found for DB instance ${input.dbInstanceIdentifier}` };
      }
      
      // Build filter for wait event type if not "All"
      const filterObj = input.filterType !== "All" ? { "db.wait_event.type": input.filterType } : undefined;
      
      // 1) Get top SQL keys by DB load (AAS) using DescribeDimensionKeysCommand
      const describeDimensionKeysCmd = new DescribeDimensionKeysCommand({
        ServiceType: "RDS",
        Identifier: resourceId,
        StartTime: startTime,
        EndTime: endTime,
        Metric: "db.load.avg", // core PI metric (AAS - Average Active Sessions)
        GroupBy: { Group: "db.sql", Limit: input.maxItems },
        ...(filterObj ? { Filter: filterObj } : {}),
      });

      const describeKeysRes = await pi.send(describeDimensionKeysCmd);

      // Each "Key" has Dimensions like db.sql.id and a metric "Total"
      const keys = (describeKeysRes.Keys ?? [])
        .map(k => ({
          sqlId: k.Dimensions?.["db.sql.id"] || k.Dimensions?.["db.sql.tokenized_id"],
          totalLoad: k.Total ?? 0,
        }))
        .filter(k => !!k.sqlId);

      // 2) For each key, pull the full SQL text
      const results = [];
      for (const k of keys) {
        try {
          const getSqlCmd = new GetDimensionKeyDetailsCommand({
            ServiceType: "RDS",
            Identifier: resourceId,
            Group: "db.sql",
            GroupIdentifier: k.sqlId!,
            RequestedDimensions: ["statement"], // returns db.sql.statement
          });

          const details = await pi.send(getSqlCmd);
          const statement = details.Dimensions?.find(
            d => d.Dimension === "db.sql.statement"
          )?.Value;

          results.push({
            rank: results.length + 1,
            sqlId: k.sqlId,
            totalLoadAAS: k.totalLoad, // sum of db.load.avg over the window
            statement: statement ?? "(statement unavailable or truncated)",
          });
        } catch (error) {
          // If we can't get statement details, still include the SQL ID
          results.push({
            rank: results.length + 1,
            sqlId: k.sqlId,
            totalLoadAAS: k.totalLoad,
            statement: `(error retrieving statement: ${error})`,
          });
        }
      }

      // Sort descending by load just in case service returns unordered
      results.sort((a, b) => b.totalLoadAAS - a.totalLoadAAS);

      return {
        dbInstanceIdentifier: input.dbInstanceIdentifier,
        resourceId: resourceId,
        engine: dbInstance.Engine,
        engineVersion: dbInstance.EngineVersion,
        timeRange: {
          startTime: startTime.toISOString(),
          endTime: endTime.toISOString()
        },
        filterType: input.filterType,
        totalQueries: results.length,
        topSqlQueries: results
      };
      
    } catch (error: any) {
      return { 
        error: `Failed to get top SQL for ${input.dbInstanceIdentifier}: ${error.message}` 
      };
    }
  }
};
