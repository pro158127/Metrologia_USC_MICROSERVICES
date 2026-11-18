# Integración continua y plan de pruebas

## Objetivo

El workflow `.github/workflows/ci.yml` ejecuta validaciones en cada push y pull request. Comprueba instalación reproducible, esquemas Prisma, pruebas backend, compilación, tipos, lint, worker Excel y configuración Compose. El lint informa su resultado y deja ejecutar las demás comprobaciones; al final, CI falla si el lint falló. Si una puerta falla, el cambio no debe promocionarse a entrega.

Este workflow implementa **integración continua (CI)**. No despliega a la universidad ni reemplaza la aceptación de negocio. La entrega/despliegue continuo (CD) se configurará después de contar con imágenes de producción, ambientes USC, secretos protegidos, migraciones revisadas y aprobación funcional.

## Puertas automatizadas del workflow

| Etapa | Comprobación | Qué detecta |
|---|---|---|
| Dependencias | `pnpm install --frozen-lockfile` | Lockfile desactualizado o instalación no reproducible |
| Base de datos | `prisma validate` y `prisma generate` para ambos esquemas | Esquemas inválidos o cliente Prisma no generable |
| Backend | `pnpm --filter backend test` | Regresión en cálculos, sincronización de tarifas y bloqueos de OT cubiertos por pruebas unitarias |
| Backend | `pnpm --filter backend build` | Errores de TypeScript y empaquetado del código backend |
| Frontend | `pnpm --filter metrologia exec tsc --noEmit` | Errores de tipos de la aplicación web |
| Frontend | `pnpm --filter metrologia lint` | Errores y advertencias de ESLint |
| Frontend | `pnpm --filter metrologia build` | Compilación de Next.js y generación de páginas |
| Documentos | `node scripts/test-excel-worker.cjs` | Lectura de un Excel de prueba mediante el worker |
| Despliegue | `docker compose config --quiet` | Errores de sintaxis o resolución de Compose |

El workflow usa valores ficticios de CI para variables requeridas por compilación. No utiliza la base, el correo, MinIO ni credenciales institucionales.

## Pruebas backend añadidas

Los archivos `Backend/test/*.test.ts` se ejecutan con `node:test` a través de `tsx --test`.

- **Importes:** descuento de 0 %, 100 % y 10 %; viáticos con centavos; redondeo a dos decimales; y multiplicación de líneas sin acumulación de error binario.
- **Sincronización de cotización y recepción:** agrupación de instrumentos repetidos, cantidad/precio/total, eliminación de una unidad conservando historial, tarifa ausente y tarifa ambigua.
- **Bloqueos de OT:** edición permitida antes de calibrar, bloqueo por estado avanzado, bloqueo cuando hay calibración registrada aunque el estado esté atrasado, conservación de datos técnicos y rechazo de alta/baja/cambio de identidad después del inicio.

Estas pruebas usan dobles de Prisma. Comprueban reglas de servicio, pero no simulan PostgreSQL ni demuestran que una transacción real persista correctamente.

## Última ejecución local

| Comprobación | Resultado |
|---|---|
| Instalación con lockfile congelado | Aprobada |
| Validación y generación de ambos clientes Prisma | Aprobadas; el cliente frontend se genera en `Frontend/generated/prisma` para mantenerlo separado |
| Pruebas backend | 11 aprobadas, 0 fallidas |
| Build backend | Aprobado |
| TypeScript frontend | Aprobado |
| Build frontend | Aprobado; Next.js advierte que detecta varios archivos de workspace/lockfile |
| Worker Excel | Smoke test aprobado |
| Configuración Compose | Aprobada |
| Lint frontend global | Bloquea CI: 92 errores y 74 advertencias en el código existente |

No se ejecutaron integraciones con PostgreSQL, Redis, MinIO, correo institucional ni pruebas de restauración; no se marcaron como aprobadas.

## Pruebas de integración y aceptación aún necesarias

Las siguientes pruebas requieren una base desechable y servicios de prueba; no deben apuntar a producción:

1. Levantar PostgreSQL con pgvector, Redis y MinIO, aplicar migraciones revisadas y confirmar health checks.
2. Crear cotización y comprobar directamente en la base `VALOR_TOTAL` por línea, viáticos, descuento y `MONTO_TOTAL`; repetir con tarifas decimales y con varias líneas.
3. Aprobar una cotización, crear OT y recepción, quitar un instrumento y comprobar que el registro queda desactivado en recepción/OT, la línea anterior queda desactivada en cotización y la cantidad/total actuales quedan correctos.
4. Rechazar por API y por interfaz la eliminación del último instrumento; probar modificación de identidad después de iniciar calibración y confirmar que la salida logística sigue editable.
5. Probar nombres de tarifa inexistentes, tarifas activas ambiguas, tarifa sin historial/precio vigente y dos instrumentos iguales.
6. Generar el Excel real de cotización y capturar el correo en un buzón de pruebas. Confirmar que `total_servicio` es el subtotal de líneas y `monto_total`/importe del correo es el total final, sin sumar viáticos dos veces.
7. Probar sesiones y permisos por rol, estados inválidos, reintentos, concurrencia y rollback de transacciones.
8. Restaurar un respaldo de PostgreSQL y archivos en un ambiente aislado y abrir documentos restaurados.

La aprobación de estas pruebas debe incluir commit probado, ambiente, datos ficticios, resultado esperado/observado y evidencia sin secretos.

## Estado y bloqueadores conocidos

- El repositorio no tenía suite backend ni workflow de CI; este cambio agrega las primeras pruebas de servicio y el pipeline.
- El lint frontend global tiene hallazgos ya registrados en el plan de pruebas. El workflow lo ejecuta como puerta estricta y puede quedar rojo hasta resolverlos; los resultados locales deben actualizarse antes de considerar CI verde.
- No se han automatizado todavía los flujos completos de API con PostgreSQL/Redis/MinIO ni las pruebas de roles, correo institucional, restauración, concurrencia o despliegue.
- El Compose actual está orientado a desarrollo. No se debe usar como CD de producción: antes hacen falta imágenes de producción, secretos gestionados fuera del repositorio, migraciones no destructivas, health checks y plan de reversa.
- Las credenciales detectadas en archivos versionados requieren rotación y retirada. El escaneo de secretos y dependencias debe incorporarse como puerta antes de publicar un ambiente accesible desde la universidad.

## Criterio para comenzar CD

Iniciar la etapa de entrega a un ambiente de aceptación cuando el workflow CI pase en un commit identificado y se hayan rotado los secretos. La publicación a producción queda condicionada a que pasen los flujos críticos de negocio, correo USC, restauración, seguridad y aceptación del responsable funcional e Infraestructura.
