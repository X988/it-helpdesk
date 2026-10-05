-- CreateEnum
CREATE TYPE "TaskDirection" AS ENUM ('PROGRAMMING', 'ADMINISTRATION', 'OTHER');

-- CreateTable
CREATE TABLE "Organization" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "domain" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Organization_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Organization_name_domain_key" ON "Organization"("name", "domain");
CREATE INDEX "Organization_domain_idx" ON "Organization"("domain");

-- Seed default org for energo
INSERT INTO "Organization" ("id", "name", "domain", "isActive", "createdAt", "updatedAt")
VALUES ('a1000000-0000-4000-8000-000000000001', 'КП', 'energo', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

-- AlterTable User: organization String -> organizationId FK
ALTER TABLE "User" ADD COLUMN "organizationId" UUID;

UPDATE "User" u
SET "organizationId" = 'a1000000-0000-4000-8000-000000000001'
WHERE u."organization" IS NULL
   OR u."organization" = ''
   OR lower(u."organization") LIKE '%energo%'
   OR lower(u."organization") LIKE '%кп%'
   OR u."username" IS NOT NULL;

ALTER TABLE "User" DROP COLUMN IF EXISTS "organization";

ALTER TABLE "User" ADD CONSTRAINT "User_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AlterTable Ticket
ALTER TABLE "Ticket" ADD COLUMN "direction" "TaskDirection" NOT NULL DEFAULT 'OTHER';
ALTER TABLE "Ticket" ADD COLUMN "workMinutes" INTEGER;
ALTER TABLE "Ticket" ADD COLUMN "organizationId" UUID;

UPDATE "Ticket" t
SET "organizationId" = u."organizationId"
FROM "User" u
WHERE t."requesterId" = u.id AND u."organizationId" IS NOT NULL;

ALTER TABLE "Ticket" ADD CONSTRAINT "Ticket_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "Ticket_organizationId_idx" ON "Ticket"("organizationId");
CREATE INDEX "Ticket_direction_idx" ON "Ticket"("direction");
