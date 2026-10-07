import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireSession } from "@/lib/auth";
import { canReadTicket } from "@/lib/ticket-access";
import { storageBackend, createReadStreamLocal } from "@/lib/storage";
import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { readableStreamFrom } from "./stream";

function s3() {
  return new S3Client({
    endpoint: process.env.S3_ENDPOINT!,
    region: process.env.S3_REGION || "us-east-1",
    forcePathStyle: true,
    credentials: {
      accessKeyId: process.env.S3_ACCESS_KEY_ID!,
      secretAccessKey: process.env.S3_SECRET_ACCESS_KEY!,
    },
  });
}

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireSession();
    const { id } = await context.params;
    const attachment = await db.ticketAttachment.findUnique({
      where: { id },
      include: { ticket: { select: { requesterId: true, assigneeId: true, departmentId: true } } },
    });
    if (!attachment) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
    if (!canReadTicket(session.role, session.userId, attachment.ticket, session.departmentId)) {
      return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
    }

    const headers = new Headers();
    headers.set("Content-Type", attachment.mimeType || "application/octet-stream");
    const disposition = attachment.mimeType.startsWith("image/") ? "inline" : "attachment";
    headers.set(
      "Content-Disposition",
      `${disposition}; filename*=UTF-8''${encodeURIComponent(attachment.originalName)}`,
    );
    headers.set("Cache-Control", "private, max-age=60");
    headers.set("Content-Length", String(attachment.size));

    if (storageBackend() === "local") {
      const nodeStream = createReadStreamLocal(attachment.objectKey);
      return new NextResponse(readableStreamFrom(nodeStream), { status: 200, headers });
    }

    const out = await s3().send(
      new GetObjectCommand({ Bucket: process.env.S3_BUCKET!, Key: attachment.objectKey }),
    );
    if (!out.Body) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const bytes = await out.Body.transformToByteArray();
    return new NextResponse(Buffer.from(bytes), { status: 200, headers });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    if (msg === "UNAUTHORIZED") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    console.error("attachment download failed", e);
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
}
