# Flujos de negocio por módulo: requisitos y código actual

**Sistema:** Gestión Administrativa del Laboratorio de Metrología USC
**Base de requisitos:** `Requerimientos_Metrologia_v6_revision_codigo.xlsx` (v6 y RF-47 a RF-50 añadidos en la revisión)
**Tipo de revisión:** lectura estática del Excel y del repositorio; no es una prueba de aceptación.

## Cómo leer los diagramas

En cada módulo se presentan dos flujos paralelos:

- **Flujo definido por requisitos:** interpretación del proceso esperado en el Excel.
- **Flujo observado en código:** lo que hacen hoy las pantallas, rutas y servicios localizados. Un paso faltante o diferente es una brecha; el diagrama no implica que el requisito esté satisfecho.

Los diagramas muestran decisiones de negocio y no cada llamada técnica. Los módulos de clientes, usuarios, administración, informes, cotizaciones, OT, recepción, calibración/revisión, firma/certificación, envío y reportes están agrupados en nueve secciones para facilitar la comparación.

## 1. Gestión de clientes (RF-01 a RF-04, RF-40)

### Flujo definido por requisitos

```mermaid
flowchart TD
 A[Usuario autorizado abre clientes] --> B{Crear, editar, buscar o consultar historial?}
 B -->|Crear| C[Capturar datos obligatorios y tipo de cliente]
 C --> D{NIT existente?}
 D -->|Sí| E[Mostrar cliente existente; no duplicar]
 D -->|No| F{Campos obligatorios completos?}
 F -->|No| G[Marcar campos y pedir corrección]
 F -->|Sí| H[Guardar cliente y dejar disponible para cotizar]
 B -->|Editar| I[Actualizar perfil y registrar auditoría]
 B -->|Desactivar| J{Es Director?}
 J -->|No| K[Denegar acción]
 J -->|Sí| L[Desactivar sin borrar historial]
 B -->|Buscar / historial| M[Filtrar por nombre, NIT, cotización o fechas]
 M --> N[Mostrar cotizaciones, OTs, certificados y facturas]
 N --> O{Exportar historial?}
 O -->|Sí| P[Generar Excel]
 O -->|No| Q[Fin]
```

### Flujo observado en código

```mermaid
flowchart TD
 A[Frontend de gestión de clientes] --> B[API clientes]
 B --> C{Autenticado y autorizado?}
 C -->|No| D[403 / error]
 C -->|Sí| E{Acción}
 E -->|Crear| F[Validar y persistir cliente]
 E -->|Editar| G[Actualizar perfil]
 E -->|Desactivar| H[Desactivar por permiso]
 E -->|Consultar| I[Buscar cliente y relaciones]
 I --> J[Retornar datos e historial disponible]
 F --> K[Respuesta a interfaz]
 G --> K
 H --> K
 J --> K
```

**Diferencia a validar:** los requisitos fijan roles y filtros detallados; el permiso real depende de la configuración de roles activa. La matriz, el seed y el texto de RF-02/RF-04 no coinciden completamente. La exportación completa del historial y sus filtros requieren validación funcional.

## 2. Gestión de cotizaciones (RF-05 a RF-12, RF-44 y RF-45; RF-IA-01 y RF-IA-06)

### Flujo definido por requisitos

```mermaid
flowchart TD
 A[Secretaría inicia cotización] --> B[Seleccionar cliente]
 B --> C{Cliente existe?}
 C -->|No| D[Crear cliente]
 C -->|Sí| E[Usar datos del cliente]
 D --> F[Agregar instrumentos desde catálogo de tarifas]
 E --> F
 F --> G[Indicar tipo de servicio y lugar: laboratorio/sitio]
 G --> H[Resolver magnitud, norma y precio de tarifa]
 H --> I[Ingresar cantidad; consolidar filas equivalentes]
 I --> J[Calcular subtotal, viáticos, descuento e IVA]
 J --> K{Datos e instrumentos completos?}
 K -->|No| L[Corregir; impedir guardar]
 K -->|Sí| M[Guardar borrador con consecutivo]
 M --> N[Generar y enviar PDF de cotización]
 N --> O{Cliente aprueba por enlace?}
 O -->|No / sin respuesta| P[Registrar rechazo o seguimiento]
 O -->|Sí| Q[Crear OT y recepción vinculadas]
 P --> R[Registrar contacto, fecha, canal y resultado]
 Q --> S[Fin]
 R --> S
```

