-- Additive domain model: departments, SLA snapshot, KB, canned responses, outbox.
-- Existing ticket numbers, roles, organizations, AD sync and messages stay in place.

CREATE TYPE "DepartmentSource" AS ENUM ('MANUAL', 'AD');
CREATE TYPE "TicketSource" AS ENUM ('WEB', 'TELEGRAM', 'EMAIL');
CREATE TYPE "WaitingReasonType" AS ENUM ('USER', 'EXTERNAL', 'VENDOR', 'OTHER');
CREATE TYPE "CancelReasonType" AS ENUM ('DUPLICATE', 'INVALID_REQUEST', 'NOT_REQUIRED', 'OTHER');
CREATE TYPE "SlaCalendarMode" AS ENUM ('BUSINESS_TIME', 'CALENDAR_TIME');
CREATE TYPE "KbStatus" AS ENUM ('DRAFT', 'PUBLISHED');

ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'SLA_RESPONSE_BREACH';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'SLA_RESOLVE_BREACH';

CREATE TABLE "Department" (
  "id" UUID NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "adOuDn" TEXT,
  "source" "DepartmentSource" NOT NULL DEFAULT 'MANUAL',
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Department_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Department_adOuDn_key" ON "Department"("adOuDn");
CREATE INDEX "Department_name_idx" ON "Department"("name");
CREATE INDEX "Department_isActive_idx" ON "Department"("isActive");

ALTER TABLE "User" ADD COLUMN "departmentId" UUID;
CREATE INDEX "User_departmentId_idx" ON "User"("departmentId");
ALTER TABLE "User" ADD CONSTRAINT "User_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Category" ADD COLUMN "isHidden" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Category" ADD COLUMN "sortOrder" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Category" ADD COLUMN "ownerDepartmentId" UUID;
CREATE INDEX "Category_ownerDepartmentId_idx" ON "Category"("ownerDepartmentId");
CREATE INDEX "Category_isActive_sortOrder_idx" ON "Category"("isActive", "sortOrder");
ALTER TABLE "Category" ADD CONSTRAINT "Category_ownerDepartmentId_fkey" FOREIGN KEY ("ownerDepartmentId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Ticket" ADD COLUMN "departmentId" UUID;
ALTER TABLE "Ticket" ADD COLUMN "source" "TicketSource" NOT NULL DEFAULT 'WEB';
ALTER TABLE "Ticket" ADD COLUMN "cancelledAt" TIMESTAMP(3);
ALTER TABLE "Ticket" ADD COLUMN "firstResponseAt" TIMESTAMP(3);
ALTER TABLE "Ticket" ADD COLUMN "waitingSince" TIMESTAMP(3);
ALTER TABLE "Ticket" ADD COLUMN "waitingReasonType" "WaitingReasonType";
ALTER TABLE "Ticket" ADD COLUMN "waitingReasonText" TEXT;
ALTER TABLE "Ticket" ADD COLUMN "cancelReasonType" "CancelReasonType";
ALTER TABLE "Ticket" ADD COLUMN "cancelReasonText" TEXT;
ALTER TABLE "Ticket" ADD COLUMN "slaResponseDue" TIMESTAMP(3);
ALTER TABLE "Ticket" ADD COLUMN "slaResolveDue" TIMESTAMP(3);
ALTER TABLE "Ticket" ADD COLUMN "breachedResponseAt" TIMESTAMP(3);
ALTER TABLE "Ticket" ADD COLUMN "breachedResolveAt" TIMESTAMP(3);
ALTER TABLE "Ticket" ADD COLUMN "slaResponseMinutes" INTEGER;
ALTER TABLE "Ticket" ADD COLUMN "slaResolveMinutes" INTEGER;
ALTER TABLE "Ticket" ADD COLUMN "slaCalendarMode" "SlaCalendarMode";
ALTER TABLE "Ticket" ADD COLUMN "slaPolicyVersion" INTEGER;
ALTER TABLE "Ticket" ADD COLUMN "slaCalculatedAt" TIMESTAMP(3);
ALTER TABLE "Ticket" ADD COLUMN "slaPausedMinutes" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Ticket" ADD COLUMN "slaRemainingResolveMinutes" INTEGER;

CREATE INDEX "Ticket_priority_idx" ON "Ticket"("priority");
CREATE INDEX "Ticket_departmentId_idx" ON "Ticket"("departmentId");
CREATE INDEX "Ticket_updatedAt_idx" ON "Ticket"("updatedAt");
CREATE INDEX "Ticket_slaResponseDue_idx" ON "Ticket"("slaResponseDue");
CREATE INDEX "Ticket_slaResolveDue_idx" ON "Ticket"("slaResolveDue");
ALTER TABLE "Ticket" ADD CONSTRAINT "Ticket_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "TicketAttachment" ADD COLUMN "messageId" UUID;
ALTER TABLE "TicketAttachment" ADD CONSTRAINT "TicketAttachment_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "TicketMessage"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "SlaPolicy" (
  "id" UUID NOT NULL,
  "priority" "Priority" NOT NULL,
  "responseMinutes" INTEGER NOT NULL,
  "resolveMinutes" INTEGER NOT NULL,
  "calendarMode" "SlaCalendarMode" NOT NULL,
  "version" INTEGER NOT NULL DEFAULT 1,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SlaPolicy_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "SlaPolicy_priority_key" ON "SlaPolicy"("priority");

CREATE TABLE "KbArticle" (
  "id" UUID NOT NULL,
  "title" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "categoryId" UUID,
  "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "status" "KbStatus" NOT NULL DEFAULT 'DRAFT',
  "authorId" UUID NOT NULL,
  "views" INTEGER NOT NULL DEFAULT 0,
  "publishedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "KbArticle_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "KbArticle_slug_key" ON "KbArticle"("slug");
CREATE INDEX "KbArticle_status_categoryId_idx" ON "KbArticle"("status", "categoryId");
ALTER TABLE "KbArticle" ADD CONSTRAINT "KbArticle_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "KbArticle" ADD CONSTRAINT "KbArticle_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "CannedResponse" (
  "id" UUID NOT NULL,
  "title" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "categoryId" UUID,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdBy" UUID NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CannedResponse_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "CannedResponse_title_key" ON "CannedResponse"("title");
CREATE INDEX "CannedResponse_isActive_idx" ON "CannedResponse"("isActive");
ALTER TABLE "CannedResponse" ADD CONSTRAINT "CannedResponse_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CannedResponse" ADD CONSTRAINT "CannedResponse_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "NotificationOutbox" (
  "id" UUID NOT NULL,
  "userId" UUID,
  "ticketId" UUID,
  "channel" TEXT NOT NULL,
  "payload" JSONB NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "lastError" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "sentAt" TIMESTAMP(3),
  CONSTRAINT "NotificationOutbox_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "NotificationOutbox_status_createdAt_idx" ON "NotificationOutbox"("status", "createdAt");

INSERT INTO "SlaPolicy" ("id", "priority", "responseMinutes", "resolveMinutes", "calendarMode", "version", "updatedAt") VALUES
  ('00000000-0000-4000-8000-0000000000a1', 'LOW', 480, 2700, 'BUSINESS_TIME', 1, CURRENT_TIMESTAMP),
  ('00000000-0000-4000-8000-0000000000a2', 'NORMAL', 240, 1080, 'BUSINESS_TIME', 1, CURRENT_TIMESTAMP),
  ('00000000-0000-4000-8000-0000000000a3', 'HIGH', 60, 480, 'BUSINESS_TIME', 1, CURRENT_TIMESTAMP),
  ('00000000-0000-4000-8000-0000000000a4', 'URGENT', 15, 240, 'CALENDAR_TIME', 1, CURRENT_TIMESTAMP);

INSERT INTO "Department" ("id", "name", "source", "isActive", "createdAt", "updatedAt")
SELECT md5(s.department)::uuid, s.department, 'MANUAL', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM (SELECT DISTINCT department FROM "User" WHERE department IS NOT NULL AND btrim(department) <> '') s
ON CONFLICT DO NOTHING;

UPDATE "User" u
SET "departmentId" = d."id"
FROM "Department" d
WHERE u."departmentId" IS NULL AND u."department" IS NOT NULL AND d."name" = u."department";
