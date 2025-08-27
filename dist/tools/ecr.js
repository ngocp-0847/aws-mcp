import { z } from "zod";
import { ecr } from "../awsClients.js";
import { ListImagesCommand, DescribeImagesCommand } from "@aws-sdk/client-ecr";
import { createParameterPrompts } from "../parameterHandler.js";
const ecrListImagesSchema = z.object({
    repositoryName: z.string(),
    maxResults: z.number().int().min(1).max(1000).optional()
});
export const ecrListImages = {
    name: "aws_ecr_list_images",
    description: "List ECR images and details.",
    inputSchema: ecrListImagesSchema,
    parameterPrompts: createParameterPrompts(ecrListImagesSchema, {
        repositoryName: {
            description: "ECR repository name (required) - exact repository name",
            examples: ["my-app", "backend-service", "frontend", "api-gateway"]
        },
        maxResults: {
            description: "Maximum number of images to return (optional, 1-1000)",
            validation: { min: 1, max: 1000 },
            defaultValue: 100,
            examples: ["10", "50", "100", "500"]
        }
    }),
    handler: async (input) => {
        const list = await ecr.send(new ListImagesCommand({
            repositoryName: input.repositoryName,
            maxResults: input.maxResults ?? 100
        }));
        const imageIds = list.imageIds ?? [];
        if (imageIds.length === 0)
            return { images: [] };
        const desc = await ecr.send(new DescribeImagesCommand({ repositoryName: input.repositoryName, imageIds }));
        return { images: (desc.imageDetails ?? []).map(d => ({ imageTags: d.imageTags, imagePushedAt: d.imagePushedAt, size: d.imageSizeInBytes })) };
    }
};