### Flujo observado en código

```mermaid
flowchart TD
 A[Frontend cotización] --> B[API valida permisos y filas duplicadas]
 B --> C{Cliente y detalles recibidos?}
 C -->|No| D[Rechazar petición]
 C -->|Sí| E[Asignar consecutivo y persistir encabezado/detalles]
 E --> F[Calcular valores enviados por frontend/API]
 F --> G[Encolar documento/correo según acción]
 G --> H{Respuesta del cliente por enlace firmado?}
 H -->|No| I[Cron actualiza vencimiento/seguimiento según parámetros]
 H -->|Sí| J[Marcar aprobada y generar OT(s) y recepción(es)]
 I --> K[Consultar / editar]
 J --> K
 K --> L{OT asociada en estado protegido?}
 L -->|Sí| M[Bloquear edición de cotización]
 L -->|No| N[Editar detalles y sincronizar OT/recepción]
```

**Diferencias:** la aprobación efectiva se realiza por enlace del cliente; el cambio interno de estado no es el flujo principal. La creación de OT también está descrita en RF-13. El correo institucional y la respuesta real de entrega dependen de la configuración externa. El cotizador de IA es un widget demostrativo, no un asesor conectado al backend.

## 3. Órdenes de trabajo (RF-13 a RF-17; RF-IA-04 y RF-IA-07)

### Flujo definido por requisitos

```mermaid
flowchart TD
 A[Cotización aprobada] --> B[Crear OT con cliente e instrumentos]
 B --> C[Asignar uno o varios técnicos por instrumento/OT]
 C --> D[Definir fecha y lugar de calibración]
 D --> E[Notificar al técnico]
 E --> F[Mostrar OT en bandeja y seguimiento]
 F --> G{Recepción completa?}
 G -->|No| H[Completar datos de recepción]
 G -->|Sí| I[Pasar a calibración]
 I --> J[Subir informes y pasar a revisión]
 J --> K[Mostrar estados, contadores e historial]
```

### Flujo observado en código

```mermaid
flowchart TD
 A[Aprobación de cotización] --> B[Generador crea OT maestra y/o hijas por sitio]
 B --> C[Crear detalles OT y recepción enlazada]
 C --> D[Asignar técnicos mediante permisos/API]
 D --> E[Recepción completa y técnico asignado?]
 E -->|Sí| F[Evaluar FSM: En_recepción / Asignada]
 E -->|No| G[Mantener estado alcanzado]
 F --> H[Calibración y estampilla detectadas?]
 H -->|Sí| I[Evaluar estado de calibración]
 H -->|No| G
 I --> J{Certificado aprobado en algún instrumento?}
 J -->|Sí| K[Avanzar a Certificado_en_revisión]
 J -->|No| G
 K --> L{Todos aprobados?}
 L -->|Sí| M[Certificado_aprobado]
 L -->|No| G
 M --> N{Pago registrado?}
 N -->|Sí| O[Certificado_enviado según FSM]
 N -->|No| G
```

**Diferencias:** la FSM avanza de forma monotónica y el criterio observado para `Certificado_en_revisión` es que exista un certificado aprobado; el requisito espera que la carga completa de informes inicie revisión. El permiso para asignar y ver la bandeja cambia entre matriz y seed. La cardinalidad de técnico compartido por instrumento no está definida.

## 4. Recepción de equipos (RF-18 a RF-20, RF-49; flujo relacionado RF-47 y RF-48)

### Flujo definido por requisitos

