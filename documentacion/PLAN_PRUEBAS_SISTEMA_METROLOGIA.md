# Plan de pruebas del sistema de Metrología USC

**Propósito:** revisar que cada módulo cumple su trabajo, que las reglas de negocio no permiten estados inválidos y que un cambio en un módulo no daña el flujo de los demás.

**Estado de ejecución:** revisión inicial realizada el 15 de noviembre de 2026. Los resultados reales de los comandos ejecutados están al final. Las pruebas que requieren base de datos, MinIO, Redis, servidor de correo o usuarios de aceptación quedan pendientes hasta que esos servicios estén disponibles.

## Cómo usar este documento

1. Ejecutar primero la sección **Pruebas automáticas locales** desde la raíz del repositorio.
2. Corregir los fallos y repetir los comandos; no marcar una prueba como aprobada solo porque la aplicación abre.
3. Ejecutar las pruebas de negocio en un ambiente de pruebas con datos ficticios. No usar información real de clientes ni enviar correos reales durante la aceptación.
4. Marcar cada caso como `Aprobado`, `Fallido` o `Bloqueado`, y anotar evidencia (captura, identificador de OT, log sin secretos o resultado del comando).
5. El sistema queda aceptado cuando todos los casos críticos pasan y no existen fallos bloqueantes abiertos.

## Preparación segura

- Usar una copia de la base de datos o una base vacía de pruebas. No apuntar a producción.
- Configurar secretos de prueba fuera del repositorio y comprobar que no se imprimen en logs.
- Confirmar disponibilidad de PostgreSQL con las migraciones aprobadas, Redis, MinIO y LibreOffice si el flujo de documentos lo requiere.
- Crear usuarios de prueba con cada rol (administrador, comercial, recepción, técnico, revisor, entrega) y permisos mínimos.
- Crear clientes y equipos ficticios, una tarifa activa y una plantilla de cotización/OT/certificado válida.
- Preparar archivos Excel válidos y dañados, certificados PDF y adjuntos de tamaños permitidos y no permitidos.
- Mantener el correo en modo de pruebas o con un buzón autorizado por TI.

## Pruebas automáticas locales

Ejecutar desde la raíz:

```bash
pnpm install --frozen-lockfile
pnpm --filter backend exec prisma generate
pnpm --filter backend build
pnpm --filter metrologia build
pnpm --filter metrologia lint
node scripts/test-excel-worker.cjs
docker compose config --quiet
```

El comando `build` del frontend también ejecuta la verificación de TypeScript de Next.js. El lint actualmente es una puerta de calidad independiente: errores de `any`, hooks y variables sin uso deben corregirse por grupos, y repetirse hasta lograr salida limpia.

> La declaración de tipos de una librería y el funcionamiento en producción son cosas distintas. Si TypeScript no reconoce un import, primero se verifica la versión realmente instalada, el punto de entrada y el empaquetado. Luego se comprueba que el archivo exista en el artefacto desplegado y se ejecuta la operación real en pruebas. No se debe ocultar un error de ejecución con una conversión de tipos.

## Casos de prueba por módulo

En cada renglón, registrar resultado y evidencia. Los casos con `Crítica` deben pasar antes de liberar una versión.

