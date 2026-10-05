-- AD directory cache + app settings
CREATE TABLE "AdDepartment" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "dn" TEXT NOT NULL,
    "parentDn" TEXT,
    "path" TEXT NOT NULL DEFAULT '',
    "isAdminOu" BOOLEAN NOT NULL DEFAULT false,
    "userCount" INTEGER NOT NULL DEFAULT 0,
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "AdDepartment_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AdDepartment_dn_key" ON "AdDepartment"("dn");
CREATE INDEX "AdDepartment_name_idx" ON "AdDepartment"("name");
CREATE INDEX "AdDepartment_isAdminOu_idx" ON "AdDepartment"("isAdminOu");

CREATE TABLE "AdDirectoryUser" (
    "id" UUID NOT NULL,
    "username" TEXT NOT NULL,
    "displayName" TEXT NOT NULL DEFAULT '',
    "email" TEXT,
    "department" TEXT,
    "ouName" TEXT,
    "ouDn" TEXT,
    "dn" TEXT NOT NULL,
    "isDisabled" BOOLEAN NOT NULL DEFAULT false,
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "AdDirectoryUser_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AdDirectoryUser_username_key" ON "AdDirectoryUser"("username");
CREATE UNIQUE INDEX "AdDirectoryUser_dn_key" ON "AdDirectoryUser"("dn");
CREATE INDEX "AdDirectoryUser_ouDn_idx" ON "AdDirectoryUser"("ouDn");
CREATE INDEX "AdDirectoryUser_ouName_idx" ON "AdDirectoryUser"("ouName");
CREATE INDEX "AdDirectoryUser_department_idx" ON "AdDirectoryUser"("department");

CREATE TABLE "AppSetting" (
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "AppSetting_pkey" PRIMARY KEY ("key")
);
