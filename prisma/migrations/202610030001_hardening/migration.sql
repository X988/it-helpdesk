CREATE TABLE "AuthSession" (
  "id" UUID NOT NULL PRIMARY KEY, "tokenHash" TEXT NOT NULL, "userId" UUID NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AuthSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "AuthSession_tokenHash_key" ON "AuthSession"("tokenHash");
CREATE INDEX "AuthSession_userId_idx" ON "AuthSession"("userId");
CREATE INDEX "AuthSession_expiresAt_idx" ON "AuthSession"("expiresAt");
CREATE TABLE "RateLimitBucket" ("key" TEXT NOT NULL PRIMARY KEY, "hits" INTEGER NOT NULL DEFAULT 1, "expiresAt" TIMESTAMP(3) NOT NULL);
CREATE INDEX "RateLimitBucket_expiresAt_idx" ON "RateLimitBucket"("expiresAt");
ALTER TABLE "Notification" ADD COLUMN "text" TEXT, ADD COLUMN "keyboard" JSONB,
  ADD COLUMN "deliveredAt" TIMESTAMP(3), ADD COLUMN "attempts" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "availableAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, ADD COLUMN "leaseUntil" TIMESTAMP(3);
CREATE INDEX "Notification_deliveredAt_availableAt_idx" ON "Notification"("deliveredAt", "availableAt");
