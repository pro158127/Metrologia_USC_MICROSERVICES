#!/bin/sh
set -e

echo "🔄 [$(date)] Iniciando proceso de restauración..."

# 1 y 2. Autenticar y buscar el backup (Mismo código de antes...)
mc alias set myminio "http://${MINIO_HOST}:9000" "${MINIO_ROOT_USER}" "${MINIO_ROOT_PASSWORD}"
LATEST_BACKUP=$(mc ls myminio/${MINIO_BUCKET_BACKUP}/ | grep "\.sql\.gz$" | sort | tail -n 1 | awk '{print $NF}')

if [ -z "$LATEST_BACKUP" ]; then
  echo "❌ No se encontraron backups en el bucket."
  exit 1
fi

# 3. Esperar a que Postgres esté listo
until PGPASSWORD="${POSTGRES_PASSWORD}" pg_isready -h "${POSTGRES_HOST}" -U "${POSTGRES_USER}" -d "${POSTGRES_DB}" >/dev/null 2>&1; do
  sleep 2
done

# ====================================================================
# 🔥 NUEVO: GUARDIÁN DE SEGURIDAD (Data Check)
# ====================================================================
# Contamos cuántos usuarios existen. Si el seed inicial mete 1 (Director), 
# cualquier número mayor significa que la BD ya está en uso.
CANTIDAD_USUARIOS=$(PGPASSWORD="${POSTGRES_PASSWORD}" psql -h "${POSTGRES_HOST}" -U "${POSTGRES_USER}" -d "${POSTGRES_DB}" -t -c "SELECT COUNT(*) FROM usuarios;" | tr -d ' ')

if [ "$CANTIDAD_USUARIOS" -gt 1 ]; then
  echo "⚠️ ¡ALERTA DE SEGURIDAD! La base de datos NO está vacía."
  echo "⚠️ Se detectaron $CANTIDAD_USUARIOS usuarios activos."
  echo "⚠️ Restauración abortada para prevenir la pérdida de datos de producción."
  exit 1
fi

# ====================================================================
# 4. Inyección segura (Solo se ejecuta si el guardián lo permite)
# ====================================================================
echo "📥 Base de datos limpia detectada. Restaurando $LATEST_BACKUP..."

mc cat "myminio/${MINIO_BUCKET_BACKUP}/${LATEST_BACKUP}" | gunzip | PGPASSWORD="${POSTGRES_PASSWORD}" psql -h "${POSTGRES_HOST}" -U "${POSTGRES_USER}" -d "${POSTGRES_DB}"

echo "🎉 [$(date)] ¡Restauración completada con éxito!"

# ====================================================================
# 5. Resincronización de Secuencias (Fix para Unique Constraints)
# ====================================================================
echo "🔄 Sincronizando contadores de todas las tablas..."

