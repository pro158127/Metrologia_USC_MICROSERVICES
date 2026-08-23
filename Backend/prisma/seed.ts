import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

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

  // 4. Creación de la Función Genérica de Notificación
  console.log('⚡ Configurando función de notificación PL/pgSQL...');
  await prisma.$executeRawUnsafe(`
    CREATE OR REPLACE FUNCTION public.notify_cambio_tablas()
    RETURNS trigger
    LANGUAGE plpgsql
    AS $function$
    DECLARE
        tabla_nombre TEXT := TG_TABLE_NAME;
        operacion   TEXT := TG_OP;
        payload     JSON;
        row_data    JSON;
    BEGIN
        IF (TG_OP = 'DELETE') THEN
            row_data := row_to_json(OLD);
        ELSE
            row_data := row_to_json(NEW);
        END IF;

        payload := json_build_object(
            'tabla', tabla_nombre,
            'operacion', operacion,
            'data', row_data
        );

        PERFORM pg_notify('cambio_tablas', payload::text);

        RETURN NULL;
    END;
    $function$;
  `);

  // 5. Asignación Dinámica de Triggers en todas las tablas
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