```mermaid
flowchart TD
 A[Recibir físicamente instrumentos] --> B[Relacionar recepción con cliente, cotización y OT]
 B --> C[Registrar persona que entrega, fecha y datos por instrumento]
 C --> D[Seleccionar instrumento y resolver sus datos desde tarifas]
 D --> E[Registrar estado IBC de entrada]
 E --> F{Repetido el mismo instrumento/tarifa?}
 F -->|Sí| G[Agregar cantidad a la línea de cotización correcta]
 F -->|No| H[Crear línea con magnitud, servicio, norma y tarifa]
 G --> I[Guardar recepción y actualizar OT/cotización en transacción]
 H --> I
 I --> J[Generar acta R-CM010 con IBC: true=✓, false=✗]
 J --> K[Completar salida cuando el equipo se entrega físicamente]
 K --> L[Registrar fecha, receptor, empacador, accesorios e IBC de salida]
 L --> M[Dejar datos pendientes visibles y notificar retraso según regla]
```

### Flujo observado en código

```mermaid
flowchart TD
 A[Crear recepción] --> B[API busca o crea cotización]
 B --> C[Crear detalles cotización por instrumento: cantidad 1, magnitud n/a, precio 0]
 C --> D[Crear OT y detalles]
 D --> E[Crear recepción y detalles]
 E --> F[Guardar como BORRADOR o RECIBIDO]
 F --> G{RECIBIDO y datos/IBC de entrada completos?}
 G -->|No| H[409; no guardar como definitivo]
 G -->|Sí| I[Evaluar estado OT y encolar acta Excel]
 I --> J[Editar recepción]
 J --> K[Sincronizar detalles por ITEM/posición]
 K --> L[Sincronizar líneas de cotización: agrupar por nombre y buscar tarifa]
 L --> M[Encolar regeneración de acta]
 M --> N[Entrega/envío calcula salida completa]
 N --> O{IBC salida y campos de salida completos?}
 O -->|No| P[Bloquear comprobante y envío; listar faltantes]
 O -->|Sí| Q[Permitir comprobante/envío si certificados aprobados]
```

**Diferencia clave:** la creación inicial no usa la sincronización por tarifas; la sincronización de cotización por tarifa ocurre en actualización. Además, la API de envío usa la salida física como condición previa de pago/comprobante y correo de certificados. Esto mezcla dos hechos distintos: que el laboratorio finalizó y notificó el certificado, y que el cliente recogió físicamente los instrumentos.

## 5. Calibración e informes (RF-21 a RF-23, RF-50; RF-IA-02 y RF-IA-03)

### Flujo definido por requisitos

```mermaid
flowchart TD
 A[OT asignada] --> B[Técnico realiza calibración fuera del sistema]
 B --> C[Adjuntar PDF por instrumento]
 C --> D{Todos los PDFs e instrumentos completos?}
 D -->|No| E[Mostrar pendientes]
 D -->|Sí| F[Enviar certificados a revisión independiente]
 F --> G{Aprobado por revisor distinto?}
 G -->|No| H[Registrar motivo y devolver al técnico]
 H --> C
 G -->|Sí| I[Guardar aprobación y bitácora]
 I --> J[Identificar calibrador asignado en documento]
 J --> K[Registrar equipos usados para trabajo en sitio, si aplica]
```

### Flujo observado en código

```mermaid
flowchart TD
 A[Técnico consulta OT asignadas] --> B[Sube PDF para instrumento de recepción]
 B --> C{Es técnico asignado y archivo válido?}
 C -->|No| D[Rechazar]
 C -->|Sí| E[Guardar documento/calibración y certificado PENDIENTE_REVISION]
 E --> F[Evaluar FSM OT]
 F --> G[Revisor lista certificados que puede revisar]
 G --> H{Aprueba o rechaza?}
 H -->|Rechaza| I[Guardar motivo y retornar estado de calibración]
 H -->|Aprueba| J[Marcar APROBADO y encolar PDF sellado si hay plantilla]
 J --> K[Actualizar estado/contador de OT]
```

**Diferencias:** la ruta de lista filtra el propio certificado del técnico, pero las mutaciones de aprobar/rechazar deben aplicar el mismo control en servidor. El nombre del técnico en el campo “calibró” no se completa de forma comprobada por instrumento. No se identificó el flujo requerido de IA/análisis de anomalías. La bitácora de equipos usados en sitio requiere verificar acceso y alcance de visibilidad.

