/*
  Warnings:

  - A unique constraint covering the columns `[id]` on the table `Credential` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX "Credential_id_key" ON "Credential"("id");
