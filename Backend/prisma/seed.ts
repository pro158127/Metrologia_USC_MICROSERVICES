import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// ==========================================
// 📦 SCHEMAS JSON PARA LAS PLANTILLAS
// ==========================================
const schemaCotizacion = {
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "templateType": "COTIZACION",
  "version": "9.0",
  "description": "Contrato de entrada para la plantilla de Cotización de Servicios de Calibración (R-CM003 Versión 9)",
  "fields": {
    "scalars": [
      { "key": "no_cotizacion", "label": "No. Cotización", "dataType": "STRING", "required": true },
      { "key": "fecha_cotizacion", "label": "Fecha de Cotización", "dataType": "DATE", "required": true },
      { "key": "empresa", "label": "Empresa / Cliente", "dataType": "STRING", "required": true },
      { "key": "nit", "label": "NIT", "dataType": "STRING", "required": true },
      { "key": "ciudad", "label": "Ciudad", "dataType": "STRING", "required": true },
      { "key": "telefono", "label": "Teléfono", "dataType": "STRING", "required": false },
      { "key": "contacto", "label": "Contacto", "dataType": "STRING", "required": true },

      { "key": "email", "label": "Correo Electrónico", "dataType": "STRING", "required": true },
      { "key": "descuento", "label": "Descuento", "dataType": "FLOAT", "required": true },
       { "key": "viaticos", "label": "Viaticos", "dataType": "FLOAT", "required": true },
      { "key": "total_cantidad_servicios", "label": "Total de Cantidad de Servicios", "dataType": "INTEGER", "required": true },
      { "key": "total_servicio", "label": "Subtotal / Total de Servicio", "dataType": "FLOAT", "required": true },
      { "key": "monto_total", "label": "Monto Total", "dataType": "FLOAT", "required": true }
    ],
    "tables": [
      {
        "key": "tabla_cotizacion_items",
        "label": "Detalle de Equipos y Servicios de Calibración",
        "required": true,
        "columns": [
          { "key": "equipo_puntos", "label": "Equipo / Número de puntos", "dataType": "STRING", "required": true },
          { "key": "tipo_servicio", "label": "Tipo de Servicio", "dataType": "STRING", "required": true },
          { "key": "magnitud", "label": "Magnitud", "dataType": "STRING", "required": true },
          { "key": "norma_guia_tecnica", "label": "Norma / Guía Técnica", "dataType": "STRING", "required": false },
          { "key": "cantidad", "label": "Cantidad", "dataType": "INTEGER", "required": true },
          { "key": "valor_unitario", "label": "Valor Unitario", "dataType": "FLOAT", "required": true },
          { "key": "valor_total", "label": "Valor Total", "dataType": "FLOAT", "required": true }
        ]
      },
      {
        "key": "tabla_control_cambios",
        "label": "Hoja de Control de Cambios del Formato",
        "required": false,
        "columns": [
          { "key": "no_version", "label": "N° Versión", "dataType": "STRING", "required": true },
          { "key": "fecha_cambio", "label": "Fecha de Cambio", "dataType": "DATE", "required": true },
          { "key": "descripcion", "label": "Descripción del Cambio", "dataType": "STRING", "required": true },
          { "key": "validacion_hoja_calculo", "label": "¿Se realiza validación de la hoja de cálculo?", "dataType": "STRING", "required": false },
          { "key": "observaciones", "label": "Observaciones", "dataType": "STRING", "required": false },
          { "key": "aprobo", "label": "Aprobó", "dataType": "STRING", "required": true }
        ]
      },
      {
  "key": "tabla_tarifas",
  "label": "Catálogo de tarifas",
  "required": true,
  "columns": [
    { "key": "instrumentos", "label": "Equipo / Número de puntos", "dataType": "STRING", "required": true },
    { "key": "tipo_servicio", "label": "Tipo de Servicio", "dataType": "STRING", "required": true },
    { "key": "magnitud", "label": "Magnitud", "dataType": "STRING", "required": true },
    { "key": "norma_guia_tecnica", "label": "Norma / Guía Técnica", "dataType": "STRING", "required": false },    
    // NUEVO CAMPO: Al ser "LIST", la UI que programamos permitirá clickear múltiples columnas
    { "key": "columnas_precios", "label": "Columnas de Precios Adicionales", "dataType": "LIST", "required": true }
  ]
}
    ]
  }
};

