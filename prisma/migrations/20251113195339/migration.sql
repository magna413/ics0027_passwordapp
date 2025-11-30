-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT,
    "opaqueRecord" TEXT,
    "mfaSecret" TEXT,
    "wrappingSalt" BLOB NOT NULL,
    "wrappedDEK" BLOB NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "new_User" ("createdAt", "email", "id", "mfaSecret", "opaqueRecord", "passwordHash", "wrappedDEK", "wrappingSalt") SELECT "createdAt", "email", "id", "mfaSecret", "opaqueRecord", "passwordHash", "wrappedDEK", "wrappingSalt" FROM "User";
DROP TABLE "User";
ALTER TABLE "new_User" RENAME TO "User";
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
