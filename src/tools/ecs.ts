import { z } from "zod";
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
