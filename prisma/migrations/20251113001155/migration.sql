-- CreateTable
CREATE TABLE "OpaqueLoginState" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL,
    "nonce" TEXT NOT NULL,
    "state" BLOB NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT,
    "opaqueRecord" BLOB,
    "mfaSecret" TEXT,
    "wrappingSalt" BLOB NOT NULL,
    "wrappedDEK" BLOB NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "new_User" ("createdAt", "email", "id", "mfaSecret", "passwordHash", "wrappedDEK", "wrappingSalt") SELECT "createdAt", "email", "id", "mfaSecret", "passwordHash", "wrappedDEK", "wrappingSalt" FROM "User";
DROP TABLE "User";
ALTER TABLE "new_User" RENAME TO "User";
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "OpaqueLoginState_nonce_key" ON "OpaqueLoginState"("nonce");