## 6. Firma, sello y certificación (RF-24 a RF-28)

### Flujo definido por requisitos

```mermaid
flowchart TD
 A[Certificado listo para revisión] --> B[Revisor distinto verifica contenido]
 B --> C{Informe correcto y tipo acreditado definido?}
 C -->|No| D[Devolver con observación]
 C -->|Sí| E[Aplicar plantilla, logo, sello y firma autorizados]
 E --> F[Generar certificado final y bloquear edición]
 F --> G[Conservar original y versiones/correcciones trazables]
```

### Flujo observado en código

```mermaid
flowchart TD
 A[Revisor aprueba certificado] --> B{Plantilla/sello configurado?}
 B -->|Sí| C[Encolar composición PDF con plantilla/sello]
 B -->|No| D[Conservar PDF original]
 C --> E[Guardar PDF procesado/versión]
 D --> F[Disponible para entrega]
 E --> F
 G[Configuración administrativa] --> H[Gestionar plantillas/sellos según permisos]
```

**Diferencia:** composición visual de PDF y sello no equivale por sí sola a firma digital criptográfica verificable. La inmutabilidad, la firma electrónica y la regla de corrección deben definirse y comprobarse de manera diferenciada.

## 7. Entrega y envío (RF-29 a RF-31, RF-47 y RF-48)

### Flujo definido por requisitos

```mermaid
flowchart TD
 A[Certificados por OT/cotización] --> B{Todos aprobados?}
 B -->|No| C[Mostrar certificados pendientes]
 B -->|Sí| D[Previsualizar documentos]
 D --> E{Comprobante de pago registrado?}
 E -->|No| F[Subir comprobante]
 E -->|Sí| G[Enviar por correo y registrar resultado]
 F --> G
 G --> H[Fin del flujo electrónico]
```

### Flujo observado en código

```mermaid
flowchart TD
 A[Lista de entrega] --> B[Mostrar cotizaciones cuyas OTs hijas estén aprobadas]
 B --> C[Leer certificados, comprobantes y recepción/salida]
 C --> D{Todos aprobados?}
 D -->|No| E[Deshabilitar comprobante/envío]
 D -->|Sí| F{Entrega física completa?}
 F -->|No| G[Deshabilitar comprobante y envío; listar faltantes de salida]
 F -->|Sí| H{Comprobante existente?}
 H -->|No| I[Subir PDF/imagen; marcar pago y crear factura]
 H -->|Sí| J[Encolar correo de certificados]
 I --> J
 J --> K[Marcar OT como Certificado_enviado antes de resultado SMTP]
```

**Discordancia de negocio:** el bloqueo actual impide enviar certificados antes de diligenciar la salida física. Si el proceso del laboratorio permite notificar primero y que el cliente recoja después, este gate genera bloqueos artificiales. Recomendación: conservar como obligatorios los controles técnicos y económicos de envío —todos los certificados aprobados, comprobante/pago según la política acordada y correo válido—; llevar la entrega física a un estado independiente `Pendiente de retiro / Entregado`, que puede completarse después. Si el laboratorio quiere dejar el comprobante registrado antes del pago real, debe definirse como “comprobante recibido/en validación”, sin marcar automáticamente `PAGADO`.

**Otro riesgo:** al encolar el correo, la OT se marca `Certificado_enviado` antes de confirmar resultado. Se recomienda estados separados `En cola`, `Enviado`, `Fallido` y `Reintento`, con auditoría del worker.

## 8. Reportes y consolidados (RF-32 a RF-35, RF-41 y RF-46; RF-IA-05 y RF-IA-08 a RF-IA-10)

### Flujo definido por requisitos

```mermaid
flowchart TD
 A[Usuario con permiso abre reportes] --> B[Elegir rango, servicio interno/externo y filtros]
 B --> C[Consultar cotizaciones, OTs, certificados y facturas]
 C --> D[Calcular ventas, servicios e indicadores]
 D --> E{Vista, búsqueda de certificado o exportación?}
 E -->|Vista| F[Mostrar dashboard/consolidado]
 E -->|Certificado| G[Buscar por NIT o número]
 E -->|Exportación| H[Generar archivo de base/reporte]
 F --> I[Fin]
 G --> I
 H --> I
```

