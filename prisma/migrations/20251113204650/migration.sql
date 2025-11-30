/*
  Warnings:

  - Added the required column `nonce` to the `serverLoginState` table without a default value. This is not possible if the table is not empty.

*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_serverLoginState" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "user_id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "serverLoginState" TEXT NOT NULL,
    "nonce" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "serverLoginState_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_serverLoginState" ("createdAt", "email", "id", "serverLoginState", "user_id") SELECT "createdAt", "email", "id", "serverLoginState", "user_id" FROM "serverLoginState";
DROP TABLE "serverLoginState";
ALTER TABLE "new_serverLoginState" RENAME TO "serverLoginState";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
