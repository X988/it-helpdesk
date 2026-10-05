import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { createReadStream, existsSync, mkdirSync } from "fs";
import { mkdir, writeFile, readFile, access } from "fs/promises";
import path from "path";
import { randomUUID } from "crypto";
import { Readable } from "stream";

const allowed = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "application/pdf",
  "text/plain",
]);
export const MAX_FILE_SIZE = 10 * 1024 * 1024;

function env(name: string) {
  const v = process.env[name];
  if (!v) throw new Error(`${name} is required`);
  return v;
}

function s3Configured() {
  return Boolean(
    process.env.S3_ENDPOINT?.trim() &&
      process.env.S3_BUCKET?.trim() &&
      process.env.S3_ACCESS_KEY_ID?.trim() &&
      process.env.S3_SECRET_ACCESS_KEY?.trim(),
  );
}

/** local when S3 is not fully configured, or STORAGE_BACKEND=local */
export function storageBackend(): "local" | "s3" {
  const forced = process.env.STORAGE_BACKEND?.trim().toLowerCase();
  if (forced === "local") return "local";
  if (forced === "s3") return "s3";
  return s3Configured() ? "s3" : "local";
}

function localRoot() {
  const root = process.env.LOCAL_STORAGE_PATH?.trim() || path.join(process.cwd(), "data", "uploads");
  if (!existsSync(root)) mkdirSync(root, { recursive: true });
  return root;
}

function localPath(key: string) {
  // Prevent path traversal
  const safe = key.replace(/\.\./g, "").replace(/^\/+/, "");
  return path.join(localRoot(), safe);
}

function s3Client() {
  return new S3Client({
    endpoint: env("S3_ENDPOINT"),
    region: process.env.S3_REGION?.trim() || "us-east-1",
    forcePathStyle: true,
    credentials: {
      accessKeyId: env("S3_ACCESS_KEY_ID"),
      secretAccessKey: env("S3_SECRET_ACCESS_KEY"),
    },
  });
}

export function validateUpload(file: File) {
  if (file.size <= 0 || file.size > MAX_FILE_SIZE) throw new Error("INVALID_FILE_SIZE");
  if (!allowed.has(file.type)) throw new Error("INVALID_FILE_TYPE");
}

export function safeObjectKey(ticketId: string) {
  return `tickets/${ticketId}/${randomUUID()}`;
}

export async function putPrivateObject(key: string, file: File) {
  validateUpload(file);
  const body = Buffer.from(await file.arrayBuffer());
  if (storageBackend() === "local") {
    const dest = localPath(key);
    await mkdir(path.dirname(dest), { recursive: true });
    await writeFile(dest, body);
    return;
  }
  await s3Client().send(
    new PutObjectCommand({
      Bucket: env("S3_BUCKET"),
      Key: key,
      Body: body,
      ContentType: file.type,
    }),
  );
}

export type StoredObject = {
  stream: Readable;
  contentType?: string;
  contentLength?: number;
};

/** Stream object for authenticated download (local or S3). */
export async function getPrivateObject(key: string, mimeType?: string): Promise<StoredObject> {
  if (storageBackend() === "local") {
    const dest = localPath(key);
    await access(dest);
    const buf = await readFile(dest);
    return {
      stream: Readable.from(buf),
      contentType: mimeType,
      contentLength: buf.length,
    };
  }
  const out = await s3Client().send(
    new GetObjectCommand({ Bucket: env("S3_BUCKET"), Key: key }),
  );
  const body = out.Body;
  if (!body) throw new Error("OBJECT_NOT_FOUND");
  // AWS SDK v3 Body is AsyncIterable / Readable in Node
  const stream =
    body instanceof Readable
      ? body
      : Readable.from(body as AsyncIterable<Uint8Array>);
  return {
    stream,
    contentType: out.ContentType ?? mimeType,
    contentLength: out.ContentLength,
  };
}

/** Prefer streaming via getPrivateObject; signed URL only for S3 when needed. */
export async function signedDownloadUrl(key: string) {
  if (storageBackend() === "local") {
    throw new Error("LOCAL_STORAGE_NO_SIGNED_URL");
  }
  return getSignedUrl(
    s3Client(),
    new GetObjectCommand({ Bucket: env("S3_BUCKET"), Key: key }),
    { expiresIn: 300 },
  );
}

export function createReadStreamLocal(key: string) {
  return createReadStream(localPath(key));
}