### Flujo observado en código

```mermaid
flowchart TD
 A[Frontend reportes] --> B[GET reportes con filtros]
 B --> C[Servicio obtiene y agrega datos]
 C --> D[Retornar métricas al dashboard]
 A --> E[Solicitar exportación PDF/Excel]
 E --> F[Validar permiso y encolar job]
 F --> G[Usuario consulta job]
 G --> H{Estado del job}
 H -->|Pendiente/activo| I[Mostrar progreso]
 H -->|Completado| J[Entregar URL de descarga]
 H -->|Fallido| K[Mostrar error]
```

**Diferencias:** no todos los criterios de trazabilidad factura↔OT↔certificados, búsqueda y exportación están demostrados por el endpoint general; deben validarse en datos representativos. Las funciones narrativas/predictivas de IA no están conectadas.

## 9. Administración del sistema (RF-36 a RF-39, RF-42 y RF-43)

### Flujo definido por requisitos

```mermaid
flowchart TD
 A[Administrador autorizado] --> B{Usuarios, permisos, plantillas, parámetros o auditoría?}
 B -->|Usuarios/permisos| C[Crear o actualizar cuenta y rol]
 B -->|Plantillas| D[Configurar formatos documentales autorizados]
 B -->|Parámetros| E[Configurar catálogos y reglas]
 B -->|Auditoría| F[Consultar historial protegido]
 C --> G[Guardar con controles de acceso]
 D --> G
 E --> G
 F --> H[Mostrar historial sin alterar registros]
```

### Flujo observado en código

```mermaid
flowchart TD
 A[Usuario autenticado] --> B[Autorización por permisos del rol]
 B --> C{Acción administrativa}
 C -->|Usuarios/roles| D[API usuarios]
 C -->|Plantillas/sellos| E[API plantillas y sellos]
 C -->|Parámetros| F[API parámetros]
 C -->|Auditoría| G[API bitácora/audit]
 D --> H[Persistir cambios]
 E --> H
 F --> H
 G --> I[Consultar eventos guardados]
 H --> J[Responder y notificar cambios]
```

**Diferencias:** la asignación de permisos para plantillas, logos y sellos no es uniforme entre matriz, seed e interfaz. Los RF-42/RF-43 dependen del despliegue/arquitectura y no se prueban con la mera existencia de una pantalla.

## 10. Inteligencia artificial (RF-IA-01 a RF-IA-10 y RNF-IA)

### Flujo definido por requisitos

```mermaid
flowchart TD
 A[Usuario solicita sugerencia/análisis] --> B[Recolectar datos permitidos en modo lectura]
 B --> C[Aplicar controles de privacidad y límites de costo]
 C --> D[Enviar consulta a proveedor aprobado]
 D --> E[Recibir sugerencia o resumen]
 E --> F[Mostrar como recomendación, nunca modificar datos]
 F --> G{Usuario decide aplicarla?}
 G -->|Sí| H[Usuario ejecuta el cambio manualmente en módulo autorizado]
 G -->|No| I[Descartar sugerencia]
```

### Flujo observado en código

```mermaid
flowchart TD
 A[Usuario abre widget IA] --> B[Interfaz demostrativa]
 B --> C[Mostrar conversación/respuesta simulada]
 C --> D[No se encontró llamada funcional a backend/proveedor]
 D --> E[No consulta ni cambia datos de negocio]
```

**Diferencia:** los requisitos de IA son alcance adicional sin servicio de IA integrado. Además, el Excel menciona herramientas de NestJS aunque la API del proyecto está construida con Fastify. Tratar como fase futura hasta decidir proveedor, privacidad, controles, presupuesto e integración.

## Revisión especial: altas, cambios y bajas de instrumentos en recepción

### Qué ocurre hoy

