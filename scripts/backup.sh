#!/bin/sh
set -eu

# Habilitar pipefail si el shell lo soporta (ash/dash en Alpine sí)
set -o pipefail 2>/dev/null || true

# Configurar timestamp para el nombre del archivo
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="/tmp/backup_${POSTGRES_DB}_${TIMESTAMP}.sql.gz"

echo "📦 [$(date)] Generando copia de seguridad de ${POSTGRES_DB}..."

# 1. Autenticar el cliente de MinIO (mc)
mc alias set myminio "http://${MINIO_HOST}:9000" "${MINIO_ROOT_USER}" "${MINIO_ROOT_PASSWORD}"

# 2. Crear el bucket de respaldos si no existe
mc mb "myminio/${MINIO_BUCKET_BACKUP}" --ignore-existing

# 3. Esperar a que Postgres esté realmente listo (evita "connection refused" al arrancar)
until PGPASSWORD="${POSTGRES_PASSWORD}" pg_isready -h "${POSTGRES_HOST}" -U "${POSTGRES_USER}" -d "${POSTGRES_DB}" >/dev/null 2>&1; do
  echo "⏳ Esperando a que ${POSTGRES_HOST} esté disponible..."
  sleep 2
done

# 4. Generar el dump de PostgreSQL y comprimirlo en gzip
if ! PGPASSWORD="${POSTGRES_PASSWORD}" pg_dump -h "${POSTGRES_HOST}" -U "${POSTGRES_USER}" -d "${POSTGRES_DB}" | gzip > "${BACKUP_FILE}"; then
  echo "❌ [$(date)] pg_dump falló. No se sube backup corrupto/vacío a MinIO."
  rm -f "${BACKUP_FILE}"
  exit 1
fi

# 5. Validar que el archivo no esté vacío o sospechosamente pequeño
FILESIZE=$(wc -c < "${BACKUP_FILE}")
if [ "${FILESIZE}" -lt 100 ]; then
  echo "❌ [$(date)] El backup generado es sospechosamente pequeño (${FILESIZE} bytes). Abortando subida."
  rm -f "${BACKUP_FILE}"
  exit 1
fi

# 6. Copiar el respaldo hacia MinIO
mc cp "${BACKUP_FILE}" "myminio/${MINIO_BUCKET_BACKUP}/"

# 7. Limpiar archivo temporal
rm -f "${BACKUP_FILE}"

echo "✅ [$(date)] Copia de seguridad guardada exitosamente en MinIO."