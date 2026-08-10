-- 1. Eliminar la restricción de llave primaria anterior sobre 'id'
ALTER TABLE "audit_logs" DROP CONSTRAINT IF EXISTS "audit_logs_pkey";

-- 2. Renombrar la columna 'id' a 'ID_AUDIT' (así conservas los datos que ya tenías de ID)
ALTER TABLE "audit_logs" RENAME COLUMN "id" TO "ID_AUDIT";

-- 3. Eliminar la columna 'acciones' de forma segura
ALTER TABLE "audit_logs" DROP COLUMN IF EXISTS "acciones";

-- 4. Crear la nueva llave primaria sobre la columna 'ID_AUDIT'
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("ID_AUDIT"); 