| ID | Módulo / flujo | Prueba y resultado esperado | Prioridad | Estado |
|---|---|---|---|---|
| AUT-01 | Instalación y configuración | Instalar desde el lockfile en un entorno limpio; generar Prisma y construir ambos paquetes. Sin dependencias faltantes. | Crítica | Aprobado: Prisma generado y builds backend/frontend correctos; repetir en CI limpio |
| AUT-02 | Despliegue | Levantar versión de prueba con configuración externa; validar health check, logs y apagado/reinicio. Sin ejecutar migraciones destructivas automáticamente. | Crítica | Bloqueado: infraestructura de prueba |
| SEG-01 | Autenticación | Iniciar sesión con credenciales válidas; rechazar contraseña incorrecta, usuario inactivo y sesión/token vencido. | Crítica | Pendiente: servicio de prueba |
| SEG-02 | Roles y permisos | Para cada rol, probar acceso permitido y denegado a cada módulo y endpoint. La API también debe denegar, aunque se fuerce una llamada desde navegador. | Crítica | Pendiente: usuarios de prueba |
| CLI-01 | Clientes | Crear, consultar, editar y desactivar un cliente; validar NIT/campos obligatorios y que no se duplique el cliente por doble envío. | Alta | Pendiente |
| COT-01 | Cotización | Crear cotización con varios instrumentos; comprobar cálculos por cantidad, tarifa, descuento, viáticos y total. Rechazar valores negativos y datos incompletos. | Crítica | Pendiente |
| COT-02 | Cotización | Aprobar/rechazar y volver a editar según permisos; verificar que una edición posterior no borra cliente, ítems ni historial. | Crítica | Pendiente |
| TAR-01 | Tarifas | Crear tarifa vigente y vencida; confirmar que una cotización nueva usa la aplicable y que una tarifa histórica no cambia al actualizar el catálogo. | Alta | Pendiente |
| OT-01 | Órdenes de trabajo | Generar OT desde cotización aprobada; comprobar consecutivo único, detalle e instrumentos correctos. Repetir solicitud y confirmar que no duplica la OT. | Crítica | Pendiente |
| OT-02 | División / versión de OT | Separar órdenes por sede o alcance; verificar vínculo con OT principal, detalle completo y consistencia de estados/costos. | Crítica | Pendiente |
| REC-01 | Recepción | Registrar todos los campos, instrumentos e IBC; `true` debe mostrarse como ✓ y `false` como ✗, sin confundir `false` con vacío. | Crítica | Pendiente |
| REC-02 | Recepción y entrega | Intentar enviar comprobante/certificados con un campo de entrega vacío: se debe impedir y mostrar qué falta. Completar todo y confirmar que permite continuar. | Crítica | Pendiente |
| REC-03 | Recepción | Intentar asociar equipo ajeno a la OT, duplicar el mismo instrumento o modificar recepción cerrada sin permiso. Debe rechazarse o dejar auditoría. | Alta | Pendiente |
| CAL-01 | Calibración | Asignar técnico a cada instrumento; confirmar que la recepción/OT muestra el nombre asignado correcto, incluido el caso de varios técnicos. | Crítica | Pendiente |
| CAL-02 | Calibración | Guardar resultados dentro/fuera de tolerancia, campos requeridos y observaciones; validar transiciones y que un fallo no apruebe certificado automáticamente. | Crítica | Pendiente |
| CER-01 | Certificados | Subir PDF válido, rechazar archivo dañado/tipo no permitido, revisar, aprobar y rechazar. Reemplazar un certificado debe preservar historial y vínculo del instrumento. | Crítica | Pendiente |
| CER-02 | Certificados | Intentar enviar certificados de una OT con aprobaciones pendientes; bloquear envío e indicar claramente el estado pendiente. | Crítica | Pendiente |
| ENV-01 | Envío y entrega | Confirmar aprobación de todos los certificados y entrega completa antes de enviar. Adjuntar comprobante correcto y guardar fecha/usuario de envío. | Crítica | Pendiente |
| ENV-02 | Envío y entrega | Simular falla SMTP/Redis y reintento. No perder el trabajo ni enviar duplicados; mostrar estado pendiente/error y permitir reintento controlado. | Crítica | Pendiente: servicios externos |
| DOC-01 | Plantillas / documentos | Importar Excel válido con celdas, hojas, estilos, fórmulas e imágenes; generar salida. Probar archivo corrupto, hoja inexistente, mapeo faltante y conversor ausente. | Crítica | Parcial: `node scripts/test-excel-worker.cjs` pasa con una hoja y valores ficticios; faltan casos de error y aceptación integral |
| DOC-02 | Archivos | Solicitar URL firmada para clave existente y no existente; comprobar permisos, expiración y que no permita leer archivos ajenos. | Crítica | Pendiente: MinIO/S3 |
| SEL-01 | Sellos | Crear y activar sello operativo; impedir una plantilla incompleta y comprobar que el sello usado en documento corresponde a la versión activa y queda auditado. | Alta | Pendiente |
| FAC-01 | Facturas / pagos | Registrar pago, rechazar valores inválidos y comprobar que saldo/estado de la cotización no cambien dos veces por reintento. | Alta | Pendiente |
| REP-01 | Reportes | Comparar totales y cantidades del reporte contra una consulta de referencia con datos conocidos; probar filtros, fechas vacías y permisos. | Alta | Pendiente |
| NOT-01 | Notificaciones / tiempo real | Actualizar un dato en una sesión y comprobar que usuarios autorizados reciben una sola notificación; usuarios ajenos no reciben datos privados. | Alta | Pendiente |
| AUD-01 | Auditoría / bitácora | Crear, cambiar, aprobar y eliminar lógico; verificar actor, fecha, entidad y valores pertinentes. Nunca guardar contraseñas, tokens ni secretos. | Crítica | Pendiente |
| INT-01 | Integración entre módulos | Ejecutar cotización → OT → recepción → calibración → revisión → entrega. Verificar identificadores, estado, cantidad e instrumentos en cada paso. | Crítica | Pendiente |
| INT-02 | Aislamiento entre módulos | Con dos clientes y dos OTs en paralelo, repetir operaciones y comprobar que cambios/documentos de una OT no alteran la otra. | Crítica | Pendiente |
| INT-03 | Transacciones / concurrencia | Dos usuarios intentan aprobar, asignar consecutivo o enviar la misma OT a la vez. Debe existir un solo resultado válido, sin duplicados ni pérdida de datos. | Crítica | Pendiente |
| REC-04 | Reversión de errores | Provocar error a mitad de una operación con varios registros; confirmar que la transacción revierte completa y no deja estado parcial. | Crítica | Pendiente |
| RES-01 | Respaldo | Respaldar y restaurar base y documentos en ambiente aislado; abrir un certificado restaurado y comparar relaciones/cantidades. | Crítica | Pendiente: infraestructura |
| REND-01 | Rendimiento | Ejecutar con la concurrencia y tamaño de archivos esperados; registrar tiempos API, memoria, cola y fallos. Definir objetivos antes de aprobar. | Alta | Pendiente: capacidad por definir |
| ACC-01 | Usabilidad | Completar flujos con usuarios representativos; confirmar mensajes claros, campos faltantes visibles y que los estados no dependan de conocimiento técnico. | Alta | Pendiente: usuarios de aceptación |

