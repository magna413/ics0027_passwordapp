/*
  Warnings:

  - You are about to drop the `serverLoginState` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the column `opaqueRecord` on the `User` table. All the data in the column will be lost.
  - Added the required column `expiresAt` to the `OpaqueSession` table without a default value. This is not possible if the table is not empty.

*/
-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "serverLoginState";
PRAGMA foreign_keys=on;

-- CreateTable
CREATE TABLE "ServerLoginState" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "user_id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "serverLoginState" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ServerLoginState_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ServerChangePasswordState" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "serverChangePasswordState" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ServerChangePasswordState_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_OpaqueSession" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "token" TEXT,
    "used" BOOLEAN NOT NULL DEFAULT false,
    "mfaVerified" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" DATETIME NOT NULL,
    CONSTRAINT "OpaqueSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_OpaqueSession" ("createdAt", "id", "token", "used", "userId") SELECT "createdAt", "id", "token", "used", "userId" FROM "OpaqueSession";
DROP TABLE "OpaqueSession";
ALTER TABLE "new_OpaqueSession" RENAME TO "OpaqueSession";
CREATE UNIQUE INDEX "OpaqueSession_token_key" ON "OpaqueSession"("token");
CREATE TABLE "new_User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL,
    "opaqueRegistrationRecord" TEXT,
    "mfaSecret" TEXT,
    "wrappingSalt" BLOB NOT NULL,
    "wrappedDEK" BLOB NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "new_User" ("createdAt", "email", "id", "mfaSecret", "wrappedDEK", "wrappingSalt") SELECT "createdAt", "email", "id", "mfaSecret", "wrappedDEK", "wrappingSalt" FROM "User";
DROP TABLE "User";
ALTER TABLE "new_User" RENAME TO "User";
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