const schemaOrdenTrabajo = {
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "templateType": "ORDEN_TRABAJO",
  "version": "008",
  "description": "Contrato de entrada para la plantilla de Orden de Trabajo del Laboratorio de Metrología (R-CM005)",
  "fields": {
    "scalars": [
      { "key": "cert_razon_social", "label": "Datos Certificado - Razón Social", "dataType": "STRING", "required": true },
      { "key": "cert_nit", "label": "Datos Certificado - NIT", "dataType": "STRING", "required": true },
      { "key": "cert_email_certificados", "label": "Correo para envío de certificados de calibración", "dataType": "STRING", "required": true },
      { "key": "cert_fecha_limite_facturacion", "label": "Fecha límite para facturación", "dataType": "DATE", "required": false },
      { "key": "cert_direccion", "label": "Datos Certificado - Dirección", "dataType": "STRING", "required": true },
      { "key": "cert_ciudad", "label": "Datos Certificado - Ciudad", "dataType": "STRING", "required": true },
      { "key": "cert_email_factura", "label": "Correo para el envío de Factura", "dataType": "STRING", "required": true },
      { "key": "calib_interno_usc", "label": "Calibración Interno USC", "dataType": "BOOLEAN", "required": false },
      { "key": "calib_en_sitio", "label": "Calibración En sitio", "dataType": "BOOLEAN", "required": false },
      { "key": "calib_persona_contacto", "label": "Información Calibración - Persona a contactar", "dataType": "STRING", "required": false },
      { "key": "calib_telefono", "label": "Información Calibración - Teléfono", "dataType": "STRING", "required": false },
      { "key": "calib_fecha", "label": "Información Calibración - Fecha", "dataType": "DATE", "required": false },
      { "key": "calib_laboratorio_permanente", "label": "Calibración Laboratorio permanente", "dataType": "BOOLEAN", "required": false },
      { "key": "calib_hora", "label": "Información Calibración - Hora", "dataType": "STRING", "required": false },
      { "key": "solicitante_razon_social", "label": "Información Solicitante - Razón Social", "dataType": "STRING", "required": true },
      { "key": "solicitante_nit", "label": "Información Solicitante - NIT", "dataType": "STRING", "required": true },
      { "key": "no_orden_trabajo", "label": "Consecutivo - No. Orden de Trabajo", "dataType": "STRING", "required": true },
      { "key": "no_cotizacion", "label": "Consecutivo - No. Cotización", "dataType": "STRING", "required": true },
      { "key": "solicitante_direccion", "label": "Información Solicitante - Dirección", "dataType": "STRING", "required": true },
      { "key": "solicitante_ciudad", "label": "Información Solicitante - Ciudad", "dataType": "STRING", "required": true },
      { "key": "responsable", "label": "Consecutivo - Responsable", "dataType": "STRING", "required": true },
      { "key": "fecha_diligenciamiento", "label": "Consecutivo - Fecha de Diligenciamiento", "dataType": "DATE", "required": true },
      { "key": "solicitante_contacto", "label": "Información Solicitante - Contacto", "dataType": "STRING", "required": true },
      { "key": "solicitante_telefono", "label": "Información Solicitante - Teléfono", "dataType": "STRING", "required": true },
      { "key": "requiere_anexo_instrumentos", "label": "¿Requiere de un anexo para el ingreso de información de más instrumentos?", "dataType": "BOOLEAN", "required": true, "description": "Bandera booleana (SI/NO). Si es TRUE, activa el renderizado y mapeo de la tabla de anexo adicional." },
      { "key": "observaciones", "label": "Observaciones generales", "dataType": "STRING", "required": false }
    ],
    "tables": [
      {
        "key": "tabla_instrumentos_principal",
        "label": "Información de los Instrumentos (Principal - Ítems 1 al 10)",
        "required": true,
        "maxRowsLimit": 10,
        "columns": [
          { "key": "item", "label": "Ítem", "dataType": "INTEGER", "required": true },
          { "key": "tipo_servicio", "label": "Tipo de Servicio", "dataType": "STRING", "required": true },
          { "key": "instrumento", "label": "Instrumento", "dataType": "STRING", "required": true },
          { "key": "fabricante", "label": "Fabricante", "dataType": "STRING", "required": false },
          { "key": "modelo", "label": "Modelo", "dataType": "STRING", "required": false },
          { "key": "serie", "label": "Serie", "dataType": "STRING", "required": true },
          { "key": "codigo_interno", "label": "Código Interno / Inventario", "dataType": "STRING", "required": false },
          { "key": "ubicacion", "label": "Ubicación", "dataType": "STRING", "required": false },
         {
            "key": "puntos_calibracion",
            "label": "Puntos de Calibración (Hasta n)",
            "dataType": "LIST",
            "required": false
          },
          { "key": "unidad", "label": "Unidad", "dataType": "STRING", "required": false },
          { "key": "intervalo_medicion", "label": "Intervalo o Medición", "dataType": "STRING", "required": false },
          { "key": "resolucion_division", "label": "Resolución o División de escala", "dataType": "STRING", "required": false },
          { "key": "declaracion_conformidad", "label": "Declaración de Conformidad", "dataType": "STRING", "required": false },
          { "key": "emp_ajuste_control", "label": "EMP (Ajuste de Control)", "dataType": "STRING", "required": false },
          { "key": "documento_especificacion", "label": "Documento de Especificación", "dataType": "STRING", "required": false },
          { "key": "regla_decision", "label": "Regla de Decisión", "dataType": "STRING", "required": false }
        ]
      },
      {
        "key": "tabla_instrumentos_anexo",
        "label": "Anexo para Información de los Instrumentos Adicionales (Ítems 11 al 30)",
        "required": false,
        "dependsOn": { "fieldKey": "requiere_anexo_instrumentos", "value": true },
        "columns": [
          { "key": "item", "label": "Ítem", "dataType": "INTEGER", "required": true },
          { "key": "instrumento", "label": "Instrumento", "dataType": "STRING", "required": true },
          { "key": "marca", "label": "Marca", "dataType": "STRING", "required": false },
          { "key": "modelo", "label": "Modelo", "dataType": "STRING", "required": false },
          { "key": "serie", "label": "Serie", "dataType": "STRING", "required": true },
          { "key": "codigo_interno", "label": "Código Interno / Inventario", "dataType": "STRING", "required": false },
          { "key": "ubicacion", "label": "Ubicación", "dataType": "STRING", "required": false },
           {
            "key": "puntos_calibracion",
            "label": "Puntos de Calibración (Hasta n)",
            "dataType": "LIST",
            "required": false
          },
          { "key": "unidad", "label": "Unidad", "dataType": "STRING", "required": false },
          { "key": "intervalo_medicion", "label": "Intervalo o Medición", "dataType": "STRING", "required": false },
          { "key": "resolucion_division", "label": "Resolución o División de escala", "dataType": "STRING", "required": false },
          { "key": "declaracion_conformidad", "label": "Declaración de Conformidad", "dataType": "STRING", "required": false },
          { "key": "emp_limite_control", "label": "EMP (Límite de control)", "dataType": "STRING", "required": false },
          { "key": "documento_especificacion", "label": "Documento de Especificación", "dataType": "STRING", "required": false },
          { "key": "regla_decision", "label": "Regla de Decisión", "dataType": "STRING", "required": false }
        ]
      }
    ]
  }
};