## Reglas para evitar que un módulo dañe a otro

- Antes y después de cualquier cambio, ejecutar los cuatro comandos automáticos de arriba.
- En cada cambio de base de datos, comparar ambos esquemas Prisma y revisar migración, datos existentes y reversión.
- Probar el flujo integrado `cotización → OT → recepción → calibración → certificados → entrega`; no probar solo la pantalla modificada.
- Probar al menos un caso válido, uno incompleto, uno no autorizado, un reintento y dos operaciones concurrentes donde aplique.
- No guardar documentos con vínculos a IDs de otra cotización/OT. Verificarlo directamente en la base de pruebas.
- Si una operación usa cola, comprobar estado de trabajo, reintento, duplicado y recuperación tras reinicio de worker.
- Mantener evidencia de la versión probada (commit/tag), configuración por nombre de variable (nunca su valor), resultado y responsable.

## Criterio para declarar una prueba

- **Aprobado:** resultado observado coincide con el esperado y existe evidencia reproducible.
- **Fallido:** no coincide; registrar pasos, resultado real, impacto y módulo relacionado. Abrir corrección y repetir el caso más la regresión integrada.
- **Bloqueado:** falta ambiente, cuenta, dato institucional o servicio externo; indicar quién debe habilitarlo. No contarlo como aprobado.

## Resultados ejecutados en esta revisión

| Verificación | Resultado observado | Seguimiento |
|---|---|---|
| `pnpm --filter backend build` | Aprobado después de alinear cliente y firmador AWS, cargar correctamente LibreOffice y generar Prisma. | Repetir desde instalación limpia y agregar al pipeline. |
| `pnpm --filter metrologia build` | Aprobado en la última ejecución: compilación, TypeScript y páginas estáticas generadas. Next.js advierte que el rastreo dinámico del endpoint de importación incluye archivos inesperados; revisar el tamaño del artefacto y worker en el despliegue real. | Build local aprobado; falta artefacto en ambiente de aceptación. |
| `pnpm --filter metrologia exec tsc --noEmit` | Aprobado después de corregir el tipo de navegación del dashboard y el contrato del editor de tarifas. | Mantener como puerta de CI. |
| `node scripts/test-excel-worker.cjs` | Aprobado: crea un XLSX temporal, ejecuta el worker y comprueba el nombre de hoja y dos celdas. Borra el archivo al terminar. | Ampliar con estilos, fórmulas, imágenes y casos de error. |
| `pnpm --filter metrologia lint` | Falló: 92 errores y 74 advertencias. Persisten `any`, hooks, imports/variables sin uso y otros hallazgos en módulos no corregidos. | Pendiente de corregir por grupos; el lint global aún no está aprobado. |
| ESLint sobre los cuatro archivos corregidos | Aprobado sin errores ni advertencias. | Repetir al tocar estos archivos. |
| Validación de ambos esquemas Prisma | Aprobada: los esquemas de backend y frontend son válidos. | Seguir comparándolos en cada cambio estructural. |
| `pnpm --filter backend exec prisma generate` | Aprobado: generó el cliente Prisma desde el esquema del backend. | Ejecutar antes del build en entornos limpios. |
| Smoke test del worker Excel | Aprobado: un archivo XLSX ficticio fue procesado y devolvió la hoja y valores esperados. | Faltan archivo corrupto, autorización, ruta inválida y comprobación de worker dentro del artefacto desplegado. |
| `docker compose config --quiet` | Aprobado; se retiró la propiedad obsoleta `version` para evitar advertencias del validador. | Repetir al cambiar el despliegue. |
| Pruebas funcionales/API con PostgreSQL, Redis y MinIO | No ejecutadas. No se confirmó un ambiente de integración disponible durante esta revisión. | Requieren infraestructura, datos y cuentas de prueba. |

