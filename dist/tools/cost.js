import { z } from "zod";
import { cost } from "../awsClients.js";
import { GetCostAndUsageCommand } from "@aws-sdk/client-cost-explorer";
import { createParameterPrompts } from "../parameterHandler.js";
const ceGetCostSchema = z.object({
    start: z.string(), // YYYY-MM-DD
    end: z.string(), // YYYY-MM-DD (exclusive)
    granularity: z.enum(["DAILY", "MONTHLY"]).default("DAILY"),
    metric: z.enum(["UnblendedCost", "AmortizedCost", "NetAmortizedCost", "NetUnblendedCost", "UsageQuantity"]).default("UnblendedCost")
});
export const ceGetCost = {
    name: "aws_cost_explorer_get_cost",
    description: "Get AWS cost by time range (USD).",
    inputSchema: ceGetCostSchema,
    parameterPrompts: createParameterPrompts(ceGetCostSchema, {
        start: {
            description: "Start date (required) - format YYYY-MM-DD, inclusive",
            examples: ["2024-01-01", "2024-08-01", "2024-08-25"]
        },
        end: {
            description: "End date (required) - format YYYY-MM-DD, exclusive (not included in results)",
            examples: ["2024-01-31", "2024-08-31", "2024-08-27"]
        },
        granularity: {
            description: "Time granularity (optional)",
            validation: { options: ["DAILY", "MONTHLY"] },
            defaultValue: "DAILY",
            examples: ["DAILY", "MONTHLY"]
        },
        metric: {
            description: "Cost metric type (optional)",
            validation: { options: ["UnblendedCost", "AmortizedCost", "NetAmortizedCost", "NetUnblendedCost", "UsageQuantity"] },
            defaultValue: "UnblendedCost",
            examples: ["UnblendedCost", "AmortizedCost", "UsageQuantity"]
        }
    }),
    handler: async (input) => {
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
