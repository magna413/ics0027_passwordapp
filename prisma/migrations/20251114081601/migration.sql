/*
  Warnings:

  - You are about to drop the column `nonce` on the `serverLoginState` table. All the data in the column will be lost.

*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_OpaqueSession" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "token" TEXT,
    "used" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "OpaqueSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_OpaqueSession" ("createdAt", "id", "token", "used", "userId") SELECT "createdAt", "id", "token", "used", "userId" FROM "OpaqueSession";
DROP TABLE "OpaqueSession";
ALTER TABLE "new_OpaqueSession" RENAME TO "OpaqueSession";
CREATE UNIQUE INDEX "OpaqueSession_token_key" ON "OpaqueSession"("token");
CREATE TABLE "new_serverLoginState" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "user_id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "serverLoginState" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "serverLoginState_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_serverLoginState" ("createdAt", "email", "id", "serverLoginState", "user_id") SELECT "createdAt", "email", "id", "serverLoginState", "user_id" FROM "serverLoginState";
DROP TABLE "serverLoginState";
ALTER TABLE "new_serverLoginState" RENAME TO "serverLoginState";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