1. **Nueva recepción independiente:** la ruta crea la cotización si hace falta y agrega una línea por instrumento con `CANTIDAD=1`, `MAGNITUD='n/a'`, `VALOR_UNITARIO=0` y total cero. No consulta `tarifas` ni agrupa nombres repetidos en esta ruta.
2. **Selector de instrumento:** el datalist muestra como valor una etiqueta compuesta (`magnitud - tipo de servicio (instrumento)`). Al seleccionarla, ese texto puede quedar guardado como `instrumento`, en vez del nombre canónico. Esto dificulta o impide la búsqueda correcta en tarifas.
3. **Edición de recepción:** se llama a `sincronizarCotizacionDesdeRecepcion`. Este agrupa por el texto de nombre exacto y reconstruye una línea por nombre, pero busca tarifa por nombre exacto y luego por prefijo. Si no resuelve, acepta magnitud `n/a` y precio cero. Las líneas existentes se buscan por nombre sin restringir tipo de servicio ni sitio, y puede reutilizar precio/magnitud/norma de otra combinación.
4. **Edición con sitio cambiado:** la sincronización recibe el sitio anterior guardado (`actual.SITIO_CALIBRACION`), no necesariamente el nuevo valor enviado en el formulario.
5. **Eliminar instrumento:** el endpoint hace soft-delete de recepción y de un detalle OT seleccionado por `ITEM` o nombre; sincroniza cotización y conserva registro histórico. El emparejamiento por nombre/posición puede ser ambiguo si existen instrumentos duplicados del mismo tipo.
6. **Modificar instrumento:** la actualización empareja primero por `ITEM`/posición. Cambiar el nombre, serie o datos de una fila puede actualizar el mismo registro al que ya se relaciona una calibración/certificado; no se observó bloqueo por certificado existente. Esto puede alterar la identidad que se muestra en un documento histórico.
7. **Bloqueos de edición:** la API de cotizaciones sí verifica estados protegidos de sus OTs; los endpoints `PUT /recepciones/:id`, soft-delete de instrumento y soft-delete de recepción no hacen una validación equivalente del estado de la OT. Por ello, la restricción visual de campos raíz no protege las operaciones directas de instrumentos ni el API.
8. **Versionado:** cada actualización de recepción genera consecutivo de versión aun cuando cambien datos menores; la modificación de datos de recepción por sí sola no cambia el consecutivo OT salvo cambios de instrumentos detectados. El versionado debería distinguir cambio documental, cambio de identidad y corrección administrativa.

### Qué debería ocurrir

- Identificar la tarifa por una clave estable (`ID_TARIFA`) y mantener separados **instrumento**, **magnitud**, **tipo de servicio**, **norma**, **sitio** y **precio cotizado**. No usar una etiqueta visual como valor persistido.
- Al aceptar un instrumento, resolver exactamente una tarifa vigente. Si hay cero o más de una coincidencia válida, mostrar error y pedir selección explícita; no guardar silencio con tarifa cero o prefijo ambiguo.
- Agrupar solo cuando coincidan los atributos comerciales (tarifa/tipo de servicio/sitio y, según regla, misma clase/modelo). Mantener además una fila por instrumento físico en recepción/OT, porque cada número de serie y certificado es individual. La cantidad de cotización es la suma de esos instrumentos.
- Hacer creación/actualización de recepción, cotización y OT en una transacción. Antes de confirmar, comparar el número de instrumentos por categoría y avisar el precio/total recalculado. No alterar cotizaciones ya enviadas/aprobadas sin una nueva versión y aprobación del cliente.
- Permitir cambios de datos logísticos mientras la OT está en estados iniciales, con auditoría. Bloquear cambio de identidad, tipo de servicio, tarifa/cantidad y eliminación de instrumentos desde que haya asignación/calibración iniciada (`En_calibración` o posterior), certificado generado o envío. Excepción administrativa: crear corrección/versionado y conservar intacto el certificado anterior.
- Alinear validación en frontend y backend. El backend debe ser autoridad; comprobar el estado de OT de forma transaccional en `PUT`, baja de instrumento y baja de recepción. No confiar en controles deshabilitados de pantalla.
- Para retirada física después de enviar certificados, registrar la salida posteriormente como un evento independiente. El certificado puede enviarse cuando esté aprobado y se cumpla la política de pago; la recepción física puede permanecer `Pendiente de retiro`.

