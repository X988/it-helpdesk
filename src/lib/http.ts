import { NextResponse } from "next/server";
import { z } from "zod";

export class HttpError extends Error {
  constructor(public status: number, public code: string) { super(code); }
}
export function apiError(error: unknown) {
  if (error instanceof HttpError) return NextResponse.json({ error: error.code }, { status: error.status });
  // Logs contain no query, body, credentials or provider URLs.
  console.error("Helpdesk request failed", error instanceof Error ? error.name : "UnknownError");
  return NextResponse.json({ error: "INTERNAL_ERROR" }, { status: 500 });
}
export function appOrigin() {
  const value = process.env.APP_URL;
  if (!value) throw new Error("APP_URL is required");
  const url = new URL(value);
  if (!["http:", "https:"].includes(url.protocol)) throw new Error("Invalid APP_URL");
  return url.origin;
}
export function requireSameOrigin(request: Request) {
  if (request.headers.get("origin") !== appOrigin()) throw new HttpError(403, "INVALID_ORIGIN");
}
export function validId(id: string) {
  if (!z.uuid().safeParse(id).success) throw new HttpError(400, "INVALID_ID");
  return id;
}
export async function readBody(request: Request, maxBytes: number) {
  const length = Number(request.headers.get("content-length"));
  if (Number.isFinite(length) && length > maxBytes) throw new HttpError(413, "BODY_TOO_LARGE");
  if (!request.body) return new Uint8Array();
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) { await reader.cancel(); throw new HttpError(413, "BODY_TOO_LARGE"); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const body = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { body.set(chunk, offset); offset += chunk.byteLength; }
  return body;
}
export async function readJson(request: Request) {
  if (!request.headers.get("content-type")?.startsWith("application/json")) throw new HttpError(415, "JSON_REQUIRED");
  try { return JSON.parse(new TextDecoder().decode(await readBody(request, 32 * 1024))) as unknown; }
  catch (error) { if (error instanceof HttpError) throw error; throw new HttpError(400, "INVALID_JSON"); }
}
export function parseInput<T>(schema: z.ZodType<T>, input: unknown): T {
  const parsed = schema.safeParse(input);
  if (!parsed.success) throw new HttpError(400, "INVALID_INPUT");
  return parsed.data;
}
