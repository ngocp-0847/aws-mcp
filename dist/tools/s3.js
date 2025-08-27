import { z } from "zod";
import { s3 } from "../awsClients.js";
import { ListObjectsV2Command, GetObjectCommand, PutObjectCommand, ListBucketsCommand } from "@aws-sdk/client-s3";
export const s3ListBuckets = {
    name: "aws_s3_list_buckets",
    description: "List all S3 buckets in the account.",
    inputSchema: z.object({}),
    handler: async (input) => {
        const out = await s3.send(new ListBucketsCommand({}));
        return {
            buckets: (out.Buckets ?? []).map(bucket => ({
                name: bucket.Name,
                creationDate: bucket.CreationDate
            }))
        };
    }
};
export const s3List = {
    name: "aws_s3_list",
    description: "List objects in S3 (bucket/prefix).",
    inputSchema: z.object({
        bucket: z.string(),
        prefix: z.string().optional(),
        maxKeys: z.number().int().min(1).max(1000).optional()
    }),
    handler: async (input) => {
        const out = await s3.send(new ListObjectsV2Command({
            Bucket: input.bucket,
            Prefix: input.prefix,
            MaxKeys: input.maxKeys ?? 100
        }));
        return { objects: (out.Contents ?? []).map(o => ({ key: o.Key, size: o.Size, lastModified: o.LastModified })) };
    }
};
async function streamToString(stream) {
    const chunks = [];
    for await (const chunk of stream)
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    return Buffer.concat(chunks).toString('utf-8');
}
export const s3GetText = {
    name: "aws_s3_get_text",
    description: "Get an S3 object as text.",
    inputSchema: z.object({
        bucket: z.string(),
        key: z.string()
    }),
    handler: async (input) => {
        const out = await s3.send(new GetObjectCommand({ Bucket: input.bucket, Key: input.key }));
        const body = await streamToString(out.Body);
        return { key: input.key, text: body };
    }
};
export const s3PutText = {
    name: "aws_s3_put_text",
    description: "Put a text object to S3.",
    inputSchema: z.object({
        bucket: z.string(),
        key: z.string(),
        text: z.string(),
        contentType: z.string().default("text/plain; charset=utf-8")
    }),
    handler: async (input) => {
        await s3.send(new PutObjectCommand({ Bucket: input.bucket, Key: input.key, Body: input.text, ContentType: input.contentType }));
        return { ok: true, bucket: input.bucket, key: input.key };
    }
};
