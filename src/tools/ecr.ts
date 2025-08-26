import { z } from "zod";
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
