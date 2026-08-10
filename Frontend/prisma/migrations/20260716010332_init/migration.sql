/*
  Warnings:

  - Changed the type of `ESTADO` on the `usuarios` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.

*/
-- AlterTable
ALTER TABLE "usuarios" DROP COLUMN "ESTADO",
ADD COLUMN     "ESTADO" BOOLEAN NOT NULL;

-- DropEnum
DROP TYPE "Estado";
