import { z } from "zod";
import { s3 } from "../awsClients.js";
import { ListObjectsV2Command, GetObjectCommand, PutObjectCommand, ListBucketsCommand } from "@aws-sdk/client-s3";
import { Readable } from "node:stream";
import { createParameterPrompts, ParameterPrompt } from "../parameterHandler.js";

export const s3ListBuckets = {
  name: "aws_s3_list_buckets",
  description: "List all S3 buckets in the account.",
  inputSchema: z.object({}),
  parameterPrompts: [] as ParameterPrompt[],
  handler: async (input: any) => {
    const out = await s3.send(new ListBucketsCommand({}));
    return { 
      buckets: (out.Buckets ?? []).map(bucket => ({ 
        name: bucket.Name, 
        creationDate: bucket.CreationDate 
      })) 
    };
  }
};

const s3ListSchema = z.object({
  bucket: z.string(),
  prefix: z.string().optional(),
  maxKeys: z.number().int().min(1).max(1000).optional()
});

export const s3List = {
  name: "aws_s3_list",
  description: "List objects in S3 (bucket/prefix).",
  inputSchema: s3ListSchema,
  parameterPrompts: createParameterPrompts(s3ListSchema, {
    bucket: {
      description: "S3 bucket name (required) - exact bucket name like 'my-app-bucket', 'data-lake-prod'",
      examples: ["my-app-bucket", "data-lake-prod", "backup-storage"]
    },
    prefix: {
      description: "Object prefix to filter results (optional) - like 'logs/', 'uploads/2024/', or 'data/users/'",
      examples: ["logs/", "uploads/2024/", "data/users/", "backups/daily/"]
    },
    maxKeys: {
      description: "Maximum number of objects to return (optional, 1-1000)",
      validation: { min: 1, max: 1000 },
      defaultValue: 100
    }
  }),
  handler: async (input: any) => {
    const out = await s3.send(new ListObjectsV2Command({
      Bucket: input.bucket,
      Prefix: input.prefix,
      MaxKeys: input.maxKeys ?? 100
    }));
    return { objects: (out.Contents ?? []).map(o => ({ key: o.Key, size: o.Size, lastModified: o.LastModified })) };
  }
};

async function streamToString(stream: Readable): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  return Buffer.concat(chunks).toString('utf-8');
}

const s3GetTextSchema = z.object({
  bucket: z.string(),
  key: z.string()
});

export const s3GetText = {
  name: "aws_s3_get_text",
  description: "Get an S3 object as text.",
  inputSchema: s3GetTextSchema,
  parameterPrompts: createParameterPrompts(s3GetTextSchema, {
    bucket: {
      description: "S3 bucket name (required) - exact bucket name containing the object",
      examples: ["my-app-bucket", "data-lake-prod", "backup-storage"]
    },
    key: {
      description: "S3 object key/path (required) - full path to the object like 'logs/app.log' or 'data/users.json'",
      examples: ["logs/app.log", "data/users.json", "configs/settings.yaml", "reports/2024/summary.txt"]
    }
  }),
  handler: async (input: any) => {
    const out = await s3.send(new GetObjectCommand({ Bucket: input.bucket, Key: input.key }));
    const body = await streamToString(out.Body as Readable);
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
  parameterPrompts: createParameterPrompts(z.object({
    bucket: z.string(),
    key: z.string(),
    text: z.string(),
    contentType: z.string().default("text/plain; charset=utf-8")
  }), {
    bucket: {
      description: "S3 bucket name (required) - destination bucket for the object",
      examples: ["my-app-bucket", "data-lake-prod", "backup-storage"]
    },
    key: {
      description: "S3 object key/path (required) - where to store the object like 'logs/app.log' or 'data/output.json'",
      examples: ["logs/app.log", "data/output.json", "configs/new-settings.yaml", "reports/2024/results.txt"]
    },
    text: {
      description: "Text content to store (required) - the actual content/data to write to S3",
      examples: ["Hello World", "{\"key\": \"value\"}", "application logs content"]
    },
    contentType: {
      description: "MIME content type (optional)",
      examples: ["text/plain", "application/json", "text/csv", "application/xml"],
      defaultValue: "text/plain; charset=utf-8"
    }
  }),
  handler: async (input: any) => {
    await s3.send(new PutObjectCommand({ Bucket: input.bucket, Key: input.key, Body: input.text, ContentType: input.contentType }));
    return { ok: true, bucket: input.bucket, key: input.key };
  }
};
