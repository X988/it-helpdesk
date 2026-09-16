import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { randomUUID } from "crypto";

const allowed = new Set(["image/png","image/jpeg","image/webp","application/pdf","text/plain"]);
export const MAX_FILE_SIZE = 10 * 1024 * 1024;

function env(name: string) { const v = process.env[name]; if (!v) throw new Error(`${name} is required`); return v; }
function client() { return new S3Client({ endpoint: env("S3_ENDPOINT"), region: env("S3_REGION"), forcePathStyle: true, credentials: { accessKeyId: env("S3_ACCESS_KEY_ID"), secretAccessKey: env("S3_SECRET_ACCESS_KEY") } }); }
export function validateUpload(file: File) { if (file.size <= 0 || file.size > MAX_FILE_SIZE) throw new Error("INVALID_FILE_SIZE"); if (!allowed.has(file.type)) throw new Error("INVALID_FILE_TYPE"); }
export function safeObjectKey(ticketId: string) { return `tickets/${ticketId}/${randomUUID()}`; }
export async function putPrivateObject(key: string, file: File) { validateUpload(file); await client().send(new PutObjectCommand({ Bucket: env("S3_BUCKET"), Key: key, Body: Buffer.from(await file.arrayBuffer()), ContentType: file.type })); }
export async function signedDownloadUrl(key: string) { return getSignedUrl(client(), new GetObjectCommand({ Bucket: env("S3_BUCKET"), Key: key }), { expiresIn: 300 }); }