PGPASSWORD="${POSTGRES_PASSWORD}" psql -h "${POSTGRES_HOST}" -U "${POSTGRES_USER}" -d "${POSTGRES_DB}" <<EOF
SELECT setval(pg_get_serial_sequence('audit_logs', 'ID_AUDIT'), coalesce(max("ID_AUDIT"), 0) + 1, false) FROM audit_logs;
SELECT setval(pg_get_serial_sequence('calibraciones', 'ID_CALIBRACION'), coalesce(max("ID_CALIBRACION"), 0) + 1, false) FROM calibraciones;
SELECT setval(pg_get_serial_sequence('certificados', 'ID_CERTIFICADO'), coalesce(max("ID_CERTIFICADO"), 0) + 1, false) FROM certificados;
SELECT setval(pg_get_serial_sequence('clientes', 'ID_CLIENTE'), coalesce(max("ID_CLIENTE"), 0) + 1, false) FROM clientes;
SELECT setval(pg_get_serial_sequence('cotizacion_detalles', 'ID_DETALLE'), coalesce(max("ID_DETALLE"), 0) + 1, false) FROM cotizacion_detalles;
SELECT setval(pg_get_serial_sequence('cotizaciones', 'ID_COTIZACION'), coalesce(max("ID_COTIZACION"), 0) + 1, false) FROM cotizaciones;
SELECT setval(pg_get_serial_sequence('document_chunks', 'ID_CHUNK'), coalesce(max("ID_CHUNK"), 0) + 1, false) FROM document_chunks;
SELECT setval(pg_get_serial_sequence('documentos', 'ID_DOCUMENTO'), coalesce(max("ID_DOCUMENTO"), 0) + 1, false) FROM documentos;
SELECT setval(pg_get_serial_sequence('facturas', 'ID_FACTURA'), coalesce(max("ID_FACTURA"), 0) + 1, false) FROM facturas;
SELECT setval(pg_get_serial_sequence('historial_estado_cotizacion', 'ID_HISTORIAL'), coalesce(max("ID_HISTORIAL"), 0) + 1, false) FROM historial_estado_cotizacion;
SELECT setval(pg_get_serial_sequence('historial_tarifas', 'ID_HISTORIAL'), coalesce(max("ID_HISTORIAL"), 0) + 1, false) FROM historial_tarifas;
SELECT setval(pg_get_serial_sequence('notificaciones', 'ID_NOTIFICACION'), coalesce(max("ID_NOTIFICACION"), 0) + 1, false) FROM notificaciones;
SELECT setval(pg_get_serial_sequence('orden_trabajo_detalles', 'ID_DETALLE'), coalesce(max("ID_DETALLE"), 0) + 1, false) FROM orden_trabajo_detalles;
SELECT setval(pg_get_serial_sequence('ordenes_trabajo', 'ID_ORDEN_TRABAJO'), coalesce(max("ID_ORDEN_TRABAJO"), 0) + 1, false) FROM ordenes_trabajo;
SELECT setval(pg_get_serial_sequence('parametros_sistema', 'ID_PARAMETRO'), coalesce(max("ID_PARAMETRO"), 0) + 1, false) FROM parametros_sistema;
SELECT setval(pg_get_serial_sequence('plantillas', 'ID_PLANTILLA'), coalesce(max("ID_PLANTILLA"), 0) + 1, false) FROM plantillas;
SELECT setval(pg_get_serial_sequence('plantillas_sellos', 'ID_PLANTILLA_SELLO'), coalesce(max("ID_PLANTILLA_SELLO"), 0) + 1, false) FROM plantillas_sellos;
SELECT setval(pg_get_serial_sequence('recepcion_equipo_detalles', 'ID_INSTRUMENTO'), coalesce(max("ID_INSTRUMENTO"), 0) + 1, false) FROM recepcion_equipo_detalles;
SELECT setval(pg_get_serial_sequence('recepciones_equipo', 'ID_RECEPCION'), coalesce(max("ID_RECEPCION"), 0) + 1, false) FROM recepciones_equipo;
SELECT setval(pg_get_serial_sequence('roles', 'ID_ROL_INCREMENT'), coalesce(max("ID_ROL_INCREMENT"), 0) + 1, false) FROM roles;
SELECT setval(pg_get_serial_sequence('sellos', 'ID_SELLO'), coalesce(max("ID_SELLO"), 0) + 1, false) FROM sellos;
SELECT setval(pg_get_serial_sequence('tarifas', 'ID_TARIFA'), coalesce(max("ID_TARIFA"), 0) + 1, false) FROM tarifas;
SELECT setval(pg_get_serial_sequence('usuarios', 'ID_USUARIO_AUTO_INCREMENT'), coalesce(max("ID_USUARIO_AUTO_INCREMENT"), 0) + 1, false) FROM usuarios;
SELECT setval(pg_get_serial_sequence('version_documentos', 'ID_VERSION'), coalesce(max("ID_VERSION"), 0) + 1, false) FROM version_documentos;
SELECT setval(pg_get_serial_sequence('version_plantillas', 'ID_VERSION_PLANTILLA'), coalesce(max("ID_VERSION_PLANTILLA"), 0) + 1, false) FROM version_plantillas;
EOF
# 🔥 Mueve el mensaje de éxito AQUÍ, al puro final:
echo "🎉 [$(date)] ¡Restauración de MetroSoft completada y sincronizada con éxito!"