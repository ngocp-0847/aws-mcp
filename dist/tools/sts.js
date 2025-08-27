import { z } from "zod";
import { sts } from "../awsClients.js";
import { AssumeRoleCommand } from "@aws-sdk/client-sts";
import { createParameterPrompts } from "../parameterHandler.js";
const stsAssumeSchema = z.object({
    roleArn: z.string().optional(),
    sessionName: z.string().default("mcp-session"),
    durationSeconds: z.number().int().min(900).max(43200).default(3600)
});
export const stsAssume = {
    name: "aws_sts_assume_role",
    description: "Assume an AWS IAM role and return temporary credentials (use cautiously).",
    inputSchema: stsAssumeSchema,
    parameterPrompts: createParameterPrompts(stsAssumeSchema, {
        roleArn: {
            description: "IAM role ARN to assume (optional if MCP_AWS_DEFAULT_ROLE_ARN is set)",
            examples: [
                "arn:aws:iam::123456789012:role/MyRole",
                "arn:aws:iam::123456789012:role/CrossAccountAccessRole"
            ]
        },
        sessionName: {
            description: "Session name for the assumed role (optional)",
            defaultValue: "mcp-session",
            examples: ["mcp-session", "admin-session", "read-only-session"]
        },
        durationSeconds: {
            description: "Session duration in seconds (optional, 900-43200 seconds = 15min-12hrs)",
            validation: { min: 900, max: 43200 },
            defaultValue: 3600,
            examples: ["3600", "7200", "14400", "43200"]
        }
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
