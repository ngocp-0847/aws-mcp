import { z } from "zod";
import { ecs } from "../awsClients.js";
import { ListTasksCommand, DescribeTasksCommand } from "@aws-sdk/client-ecs";
import { createParameterPrompts } from "../parameterHandler.js";
const ecsListTasksSchema = z.object({
    cluster: z.string(),
    serviceName: z.string().optional()
});
export const ecsListTasks = {
    name: "aws_ecs_list_tasks",
    description: "List and describe ECS tasks for a cluster/service.",
    inputSchema: ecsListTasksSchema,
    parameterPrompts: createParameterPrompts(ecsListTasksSchema, {
        cluster: {
            description: "ECS cluster name (required) - name or ARN of the cluster",
            examples: ["default", "my-cluster", "prod-cluster", "arn:aws:ecs:region:account:cluster/my-cluster"]
        },
        serviceName: {
            description: "ECS service name (optional) - filter tasks by service name",
            examples: ["web-service", "api-service", "worker-service"]
        }
    }),
    handler: async (input) => {
        const list = await ecs.send(new ListTasksCommand({
            cluster: input.cluster,
            serviceName: input.serviceName
        }));
        if (!list.taskArns || list.taskArns.length === 0)
            return { tasks: [] };
        const desc = await ecs.send(new DescribeTasksCommand({ cluster: input.cluster, tasks: list.taskArns }));
        return { tasks: (desc.tasks ?? []).map(t => ({ taskArn: t.taskArn, lastStatus: t.lastStatus, desiredStatus: t.desiredStatus, containers: t.containers })) };
    }
};