### Hallazgos corregidos en esta revisión

1. **Dependencias AWS con versiones distintas:** el cliente S3 y el firmador tenían contratos de tipos de versiones diferentes. Se fijaron ambos paquetes a `3.1115.0`; el backend compila sin conversiones forzadas de tipos.
2. **Importación de `libreoffice-convert`:** la declaración instalada no funciona como módulo ESM. El worker carga su exportación CommonJS real mediante `createRequire` y declara el tipo de la función usada.
3. **Ruta y acceso al worker de importación Excel:** el endpoint apuntaba a un archivo inexistente y no exigía sesión ni permiso administrativo. Se corrigió la ruta, se exige permiso `administracion.configurar_plantillas_documentos`, se permiten solo archivos `.xlsx` y se rechazan rutas que salgan del proyecto incluso mediante enlaces simbólicos.
4. **Correo opcional en sesión:** el correo solo se asigna cuando el token trae un texto; evita asignar `null` a un campo tipado como string.
5. **Dashboard:** el destino de navegación se tipó con las claves reales de módulos. Además, se corrigió un tipo que infería el destino como cualquier cadena.
6. **Editor de mapeo de tarifas:** la interfaz enviaba índices numéricos de columna y omitía la fila de encabezados, mientras que la API valida letras de columna y exige ambas filas. Ahora se convierten índices a letras de Excel, se incluye la fila de encabezados y se mandan las columnas de precios con el formato esperado.
7. **Inicio de contenedores:** se quitó `--accept-data-loss` de `prisma db push`; ante un cambio que implique pérdida de datos, el inicio debe detenerse para que se revise la migración. También se eliminó `version` obsoleto de Compose.

## Riesgos y pruebas que siguen abiertas

- **Bloqueo crítico de seguridad:** archivos de entorno y configuración versionados contienen credenciales. Deben revocarse/rotarse, sustituirse por secretos fuera del repositorio y verificarse con Seguridad antes de usar datos reales o conectar producción. Este plan y los logs de prueba no deben incluir sus valores.
- El endpoint de importación Excel recibe una ruta relativa como dato de entrada. Aunque ahora exige autorización y limita rutas al proyecto, antes de producción debe definirse una carpeta aislada de archivos de entrada y comprobar la propiedad del documento. La carpeta del proyecto no debe tratarse como almacén de archivos de usuario.
- La ruta corregida debe probarse con un Excel real y con el artefacto de despliegue, porque compilar no demuestra por sí solo que el worker y sus dependencias estén incluidos en producción.
- El lint global sigue fallando con 92 errores y 74 advertencias; el lint de los archivos corregidos sí pasa. No se declara el sistema listo para producción mientras queden errores globales sin evaluar.
- El build frontend pasa, pero muestra advertencias por dos archivos de configuración de pnpm y por rastreo dinámico del endpoint de importación. Revisar el tamaño y contenido del artefacto de despliegue, incluido el worker.
- No hay runner de pruebas automatizadas configurado. Los casos anteriores son el plan de aceptación y requieren automatización progresiva, especialmente de las reglas críticas de OT, recepción, aprobación y envío.
- Las pruebas de correo institucional, despliegue, rendimiento y restauración dependen de TI de la USC y no se pueden certificar solo desde el repositorio.