const schemaRecepcion = {
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "templateType": "RECEPCION",
  "version": "004",
  "description": "Contrato de entrada para la plantilla de Recepción, Reporte y Entrega de Instrumentos del Laboratorio de Metrología (R-CM010 Versión 004)",
  "fields": {
    "scalars": [
      { "key": "nombre_quien_entrega", "label": "Nombre quién entrega", "dataType": "STRING", "required": true },
      { "key": "no_cotizacion", "label": "No. Cotización de Referencia (Cot)", "dataType": "STRING", "required": false },
      { "key": "sitio_laboratorio_permanente", "label": "Sitio de calibración - Laboratorio permanente", "dataType": "BOOLEAN", "required": false },
      { "key": "sitio_instalaciones_cliente", "label": "Sitio de calibración - Instalaciones del cliente", "dataType": "BOOLEAN", "required": false },
      { "key": "fecha_recepcion", "label": "Fecha de recepción", "dataType": "DATE", "required": true },
      { "key": "nombre_quien_recibe", "label": "Nombre quién recibe", "dataType": "STRING", "required": true },
      { "key": "fecha_salida", "label": "Fecha de salida", "dataType": "DATE", "required": false },
      { "key": "nombre_quien_empaca", "label": "Nombre quién empaca", "dataType": "STRING", "required": false },
      { "key": "accesorios", "label": "Accesorios", "dataType": "STRING", "required": false },
      { "key": "estado_bueno", "label": "Estado General - Bueno", "dataType": "BOOLEAN", "required": false },
      { "key": "estado_malo", "label": "Estado General - Malo", "dataType": "BOOLEAN", "required": false },
      { "key": "pruebas_pesaje_si", "label": "¿Se realizaron todas las pruebas a los equipos de pesaje? - SI", "dataType": "BOOLEAN", "required": false },
      { "key": "pruebas_pesaje_no", "label": "¿Se realizaron todas las pruebas a los equipos de pesaje? - NO", "dataType": "BOOLEAN", "required": false },
      { "key": "pruebas_pesaje_justificacion_no", "label": "Si la respuesta es NO, ¿Por qué?", "dataType": "STRING", "required": false },
      { "key": "nombre_quien_calibra", "label": "Nombre quién calibra", "dataType": "STRING", "required": false },
      { "key": "nombre_quien_recibe_servicio", "label": "Nombre quién recibe el servicio", "dataType": "STRING", "required": false }
    ],
    "tables": [
      {
        "key": "tabla_recepcion_instrumentos",
        "label": "Instrumentos Recibidos y Estado de Inspección",
        "required": true,
        "columns": [
          { "key": "instrumento", "label": "Instrumento", "dataType": "STRING", "required": true },
          { "key": "marca", "label": "Marca", "dataType": "STRING", "required": false },
          { "key": "modelo", "label": "Modelo", "dataType": "STRING", "required": false },
          { "key": "serie", "label": "Serie", "dataType": "STRING", "required": true },
          { "key": "codigo_interno", "label": "Código Interno / Inventario", "dataType": "STRING", "required": false },
          { "key": "resolucion", "label": "Resolución", "dataType": "STRING", "required": false },
          { "key": "tipo_sensor_int", "label": "Tipo sensor temp - Interno (Int)", "dataType": "BOOLEAN", "required": false },
          { "key": "tipo_sensor_ext", "label": "Tipo sensor temp - Externo (Ext)", "dataType": "BOOLEAN", "required": false },
          { "key": "estado_ibc_e", "label": "Estado del IBC - E", "dataType": "BOOLEAN", "required": false },
          { "key": "estado_ibc_t", "label": "Estado del IBC - T", "dataType": "BOOLEAN", "required": false },
          { "key": "estado_ibc_d", "label": "Estado del IBC - D", "dataType": "BOOLEAN", "required": false },
          { "key": "estado_ibc_a", "label": "Estado del IBC - A", "dataType": "BOOLEAN", "required": false },
          { "key": "estampilla", "label": "Estampilla", "dataType": "STRING", "required": false },
          { "key": "observaciones", "label": "Observaciones", "dataType": "STRING", "required": false }
        ]
      }
    ]
  }
};
// ==========================================