### Matriz recomendada de qué se permite por etapa

| Etapa de la OT | Corregir datos logísticos de recepción | Agregar instrumento | Cambiar instrumento/servicio | Eliminar instrumento |
|---|---:|---:|---:|---:|
| `Creada` / antes de iniciar calibración | Sí, con historial | Sí, recalculando cotización/OT | Sí, con tarifa explícita y versión | Sí, baja lógica y ajuste comercial |
| `En_recepción` / `Asignada`, aún sin calibración ni certificado | Sí, con auditoría | Solo con autorización y revalidar asignación/cantidad | Solo si se invalida/reasigna el trabajo y queda versionado | Solo con autorización; retirar asignación y ajustar cotización |
| `En_calibración` o posterior | Solo campos no técnicos y sin cambiar el documento cerrado | No en la misma OT; usar modificación formal/OT adicional | No; corrección formal que conserva el original | No; anular/corregir con aprobación y trazabilidad |
| Certificado enviado | Corregir únicamente datos de contacto/logística sin reescribir certificado | No | No | No; emitir corrección/revocación según política documental |

La etapa de OT no siempre describe el estado real de cada instrumento, porque el trabajo puede estar distribuido. Para decisiones definitivas, conviene validar por **instrumento** la existencia de asignación, calibración y certificado, y por OT el bloqueo general.

## Recomendación de negocio para el conflicto entrega física vs. envío digital

El comportamiento actual exige diligenciar la salida física antes de subir el comprobante y enviar los certificados. Eso no representa el caso que describe el área: el certificado puede remitirse cuando el cliente aún no ha recogido sus instrumentos.

Se recomienda separar dos procesos:

1. **Cierre técnico y envío digital:** todos los certificados aprobados → comprobar pago según política institucional → enviar certificados → registrar resultado real del correo.
2. **Entrega física:** cuando el cliente recoge → registrar fecha/hora, quién entrega y recibe, accesorios, IBC de salida y estado de retiro. Antes de ese momento mostrar `Pendiente de retiro`, sin bloquear el envío digital.

La excepción es una regla contractual o de seguridad explícita que prohíba liberar documentos hasta registrar salida. Si esa regla existe, debe decir “prohibido enviar antes de la entrega física” y el laboratorio debe confirmar que corresponde a su proceso. De lo contrario, `RF-47` no debe ser condición del correo: mantenerlo como requisito para cerrar la entrega física. También es necesario distinguir “comprobante cargado”, “pago validado” y “pago realizado”; actualmente subir el archivo marca la OT como `PAGADO`.

## Archivos y evidencia revisada

- Excel revisado: `outputs/revision_metrologia_v6/Requerimientos_Metrologia_v6_revision_codigo.xlsx`, hojas `RF - Req. Funcionales`, `Matriz de Roles`, `Coherencia de negocio`.
- Recepción y sincronización: `Backend/src/routes/recepciones.routes.ts`, `Backend/src/services/cotizacion-sync.service.ts`, `Frontend/app/dashboard/module/recepciones.tsx`.
- Estados y envío: `Backend/src/services/ot-fsm.service.ts`, `Backend/src/routes/envios.routes.ts`, `Frontend/app/dashboard/module/Envio_entrega.tsx`.
- Cotización/OT: `Backend/src/routes/cotizaciones.routes.ts`, `Backend/src/services/cotizacion-aprobacion.service.ts`, `Backend/src/services/ot-split.service.ts`.
- Calibración, revisión, reportes y administración: rutas y pantallas correspondientes bajo `Backend/src/routes/` y `Frontend/app/dashboard/module/`.

**Alcance de la conclusión:** diagramas basados en texto de requisitos y lectura del código. No se ejecutaron pruebas de interfaz, API, base de datos, correo ni despliegue; los comportamientos señalados deben confirmarse en un entorno de prueba antes de liberar cambios.
