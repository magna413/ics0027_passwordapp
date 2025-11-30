-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Credential" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "url" TEXT,
    "ciphertext" BLOB NOT NULL,
    "iv" BLOB NOT NULL,
    "tag" BLOB NOT NULL,
    "aad" BLOB,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Credential_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Credential" ("aad", "ciphertext", "createdAt", "id", "iv", "tag", "title", "updatedAt", "url", "userId", "username") SELECT "aad", "ciphertext", "createdAt", "id", "iv", "tag", "title", "updatedAt", "url", "userId", "username" FROM "Credential";
DROP TABLE "Credential";
ALTER TABLE "new_Credential" RENAME TO "Credential";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
