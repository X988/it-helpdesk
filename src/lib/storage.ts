import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { randomUUID } from "node:crypto";
import { HttpError } from "@/lib/http";
export const MAX_FILE_SIZE = 10 * 1024 * 1024;
export const MAX_BATCH_FILES = 5;
export const MAX_TICKET_FILES = 20;
const allowed = new Set(["image/png", "image/jpeg", "image/webp", "application/pdf", "text/plain"]);
const envNames = ["S3_ENDPOINT", "S3_REGION", "S3_BUCKET", "S3_ACCESS_KEY_ID", "S3_SECRET_ACCESS_KEY"];
export function storageConfigured() { return envNames.every(name => Boolean(process.env[name])); }
function env(name: string) { const value = process.env[name]; if (!value) throw new HttpError(503, "STORAGE_NOT_CONFIGURED"); return value; }
function client() { return new S3Client({ endpoint: env("S3_ENDPOINT"), region: env("S3_REGION"), forcePathStyle: true, credentials: { accessKeyId: env("S3_ACCESS_KEY_ID"), secretAccessKey: env("S3_SECRET_ACCESS_KEY") }, requestHandler: { requestTimeout: 15_000, connectionTimeout: 5_000 }, maxAttempts: 2 }); }
export async function validateUpload(file: File) {
  if (file.size <= 0 || file.size > MAX_FILE_SIZE) throw new HttpError(400, "INVALID_FILE_SIZE");
  if (!allowed.has(file.type)) throw new HttpError(400, "INVALID_FILE_TYPE");
  const bytes = Buffer.from(await file.arrayBuffer());
  const signature = file.type === "image/png" ? bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))
    : file.type === "image/jpeg" ? bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255
    : file.type === "image/webp" ? bytes.toString("ascii",0,4) === "RIFF" && bytes.toString("ascii",8,12) === "WEBP"
    : file.type === "application/pdf" ? bytes.toString("ascii",0,5) === "%PDF-" : !bytes.includes(0);
  if (!signature) throw new HttpError(400, "INVALID_FILE_CONTENT");
  if (file.type === "text/plain") {
    try { new TextDecoder("utf-8", { fatal: true }).decode(bytes); }
    catch { throw new HttpError(400, "INVALID_FILE_CONTENT"); }
  }
}
export function safeObjectKey(ticketId: string) { return "tickets/" + ticketId + "/" + randomUUID(); }
export function safeFilename(name: string) {
  return Array.from(name).map(char => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127 || char === "/" || char === "\\" ? "_" : char).join("").slice(0,180) || "download";
}
export async function putPrivateObject(key: string, file: File) { await client().send(new PutObjectCommand({ Bucket: env("S3_BUCKET"), Key: key, Body: Buffer.from(await file.arrayBuffer()), ContentType: file.type })); }
export async function deletePrivateObject(key: string) { await client().send(new DeleteObjectCommand({ Bucket: env("S3_BUCKET"), Key: key })); }
export async function signedDownloadUrl(key: string, name: string) {
  const filename = safeFilename(name);
  const disposition = "attachment; filename=\"download\"; filename*=UTF-8''" + encodeURIComponent(filename).replace(/['()*]/g, char => "%" + char.charCodeAt(0).toString(16));
  return getSignedUrl(client(), new GetObjectCommand({ Bucket: env("S3_BUCKET"), Key: key, ResponseContentDisposition: disposition }), { expiresIn: 300 });
}
