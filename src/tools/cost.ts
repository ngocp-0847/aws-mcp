import { z } from "zod";
import { cost } from "../awsClients.js";
import { GetCostAndUsageCommand } from "@aws-sdk/client-cost-explorer";

export const ceGetCost = {
  name: "aws_cost_explorer_get_cost",
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
