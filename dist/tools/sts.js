import { z } from "zod";
import { sts } from "../awsClients.js";
import { AssumeRoleCommand } from "@aws-sdk/client-sts";
export const stsAssume = {
    name: "aws_sts_assume_role",
    description: "Assume an AWS IAM role and return temporary credentials (use cautiously).",
    inputSchema: z.object({
        roleArn: z.string().optional(),
        sessionName: z.string().default("mcp-session"),
        durationSeconds: z.number().int().min(900).max(43200).default(3600)
    }),
    handler: async (input) => {
        const roleArn = input.roleArn ?? process.env.MCP_AWS_DEFAULT_ROLE_ARN;
        if (!roleArn)
            return { error: "roleArn is required (no default configured)" };
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