async function main() {
  console.log('🌱 Iniciando Proceso de Seeding...');

  // 0. Habilitación preventiva de la extensión vector (Fallback idempotente)
  await prisma.$executeRawUnsafe(`CREATE EXTENSION IF NOT EXISTS vector;`);

  // 1. Guardián: Verificar si la tabla "roles" existe en el esquema
  const tableCheck = await prisma.$queryRaw<{ exists: boolean }[]>`
    SELECT EXISTS (
      SELECT FROM information_schema.tables 
      WHERE table_schema = 'public' 
        AND table_name = 'roles'
    );
  `;

  if (!tableCheck[0]?.exists) {
    console.error('❌ Error: La tabla "roles" no existe. Ejecuta "prisma db push" o "prisma migrate deploy" antes del seed.');
    process.exit(1);
  }

  // 2. Inserción Idempotente de Roles
  const roles = [
    {
      id: 1,
      nombre: 'Secretaria',
      permisos: JSON.stringify({"permisos": {"clientes": {"consultar": true, "desactivar": false, "crear_editar": true, "ver_historial": true}, "revision": {"revisar_aprobar_acreditados": false, "revisar_aprobar_no_acreditados": false}, "ordenesOt": {"acceso": true}, "cotizaciones": {"crear_editar": true, "aprobar_rechazar": true, "enviar_al_cliente": true, "crear_version_corregida": true, "gestionar_catalogo_tarifas": false, "indicar_servicio_in_situ_laboratorio": true}, "administracion": {"gestionar_usuarios_roles": false, "consultar_bitacora_auditoria": false, "configurar_catalogo_parametros": false, "configurar_plantillas_documentos": false}, "entrega_y_envio": {"marcar_ot_pagada": true, "enviar_certificados_lotes": true, "previsualizar_antes_de_envio": true}, "ordenes_de_trabajo": {"ver_listado": true, "crear_editar": true, "cambiar_estado": true, "asignar_tecnico": true, "ver_bandeja_revision": false}, "recepcion_de_equipos": {"registrar": true, "generar_acta": true}, "calibracion_e_informes": {"adjuntar_pdf": false, "registrar_insumos_transporte": false}, "reportes_y_consolidados": {"exportar_base_de_datos": false, "ver_tablero_indicadores": false, "generar_consolidado_ventas": false, "ver_reportes_ext_vs_internos": false}, "firma_sello_y_certificacion": {"crear_version_corregida": false, "firmar_sellar_acreditados": false, "firmar_sellar_no_acreditados": false, "configurar_sello_logo_plantilla": false}}}),
      justificacion: 'Permisos por defecto para Secretaria',
      directrizDirector: false,
    },
    {
      id: 2,
      nombre: 'Director Técnico',
      permisos: JSON.stringify({"permisos": {"clientes": {"consultar": true, "desactivar": true, "crear_editar": true, "ver_historial": true}, "revision": {"revisar_aprobar_acreditados": true, "revisar_aprobar_no_acreditados": false}, "ordenesOt": {"acceso": true}, "cotizaciones": {"crear_editar": true, "aprobar_rechazar": true, "enviar_al_cliente": true, "crear_version_corregida": true, "gestionar_catalogo_tarifas": true, "indicar_servicio_in_situ_laboratorio": true}, "administracion": {"gestionar_usuarios_roles": true, "consultar_bitacora_auditoria": true, "configurar_catalogo_parametros": true, "configurar_plantillas_documentos": true}, "entrega_y_envio": {"marcar_ot_pagada": true, "enviar_certificados_lotes": true, "previsualizar_antes_de_envio": true}, "ordenes_de_trabajo": {"ver_listado": true, "crear_editar": true, "cambiar_estado": true, "asignar_tecnico": true, "ver_bandeja_revision": true}, "recepcion_de_equipos": {"registrar": true, "generar_acta": true}, "calibracion_e_informes": {"adjuntar_pdf": false, "registrar_insumos_transporte": true}, "reportes_y_consolidados": {"exportar_base_de_datos": true, "ver_tablero_indicadores": true, "generar_consolidado_ventas": true, "ver_reportes_ext_vs_internos": true}, "firma_sello_y_certificacion": {"crear_version_corregida": true, "firmar_sellar_acreditados": true, "firmar_sellar_no_acreditados": false, "configurar_sello_logo_plantilla": true}}}),
      justificacion: 'Permisos por defecto para Director',
      directrizDirector: false,
    },
    {
      id: 3,
      nombre: 'Técnico',
      permisos: JSON.stringify({"permisos": {"clientes": {"consultar": false, "desactivar": false, "crear_editar": false, "ver_historial": false}, "revision": {"revisar_aprobar_acreditados": false, "revisar_aprobar_no_acreditados": false}, "ordenesOt": {"acceso": false}, "cotizaciones": {"crear_editar": false, "aprobar_rechazar": false, "enviar_al_cliente": false, "crear_version_corregida": false, "gestionar_catalogo_tarifas": false, "indicar_servicio_in_situ_laboratorio": false}, "administracion": {"gestionar_usuarios_roles": false, "consultar_bitacora_auditoria": false, "configurar_catalogo_parametros": false, "configurar_plantillas_documentos": false}, "entrega_y_envio": {"marcar_ot_pagada": false, "enviar_certificados_lotes": false, "previsualizar_antes_de_envio": false}, "ordenes_de_trabajo": {"ver_listado": true, "crear_editar": false, "cambiar_estado": true, "asignar_tecnico": false, "ver_bandeja_revision": true}, "recepcion_de_equipos": {"registrar": true, "generar_acta": false}, "calibracion_e_informes": {"adjuntar_pdf": true, "registrar_insumos_transporte": true}, "reportes_y_consolidados": {"exportar_base_de_datos": false, "ver_tablero_indicadores": false, "generar_consolidado_ventas": false, "ver_reportes_ext_vs_internos": false}, "firma_sello_y_certificacion": {"crear_version_corregida": false, "firmar_sellar_acreditados": false, "firmar_sellar_no_acreditados": false, "configurar_sello_logo_plantilla": false}}}),
      justificacion: 'Permisos por defecto para Tecnico',
      directrizDirector: false,
    },
    {
      id: 4,
      nombre: 'Coordinadora',
      permisos: JSON.stringify({"permisos": {"clientes": {"consultar": true, "desactivar": false, "crear_editar": true, "ver_historial": true}, "revision": {"revisar_aprobar_acreditados": false, "revisar_aprobar_no_acreditados": true}, "ordenesOt": {"acceso": true}, "cotizaciones": {"crear_editar": true, "aprobar_rechazar": true, "enviar_al_cliente": true, "crear_version_corregida": true, "gestionar_catalogo_tarifas": true, "indicar_servicio_in_situ_laboratorio": true}, "administracion": {"gestionar_usuarios_roles": false, "consultar_bitacora_auditoria": false, "configurar_catalogo_parametros": true, "configurar_plantillas_documentos": true}, "entrega_y_envio": {"marcar_ot_pagada": true, "enviar_certificados_lotes": true, "previsualizar_antes_de_envio": true}, "ordenes_de_trabajo": {"ver_listado": true, "crear_editar": true, "cambiar_estado": true, "asignar_tecnico": true, "ver_bandeja_revision": true}, "recepcion_de_equipos": {"registrar": true, "generar_acta": true}, "calibracion_e_informes": {"adjuntar_pdf": false, "registrar_insumos_transporte": true}, "reportes_y_consolidados": {"exportar_base_de_datos": false, "ver_tablero_indicadores": true, "generar_consolidado_ventas": true, "ver_reportes_ext_vs_internos": true}, "firma_sello_y_certificacion": {"crear_version_corregida": true, "firmar_sellar_acreditados": false, "firmar_sellar_no_acreditados": true, "configurar_sello_logo_plantilla": false}}}),
      justificacion: 'Permisos por defecto para Coodinadora',
      directrizDirector: false,
    },
    {
      id: 5,
      nombre: 'Gestor Comercial',
      permisos: JSON.stringify({"permisos": {"clientes": {"consultar": true, "desactivar": true, "crear_editar": true, "ver_historial": true}, "revision": {"revisar_aprobar_acreditados": false, "revisar_aprobar_no_acreditados": false}, "ordenesOt": {"acceso": true}, "cotizaciones": {"crear_editar": true, "aprobar_rechazar": true, "enviar_al_cliente": true, "crear_version_corregida": true, "gestionar_catalogo_tarifas": true, "indicar_servicio_in_situ_laboratorio": true}, "administracion": {"gestionar_usuarios_roles": false, "consultar_bitacora_auditoria": false, "configurar_catalogo_parametros": false, "configurar_plantillas_documentos": false}, "entrega_y_envio": {"marcar_ot_pagada": false, "enviar_certificados_lotes": false, "previsualizar_antes_de_envio": false}, "ordenes_de_trabajo": {"ver_listado": true, "crear_editar": false, "cambiar_estado": true, "asignar_tecnico": true, "ver_bandeja_revision": true}, "recepcion_de_equipos": {"registrar": false, "generar_acta": false}, "calibracion_e_informes": {"adjuntar_pdf": false, "registrar_insumos_transporte": false}, "reportes_y_consolidados": {"exportar_base_de_datos": false, "ver_tablero_indicadores": true, "generar_consolidado_ventas": true, "ver_reportes_ext_vs_internos": true}, "firma_sello_y_certificacion": {"crear_version_corregida": false, "firmar_sellar_acreditados": false, "firmar_sellar_no_acreditados": false, "configurar_sello_logo_plantilla": false}}}),
      justificacion: 'Permisos por defecto para Gestor Comercial',
      directrizDirector: false,
    },
  ];

  for (const role of roles) {
    await prisma.$executeRaw`
      INSERT INTO public.roles ("ID_ROL_INCREMENT", "NOMBRE_ROL", "PERMISOS_JSON", "JUSTIFICACION", "DIRECTRIZ_DIRECTOR")
      VALUES (${role.id}, ${role.nombre}, ${role.permisos}::jsonb, ${role.justificacion}, ${role.directrizDirector})
      ON CONFLICT ("ID_ROL_INCREMENT") DO UPDATE SET
        "NOMBRE_ROL" = EXCLUDED."NOMBRE_ROL",
        "PERMISOS_JSON" = EXCLUDED."PERMISOS_JSON",
        "JUSTIFICACION" = EXCLUDED."JUSTIFICACION",
        "DIRECTRIZ_DIRECTOR" = EXCLUDED."DIRECTRIZ_DIRECTOR";
    `;
  }
  
  await prisma.$executeRaw`
    SELECT setval(pg_get_serial_sequence('public.roles', 'ID_ROL_INCREMENT'), COALESCE(MAX("ID_ROL_INCREMENT"), 1)) FROM public.roles;
  `;

  // 3. Inserción Idempotente del Usuario Base (Director Técnico)
  await prisma.$executeRaw`
    INSERT INTO public.usuarios (
      "ID_USUARIO_AUTO_INCREMENT", "NOMBRE_COMPLETO", "contraseña", "ID_ROL_FK", "CORREO_INSTITUCION", "CREATED_AT", "ESTADO", "intentos", "elminado"
    ) VALUES (
      1, 'Director del Sistema', '$argon2i$v=19$m=16,t=2,p=1$VHFlZTBZQmttYzNwbmpObQ$tHUMReyjgufFgA/xvhrugQ', 2, 'director@usc.edu.co', NOW(), true, 0, false
    )
    ON CONFLICT ("CORREO_INSTITUCION") DO NOTHING;
  `;

  await prisma.$executeRaw`
    SELECT setval(pg_get_serial_sequence('public.usuarios', 'ID_USUARIO_AUTO_INCREMENT'), COALESCE(MAX("ID_USUARIO_AUTO_INCREMENT"), 1)) FROM public.usuarios;
  `;

  // 4. Precarga de Plantillas de Excel e inicialización de versión con INPUT_SCHEMA
  console.log('🌱 Sembrando plantillas y esquemas JSON...');
  
  const plantillasSeed = [
    { modulo: 'COTIZACIONES', nombre: 'Cotización de Servicios de Calibración (R-CM003)', schema: schemaCotizacion },
    { modulo: 'ORDEN_TRABAJO', nombre: 'Orden de Trabajo (R-CM005)', schema: schemaOrdenTrabajo },
    { modulo: 'RECEPCION', nombre: 'Recepción, Reporte y Entrega de Instrumentos (R-CM010)', schema: schemaRecepcion },
  ];

  for (const p of plantillasSeed) {
    // Buscar si existe el documento base en "plantillas"
    let plantilla = await prisma.plantillas.findFirst({
      where: { MODULO: p.modulo }
    });

    // Si no existe, lo creamos
    if (!plantilla) {
      plantilla = await prisma.plantillas.create({
        data: {
          MODULO: p.modulo,
          NOMBRE: p.nombre,
          ACTIVA: true
        }
      });
      console.log(`✅ Registro base creado en "plantillas": ${p.nombre}`);
    }

    // Buscar si ya existe la primera versión de la plantilla con el input schema
    const versionExistente = await prisma.version_plantillas.findFirst({
      where: {
        ID_PLANTILLA_FK: plantilla.ID_PLANTILLA,
        VERSION: 1
      }
    });

    // Si no existe, generamos el primer release de `version_plantillas` vinculando los JSON
    if (!versionExistente) {
      await prisma.version_plantillas.create({
        data: {
          ID_PLANTILLA_FK: plantilla.ID_PLANTILLA,
          VERSION: 1,
          INPUT_SCHEMA: p.schema,
          ID_USUARIO_CREADOR_FK: 1, // Director Técnico como creador por defecto
          ESTADO: "PENDIENTE" 
        }
      });
      console.log(`✅ "version_plantillas" (V1) y "INPUT_SCHEMA" inyectados para: ${p.nombre}`);
    }
  }

  // Sincronizar secuencia de las plantillas por si acaso
  await prisma.$executeRaw`
    SELECT setval(pg_get_serial_sequence('public.plantillas', 'ID_PLANTILLA'), COALESCE(MAX("ID_PLANTILLA"), 1)) FROM public.plantillas;
  `;


  console.log('⚡ Configurando función de notificación PL/pgSQL segura...');
  await prisma.$executeRawUnsafe(`
    CREATE OR REPLACE FUNCTION public.notify_cambio_tablas()
    RETURNS trigger
    LANGUAGE plpgsql
    AS $function$
    DECLARE
        tabla_nombre TEXT := TG_TABLE_NAME;
        operacion   TEXT := TG_OP;
        payload     JSONB;
        row_data    JSONB;
    BEGIN
        IF (TG_OP = 'DELETE') THEN
            row_data := to_jsonb(OLD);
        ELSE
            row_data := to_jsonb(NEW);
        END IF;

        -- 💡 FILTRO DE SEGURIDAD: Remover solo las columnas gigantes para no exceder los 8KB
        IF (tabla_nombre = 'version_plantillas') THEN
            row_data := row_data - 'INPUT_SCHEMA' - 'MAPPING_CONFIG' - 'MAPEO_CONFIG' - 'MAPEO_EXCEL_JSON';
        ELSIF (tabla_nombre = 'calibraciones') THEN
            row_data := row_data - 'DATOS_TECNICOS_JSON';
        ELSIF (tabla_nombre = 'roles') THEN
            row_data := row_data - 'PERMISOS_JSON';
        END IF;

        payload := jsonb_build_object(
            'tabla', tabla_nombre,
            'operacion', operacion,
            'data', row_data
        );

        PERFORM pg_notify('cambio_tablas', payload::text);

        RETURN NULL;
    END;
    $function$;
  `);

  // 6. Asignación Dinámica de Triggers en todas las tablas
  console.log('⚡ Asignando triggers dinámicos en las tablas base...');
  await prisma.$executeRawUnsafe(`
    DO $$
    DECLARE
        r RECORD;
    BEGIN
        FOR r IN 
            SELECT table_name 
            FROM information_schema.tables 
            WHERE table_schema = 'public' 
              AND table_type = 'BASE TABLE'
              AND table_name NOT IN ('_prisma_migrations')
        LOOP
            EXECUTE format('DROP TRIGGER IF EXISTS trg_notify_cambios ON public.%I;', r.table_name);
            EXECUTE format('
                CREATE TRIGGER trg_notify_cambios
                AFTER INSERT OR UPDATE OR DELETE ON public.%I
                FOR EACH ROW EXECUTE FUNCTION public.notify_cambio_tablas();
            ', r.table_name);
        END LOOP;
    END $$;
  `);

  console.log('✅ Seeding completado exitosamente.');
}

main()
  .catch((e) => {
    console.error('❌ Error durante el seeding:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });