/*
  Warnings:

  - Added the required column `ip` to the `audit_logs` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "audit_logs" ADD COLUMN     "ip" TEXT NOT NULL;
