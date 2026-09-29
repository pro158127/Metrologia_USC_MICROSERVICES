import { Prisma, PrismaClient } from '@prisma/client';
import exceljs from 'exceljs';
import { Job } from 'bullmq';
import { GenerarExcelBody, MappingConfig, mappingConfigSchema } from '../routes/plantillas-generacion.schemas.js';
import { s3Client, BUCKET_NAME } from '../lib/s3Client.js';
import { GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { Readable } from 'stream';
import { promisify } from 'util';
import { urls_schema,url } from '../routes/schema-checkStatus.js'; 

// 1. Declaramos el módulo con la ruta exacta para satisfacer al linter de TypeScript
declare module 'libreoffice-convert/index.js';

// 2. Importamos el paquete apuntando directamente al archivo final (la oficina exacta)
import { convert } from 'libreoffice-convert/index.js';
  
const prisma = new PrismaClient();

function inyectarValorSeguro(cell: exceljs.Cell, newValue: any) {
  let valorLimpio = newValue;
  
  if (valorLimpio === undefined) {
    valorLimpio = null;
  } else if (typeof valorLimpio === 'object' && valorLimpio !== null) {
    if (typeof valorLimpio.toNumber === 'function') {
      valorLimpio = valorLimpio.toNumber();
    } else if (!(valorLimpio instanceof Date)) {
      valorLimpio = valorLimpio.toString(); 
    }
  }

  cell.value = valorLimpio;
  
  // ✅ CORRECCIÓN: Usar delete en lugar de strike: false
  if (cell.font) {
    const fuenteCelda = { ...cell.font };
    delete fuenteCelda.strike;
    cell.font = fuenteCelda;
  }
}
  //cotizaciones_pasrse

export function resolverDatosCotizacionConCeldas(cotizacion: any, mappingConfig: MappingConfig) {
  const scalarsResult: Array<{ key: string; cell: string; value: any; sheet?: string }> = [];
  
  // Nueva estructura de retorno para tablas
  const tablesResult: Array<{
    key: string;
    sheetName: string;
    startRow: number;
    endRow: number;
    header_row?: number;
    rowCells: Array<{ key: string; column: string; row: number; cell: string; value: any }>;
  }> = [];
const scalarMap: Record<string, any> = {
    no_cotizacion: cotizacion.CODIGO_COTIZACION,
    fecha_cotizacion: cotizacion.CREATED_AT,
    empresa: cotizacion.clientes?.RAZON_SOCIAL || 'No registrada',
    nit: cotizacion.clientes?.NIT || 'N/A',
    ciudad: cotizacion.clientes?.ciudad || 'N/A',
    telefono: cotizacion.clientes?.TELEFONO || 'No registrado', // ✅ Fallback añadido
    contacto: cotizacion.clientes?.NOMBRE_CONTACTO || 'N/A',
    email: cotizacion.clientes?.CORREO || 'N/A',
    total_cantidad_servicios: cotizacion.cotizacion_detalles?.reduce((acc: number, item: any) => acc + (item.CANTIDAD || 0), 0),
    total_servicio: cotizacion.MONTO_TOTAL,
    descuento: cotizacion.descuento || 0, // ✅ Falta mapear la llave del JSON
   viaticos: Number(cotizacion.viaticos || 0), // ✅ Falta mapear la llave del JSON
    monto_total: Number(cotizacion.MONTO_TOTAL || 0) + Number(cotizacion.viaticos || 0),
  };

  // 1. Mapeo de Escalares
  for (const scalar of mappingConfig.mappings.scalars) {
    if (scalarMap[scalar.key] !== undefined) {
      scalarsResult.push({
        key: scalar.key,
        cell: scalar.cell,
        value: scalarMap[scalar.key],
        sheet: scalar.sheet, // ✅ Propiedad agregada
      });
    }
  }

  // 2. Mapeo de Tablas con metadatos de bloque
  for (const tableConfig of mappingConfig.mappings.tables) {
    if (tableConfig.key === 'tabla_cotizacion_items') {
      const sheetName = tableConfig.sheet || 'Sheet1';
      const startRow = tableConfig.startRow;
      const header_row = tableConfig.star_header; // Basado en tu interfaz (cuidado con el typo en la BD)
      let currentRow = startRow;
      
      const rowCells: Array<{ key: string; column: string; row: number; cell: string; value: any }> = [];

      const detalles = cotizacion.cotizacion_detalles || [];
      
      for (const item of detalles) {
        for (const col of tableConfig.columns) {
          if (!col.column) continue;

          let rawValue: any = undefined;
          switch (col.key) {
            case 'equipo_puntos': rawValue = item.EQUIPO_DESCRIPCION; break;
            case 'tipo_servicio': rawValue = item.TIPO_SERVICIO; break;
            case 'magnitud': rawValue = item.MAGNITUD; break;
            case 'norma_guia_tecnica': rawValue = item.NORMA_TECNICA; break;
            case 'cantidad': rawValue = item.CANTIDAD; break;
            case 'valor_unitario': rawValue = item.VALOR_UNITARIO; break;
            case 'valor_total': rawValue = item.VALOR_TOTAL; break;
          }

          rowCells.push({
            key: col.key,
            column: col.column,
            row: currentRow,
            cell: `${col.column}${currentRow}`,
            value: rawValue,
          });
        }
        currentRow++;
      }

      // Calculamos dinámicamente dónde terminó de escribir la tabla
      const endRow = currentRow > startRow ? currentRow - 1 : startRow;

      tablesResult.push({
        key: tableConfig.key,
        sheetName,
        startRow,
        endRow, // ✅ Límite inferior dinámico calculado
        header_row,
        rowCells, // ✅ Arreglo plano de celdas listas para iterar
      });
    }
  }

  return { scalars: scalarsResult, tables: tablesResult };
}
////parse   Ordenenes de trabajo 

export function resolverDatosOrdenTrabajoConCeldas(ordenTrabajo: any, mappingConfig: MappingConfig) {
  const scalarsResult: Array<{ key: string; cell: string; value: any; sheet?: string }> = [];
  
  const tablesResult: Array<{
    key: string;
    sheetName: string;
    startRow: number;
    endRow: number;
    header_row?: number;
    rowCells: Array<{ key: string; column: string; row: number; cell: string; value: any }>;
  }> = [];

  // 1. Diccionario de mapeo de Escalares basado en tu modelo ordenes_trabajo
const scalarMap: Record<string, any> = {
    cert_razon_social: ordenTrabajo.Razon_social,
    cert_nit: ordenTrabajo.NIT,
    cert_email_certificados: ordenTrabajo.CORREO_CERTIFICADO,
    cert_fecha_limite_facturacion: ordenTrabajo.FECHA_LIMITE_FACTURACION,
    cert_direccion: ordenTrabajo.dirrecion,
    cert_ciudad: ordenTrabajo.ciudad,
    cert_email_factura: ordenTrabajo.CORREO_FACTURA,
    calib_interno_usc: ordenTrabajo.ES_INTERNO_USC ? 'X' : '', 
    calib_en_sitio: ordenTrabajo.ES_EN_SITIO ? 'X' : '',
    calib_persona_contacto: ordenTrabajo.PERSONA_CONTACTO,
    calib_telefono: ordenTrabajo.TELEFONO_CONTACTO,
    calib_fecha: ordenTrabajo.FECHA_CALIBRACION,
    calib_laboratorio_permanente: ordenTrabajo.ES_LAB_PERMANENTE ? 'X' : '',
    
    // ✅ CORRECCIÓN 1: Usar la hora real del evento de calibración
    calib_hora: ordenTrabajo.HORA_CALIBRACION || ordenTrabajo.hora, 
    
    // ✅ CORRECCIÓN 2: Usar el campo exclusivo del solicitante
    solicitante_razon_social: ordenTrabajo.razon_social_solicitante, 
    
    solicitante_nit: ordenTrabajo.NIT_solicitante,
    
    // Nota técnica: Priorizamos CODIGO_OT que es el Unique ID formal de tu Prisma
    no_orden_trabajo: ordenTrabajo.CODIGO_OT || ordenTrabajo.no_orden_trabajo, 
    
    no_cotizacion: ordenTrabajo.no_cotizacion,
    solicitante_direccion: ordenTrabajo.dirrecion_solcitante,
    solicitante_ciudad: ordenTrabajo.ciudad_solcitante,
    responsable: ordenTrabajo.RESPONSABLE,
    fecha_diligenciamiento: ordenTrabajo.FECHA_CALIBRACION_DILIGENCIAMENTO,
    solicitante_contacto: ordenTrabajo.PERSONA_CONTACT_SOLCITANTE,
    solicitante_telefono: ordenTrabajo.TELEFONO_CONTACTO_SOLICITANTE,
    
    // Opcional: Si el Excel espera un check ('X') en vez de 'SÍ'/'NO', cámbialo a:
    // requiere_anexo_instrumentos: ordenTrabajo.REQUIERE_ANEXO ? 'X' : ''
    requiere_anexo_instrumentos: ordenTrabajo.REQUIERE_ANEXO ? 'SÍ' : 'NO',
    
    observaciones: ordenTrabajo.OBSERVACIONES,
  };

  // Procesar Escalares
  for (const scalar of mappingConfig.mappings.scalars) {
    if (scalarMap[scalar.key] !== undefined) {
      scalarsResult.push({
        key: scalar.key,
        cell: scalar.cell,
        value: scalarMap[scalar.key],
        sheet: scalar.sheet,
      });
    }
  }

  // Extraemos los detalles (instrumentos)
  const detalles = ordenTrabajo.orden_trabajo_detalles || [];

  // Procesar Tablas
  for (const tableConfig of mappingConfig.mappings.tables) {
    // Lógica para asignar qué porción del arreglo va a cada tabla
    let datosTabla: any[] = [];
    if (tableConfig.key === 'tabla_instrumentos_principal') {
      datosTabla = detalles.slice(0, 10); // Ítems 1 al 10
    } else if (tableConfig.key === 'tabla_instrumentos_anexo') {
      // Si la bandera es false en BD, no llenamos el anexo
      if (!ordenTrabajo.REQUIERE_ANEXO) continue; 
      datosTabla = detalles.slice(10); // Ítems 11 en adelante
    }

    if (datosTabla.length === 0) continue; // No mapear si no hay datos para esta tabla

    const sheetName = tableConfig.sheet || 'Sheet1';
    const startRow = tableConfig.startRow;
    const header_row = tableConfig.star_header;
    let currentRow = startRow;
    
    const rowCells: Array<{ key: string; column: string; row: number; cell: string; value: any }> = [];

    for (const item of datosTabla) {
      for (const col of tableConfig.columns) {

if (Array.isArray(col.columnsList) && col.columnsList.length > 0) {
  console.log("ENTRO  ")
          const puntos = Array.isArray(item.PUNTOS_CALIBRAR) ? item.PUNTOS_CALIBRAR : [];
          
          // Iteramos sobre las letras de columnas asignadas en el mapeo (ej: ['H', 'I', 'J', 'K'])
          col.columnsList.forEach((colLetter, index) => {
            console.log("ENTRO",colLetter)
            rowCells.push({
              key: `${col.key}_${index + 1}`,
              column: colLetter,
              row: currentRow,
              cell: `${colLetter}${currentRow}`,
              value: puntos[index] !== undefined ? puntos[index] : null, // Si no hay punto, enviamos null para limpiar
            });
          });
          
          continue; // Pasamos a la siguiente columna configurada
        }
        if (!col.column) continue;

        let rawValue: any = undefined;
        // Mapeo directo contra el modelo orden_trabajo_detalles[cite: 1]
        switch (col.key) {
          case 'item': rawValue = item.ITEM; break;
          case 'tipo_servicio': rawValue = item.TIPO_SERVICIO; break;
          case 'instrumento': rawValue = item.INSTRUMENTO; break;
          case 'fabricante': 
          case 'marca': rawValue = item.FABRICANTE; break; 
          case 'modelo': rawValue = item.MODELO; break;
          case 'serie': rawValue = item.SERIE; break;
          case 'codigo_interno': rawValue = item.CODIGO_INVENTARIO; break;
          case 'ubicacion': rawValue = item.UBICACION; break;
          case 'puntos_calibracion': 
            // Como es un array (String[]), lo unimos con comas[cite: 1]
            rawValue = Array.isArray(item.PUNTOS_CALIBRAR) ? item.PUNTOS_CALIBRAR.join(', ') : item.PUNTOS_CALIBRAR; 
            break;
          case 'unidad': rawValue = item.UNIDAD; break;
          case 'intervalo_medicion': rawValue = item.INTERVALO_RANGO; break;
          case 'resolucion_division': rawValue = item.RESOLUCION; break;
          case 'declaracion_conformidad': rawValue = item.DECLARACION_CONFORMIDAD ? 'SÍ' : 'NO'; break;
          case 'emp_ajuste_control':
          case 'emp_limite_control': rawValue = item.LIMITE_CONTROL_EMC; break;
          case 'documento_especificacion': rawValue = item.DOC_ESPECIFICACION; break;
          case 'regla_decision': rawValue = item.REGLA_DECISION; break;
        }

        rowCells.push({
          key: col.key,
          column: col.column,
          row: currentRow,
          cell: `${col.column}${currentRow}`,
          value: rawValue,
        });
      }
      currentRow++;
    }

    const endRow = currentRow > startRow ? currentRow - 1 : startRow;

    tablesResult.push({
      key: tableConfig.key,
      sheetName,
      startRow,
      endRow, 
      header_row,
      rowCells,
    });
  }

  return { scalars: scalarsResult, tables: tablesResult };
}




//parse recepcionde  equipos 


export function resolverDatosRecepcionConCeldas(recepcion: any, mappingConfig: MappingConfig) {
  const scalarsResult: Array<{ key: string; cell: string; value: any; sheet?: string }> = [];
  const tablesResult: Array<{
    key: string; sheetName: string; startRow: number; endRow: number; header_row?: number;
    rowCells: Array<{ key: string; column: string; row: number; cell: string; value: any }>;
  }> = [];

  const estadoPruebas = typeof recepcion.PRUEBAS_COMPLETAS === 'boolean' 
    ? recepcion.PRUEBAS_COMPLETAS 
    : (recepcion.PRUEBAS_COMPLETAS === 'true' || recepcion.PRUEBAS_COMPLETAS === true);

  const scalarMap: Record<string, any> = {
    nombre_quien_entrega: recepcion.NOMBRE_ENTREGA || recepcion.SOLICITANTE,
    no_cotizacion: recepcion.cotizaciones?.CODIGO_COTIZACION || '', 
    sitio_laboratorio_permanente: recepcion.SITIO_CALIBRACION === 'LABORATORIO' ? 'X' : '',
    sitio_instalaciones_cliente: recepcion.SITIO_CALIBRACION === 'CLIENTE' ? 'X' : '',
    fecha_recepcion: recepcion.FECHA_RECEPCION,
    nombre_quien_recibe: recepcion.NOMBRE_RECIBE,
    fecha_salida: recepcion.FECHA_SALIDA,
    nombre_quien_empaca: recepcion.NOMBRE_EMPACA,
    accesorios: recepcion.ACCESORIOS,
    estado_bueno: recepcion.ESTADO === 'BUENO' || recepcion.ESTADO === 'RECIBIDO' ? 'X' : '', 
    estado_malo: recepcion.ESTADO === 'MALO' ? 'X' : '', 
    pruebas_pesaje_si: estadoPruebas ? 'X' : '',
    pruebas_pesaje_no: !estadoPruebas ? 'X' : '',
    pruebas_pesaje_justificacion_no: !estadoPruebas ? recepcion.OBSERVACIONES_PRUEBAS : '',
    nombre_quien_calibra: recepcion.NOMBRE_CALIBRA,
    nombre_quien_recibe_servicio: recepcion.NOMBRE_RECIBE_SERVICIO,
  };

  for (const scalar of mappingConfig.mappings.scalars) {
    if (scalarMap[scalar.key] !== undefined) {
      scalarsResult.push({
        key: scalar.key, cell: scalar.cell, value: scalarMap[scalar.key], sheet: scalar.sheet,
      });
    }
  }

  const detalles = recepcion.recepcion_equipo_detalles || [];

  for (const tableConfig of mappingConfig.mappings.tables) {
    if (tableConfig.key !== 'tabla_recepcion_instrumentos') continue;

    const sheetName = tableConfig.sheet || 'Hoja1';
    const startRow = tableConfig.startRow;
    const header_row = tableConfig.star_header;
    let currentRow = startRow;
    
    const rowCells: Array<{ key: string; column: string; row: number; cell: string; value: any }> = [];

    for (const item of detalles) {
      let estadoIbc: any = { entrada: {}, salida: {} };
      try {
        const parsed = typeof item.ESTADO_IBC === 'string' ? JSON.parse(item.ESTADO_IBC) : (item.ESTADO_IBC || {});
        // Fallback robusto por si aún hay registros viejos sin anidar
        estadoIbc.entrada = parsed.entrada || parsed; 
        estadoIbc.salida = parsed.salida || {};
      } catch (e) {
        console.warn(`Error parseando ESTADO_IBC para el instrumento ${item.ID_INSTRUMENTO}`, e);
      }

      for (const col of tableConfig.columns) {
        if (!col.column) continue;

        let rawValue: any = undefined;
        let rawValueSalida: any = undefined; // Segunda variable para la fila de abajo

        switch (col.key) {
          case 'instrumento': rawValue = item.INSTRUMENTO; break;
          case 'marca': rawValue = item.MARCA; break;
          case 'modelo': rawValue = item.MODELO; break;
          case 'serie': rawValue = item.SERIE; break;
          case 'codigo_interno': rawValue = item.CODIGO_INVENTARIO; break;
          case 'resolucion': rawValue = item.RESOLUCION; break;
         case 'tipo_sensor_int': 
                    rawValue = item.TIPO_SENSOR_TEMP_init ? 'X' : ''; 
                    break;
          case 'tipo_sensor_ext': 
            rawValue = item.TIPO_SENSOR_TEMP_ext ? 'X' : ''; 
            break;
          case 'estampilla': rawValue = item.ESTAMPILLA; break;
          case 'observaciones': rawValue = item.OBSERVACIONES; break;

          // 🔴 EXCLUSIVO: Manejo de matriz doble para las columnas IBC
          case 'estado_ibc_e': 
            rawValue = estadoIbc.entrada.E ? 'X' : ''; 
            rawValueSalida = estadoIbc.salida.E ? 'X' : ''; 
            break; 
          case 'estado_ibc_t': 
            rawValue = estadoIbc.entrada.T ? 'X' : ''; 
            rawValueSalida = estadoIbc.salida.T ? 'X' : ''; 
            break;
          case 'estado_ibc_d': 
            rawValue = estadoIbc.entrada.D ? 'X' : ''; 
            rawValueSalida = estadoIbc.salida.D ? 'X' : ''; 
            break;
          case 'estado_ibc_a': 
            rawValue = estadoIbc.entrada.A ? 'X' : ''; 
            rawValueSalida = estadoIbc.salida.A ? 'X' : ''; 
            break;
        }

        // Inyección Fila 1 (Entrada y campos combinados)
        rowCells.push({
          key: col.key, column: col.column, row: currentRow,
          cell: `${col.column}${currentRow}`, value: rawValue,
        });

        // Inyección Fila 2 (Solo si es campo IBC, inyectamos en currentRow + 1)
        if (col.key.startsWith('estado_ibc_')) {
          rowCells.push({
            key: `${col.key}_salida`, column: col.column, row: currentRow + 1,
            cell: `${col.column}${currentRow + 1}`, value: rawValueSalida,
          });
        }
      }
      
      // 🔴 CLAVE: Cada ítem ocupa dos filas en el diseño de Excel, avanzamos de 2 en 2.
      currentRow += 2;
    }

    const endRow = currentRow > startRow ? currentRow - 1 : startRow;

    tablesResult.push({
      key: tableConfig.key, sheetName, startRow, endRow, header_row, rowCells,
    });
  }

  return { scalars: scalarsResult, tables: tablesResult };
}
async function streamToBuffer(stream: Readable): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}
export async function generarExcelPlantilla(job: Job<GenerarExcelBody>) {
  const { tipo, id_registro, codigo_actual, tipo_entry, id_job, action } = job.data;

  let mappingConfig = {} as MappingConfig;
  let s3TemplateKey = '';
  let cotizacion: any = null;
  let ordenTrabajo: any = null;
  let recepcion: any = null;
  let docExistente: any = null;

  // ====================================================================
  // 1. LECTURA DE BASE DE DATOS (Con consulta de documentos previos)
  // ====================================================================
  await prisma.$transaction(async (tx) => {
    // `tipo` es el TIPO DE DOCUMENTO (1=Cotización, 2=OT, 3=Recepción).
    // La versión de plantilla vigente se resuelve por el MÓDULO de la plantilla.
    const MODULO_POR_TIPO: Record<number, string> = {
      1: 'COTIZACIONES',
      2: 'ORDEN_TRABAJO',
      3: 'RECEPCION',
    };
    const modulo = MODULO_POR_TIPO[tipo];

    const version = await tx.version_plantillas.findFirst({
      where: modulo ? { plantillas: { MODULO: modulo } } : { ID_VERSION_PLANTILLA: tipo },
      include: { documentos: true },
      orderBy: { VERSION: 'desc' }
    });

    if (!version) throw new Error(`No existe una versión de plantilla para el tipo de documento ${tipo}.`);
    mappingConfig = mappingConfigSchema.parse(version?.MAPPING_CONFIG);
    s3TemplateKey = version?.documentos?.RUTA_URL || '';

    await tx.quote.update({ data: { status: 'PROCESSING' }, where: { id: id_job } });

    if (tipo === 1) {
      cotizacion = await tx.cotizaciones.findFirst({ where: { ID_COTIZACION: Number(id_registro) }, include: { cotizacion_detalles: { where: { activacion: true } }, clientes: true, ordenes_trabajo: true } });
    }
    if (tipo === 2) {
      ordenTrabajo = await tx.ordenes_trabajo.findFirst({ where: { ID_ORDEN_TRABAJO: Number(id_registro) }, include: { orden_trabajo_detalles: { where: { OR: [{ activacion: true }, { activacion: null }] } }, clientes: true } });
    }
    if (tipo === 3) {
      recepcion = await tx.recepciones_equipo.findFirst({ where: { ID_RECEPCION: Number(id_registro) }, include: { recepcion_equipo_detalles: { where: { OR: [{ activacion: true }, { activacion: null }] } }, cotizaciones: true } });
    }

    // 🔥 BUSCAR SI YA EXISTE UN DOCUMENTO PREVIO Y SU ÚLTIMA VERSIÓN
    const fkData = 
      tipo === 1 ? { ID_COTIZACION_FK: Number(id_registro) } :
      tipo === 2 ? { ID_ORDEN_TRABAJO_FK: Number(id_registro) } :
                   { ID_RECEPCION_FK: Number(id_registro) };

    docExistente = await tx.documentos.findFirst({
      where: fkData,
      include: {
        version_documentos: {
          orderBy: { VERSION: 'desc' },
          take: 1
        }
      }
    });
  }); 

  // ====================================================================
  // 2. ARMADO DE DATOS PARA EL CORREO (Se necesita siempre, genere o no genere)
  // ====================================================================
  let datosPlantillaCorreo = null;
  let recordUpdatedAt: Date | null = null;

  if (tipo === 1 && cotizacion) {
    recordUpdatedAt = cotizacion.UPDATED_AT || cotizacion.CREATED_AT;
    const totalCalculado = Number(cotizacion.MONTO_TOTAL || 0) + Number(cotizacion.viaticos || 0);
    const fechaEmisionStr = cotizacion.CREATED_AT.toLocaleDateString('es-CO');
    const fechaVencimientoObj = new Date(cotizacion.CREATED_AT);
    fechaVencimientoObj.setDate(fechaVencimientoObj.getDate() + 30);
    const totalEquipos = cotizacion.cotizacion_detalles?.reduce((acc: number, item: any) => acc + (item.CANTIDAD || 0), 0) || 0;
    const codigoOT = cotizacion.ordenes_trabajo && cotizacion.ordenes_trabajo.length > 0 ? cotizacion.ordenes_trabajo[0].CODIGO_OT : 'Pendiente de asignación';

    datosPlantillaCorreo = {
      nombreCliente: cotizacion.clientes?.NOMBRE_CONTACTO || cotizacion.clientes?.RAZON_SOCIAL || 'Cliente',
      numeroCotizacion: cotizacion.CODIGO_COTIZACION,
      fechaEmision: fechaEmisionStr,
      fechaVencimiento: fechaVencimientoObj.toLocaleDateString('es-CO'),
      valorTotal: new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP' }).format(totalCalculado),
      linkAprobacion: `${process.env.FRONTEND_URL}/cotizaciones/aprobar/${cotizacion.ID_COTIZACION}`, 
      emailDestino: cotizacion.clientes?.CORREO,
      cantidadEquipos: totalEquipos,
      numeroOT: codigoOT
    };
  }

  if (tipo === 2 && ordenTrabajo) {
    recordUpdatedAt = ordenTrabajo.UPDATED_AT || ordenTrabajo.CREATED_AT; // o la fecha correspondiente en tu modelo
    datosPlantillaCorreo = {
      emailDestino: ordenTrabajo.clientes?.CORREO, 
      nombreCliente: ordenTrabajo.clientes?.NOMBRE_CONTACTO || ordenTrabajo.clientes?.RAZON_SOCIAL,
      numeroOT: ordenTrabajo.CODIGO_OT,
      numeroCotizacion: ordenTrabajo.no_cotizacion
    };
  }

  if (tipo === 3 && recepcion) {
    recordUpdatedAt = recepcion.UPDATED_AT || recepcion.CREATED_AT;
  }

  // ====================================================================
  // 🔥 3. LÓGICA DE BYPASS (OMITIR GENERACIÓN SI ESTÁ AL DÍA)
  // ====================================================================
  const ultimaVersion = docExistente?.version_documentos?.[0];

  if (ultimaVersion && recordUpdatedAt) {
    // Tomamos las fechas en milisegundos para comparar
    // Adaptado para createdAt o created_at según como lo llame Prisma
    const fechaUltimoPdf = new Date(ultimaVersion.createdAt || (ultimaVersion as any).created_at || ultimaVersion.FECHA_CREACION).getTime();
    const fechaUltimaEdicion = new Date(recordUpdatedAt).getTime();

    // Si el PDF se generó DESPUÉS o en el mismo instante de la última edición de los datos
    if (fechaUltimoPdf >= fechaUltimaEdicion) {
      console.log(`[generador_excel] ⚡ BYPASS ACTIVADO: El documento Tipo ${tipo} está en su última versión. Extrayendo URLs directas...`);
      
      const contentJson = typeof ultimaVersion.content_json === 'string' 
        ? JSON.parse(ultimaVersion.content_json) 
        : ultimaVersion.content_json;

      await prisma.quote.update({
        where: { id: id_job },
        data: { status: 'COMPLETED', data: contentJson }
      });

      // Retornamos instantáneamente, sin procesar nada más
      return {
        exito: true,
        tipo_documento: tipo,
        estado: cotizacion?.ESTADO || null,
        id_registro: id_registro,
        url_pdf: contentJson?.pdf || ultimaVersion.RUTA_URL,
        url_excel: contentJson?.excel || null,
        datos_correo: datosPlantillaCorreo,
        action: action
      };
    }
  }

  // ====================================================================
  // 4. GENERACIÓN OBLIGATORIA (S3 -> ExcelJS -> LibreOffice -> S3)
  // ====================================================================
  // Solo llegará a esta línea si NO hay documento previo o si los datos son más recientes que el PDF.
  console.log(`[generador_excel] ⚙️ PROCESANDO: Datos nuevos detectados. Generando documento Tipo ${tipo}...`);

  const comaand = new GetObjectCommand({ Bucket: BUCKET_NAME, Key: s3TemplateKey });
  const s3Response = await s3Client.send(comaand);
  if (!s3Response.Body) throw new Error(`Archivo vacío en MinIO para la versión ${tipo}`);

  const buffer = await streamToBuffer(s3Response.Body as Readable);
  const workbook = new exceljs.Workbook();
  await workbook.xlsx.load(buffer as any);

  // ... (Aquí va tu lógica intacta de inyección de celdas: if (tipo === 1) { resolverDatosCotizacion... } ) ...
  
  if (tipo === 1) {
    const { scalars, tables } = resolverDatosCotizacionConCeldas(cotizacion, mappingConfig);
    
    for (const scalar of scalars) {
      const sheet = workbook.getWorksheet(scalar.sheet || 1) || workbook.worksheets[0];
      if (sheet) inyectarValorSeguro(sheet.getCell(scalar.cell), scalar.value);
    }
    
    for (const tabla of tables) {
      const sheet = workbook.getWorksheet(tabla.sheetName) || workbook.worksheets[0];
      if (!sheet) continue;
      const columnasTabla = [...new Set(tabla.rowCells.map(c => c.column))];
      const FILA_LIMITE = 50; 
      
      for (let r = tabla.startRow; r <= FILA_LIMITE; r++) {
        const row = sheet.getRow(r);
        row.hidden = r > tabla.endRow; 
        for (const col of columnasTabla) {
           sheet.getCell(`${col}${r}`).value = null; 
        }
      }

      const filasAgrupadas = tabla.rowCells.reduce((acc, cellData) => {
        if (!acc[cellData.row]) acc[cellData.row] = [];
        acc[cellData.row].push(cellData);
        return acc;
      }, {} as Record<number, typeof tabla.rowCells>);

      for (const filaNumStr of Object.keys(filasAgrupadas)) {
        const filaNum = Number(filaNumStr);
        for (const celdaData of filasAgrupadas[filaNum]) {
          const cell = sheet.getCell(celdaData.cell);
          inyectarValorSeguro(cell, celdaData.value);
        }
      }
    }

    const totalCalculado = Number(cotizacion.MONTO_TOTAL || 0) + Number(cotizacion.viaticos || 0);
    
    // Formatear fechas a formato local
    const fechaEmisionStr = cotizacion.CREATED_AT.toLocaleDateString('es-CO');
    
    // Asumiendo 30 días de validez para la cotización
    const fechaVencimientoObj = new Date(cotizacion.CREATED_AT);
    fechaVencimientoObj.setDate(fechaVencimientoObj.getDate() + 30);
    const fechaVencimientoStr = fechaVencimientoObj.toLocaleDateString('es-CO');
    const totalEquipos = cotizacion.cotizacion_detalles?.reduce((acc: number, item: any) => acc + (item.CANTIDAD || 0), 0) || 0;
    
    // 🔥 NUEVO: Extracción del código OT (Requiere que incluyas { ordenes_trabajo: true } en el findFirst de Prisma al inicio)
    const codigoOT = cotizacion.ordenes_trabajo && cotizacion.ordenes_trabajo.length > 0 
                     ? cotizacion.ordenes_trabajo[0].CODIGO_OT 
                     : 'Pendiente de asignación';
    // Mapeo exacto a las variables de tu HTML {{...}}
datosPlantillaCorreo = {
      nombreCliente: cotizacion.clientes?.NOMBRE_CONTACTO || cotizacion.clientes?.RAZON_SOCIAL || 'Cliente',
      numeroCotizacion: cotizacion.CODIGO_COTIZACION,
      fechaEmision: fechaEmisionStr,
      fechaVencimiento: fechaVencimientoStr,
      valorTotal: new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP' }).format(totalCalculado),
      linkAprobacion: `${process.env.FRONTEND_URL}/cotizaciones/aprobar/${cotizacion.ID_COTIZACION}`, 
      emailDestino: cotizacion.clientes?.CORREO,
      
      // ✅ VARIABLES FALTANTES PARA EL SEGUNDO HTML
      cantidadEquipos: totalEquipos,
      numeroOT: codigoOT
    };
  }

  if (tipo === 2) {
    const { scalars, tables } = resolverDatosOrdenTrabajoConCeldas(ordenTrabajo, mappingConfig);
    
    for (const scalar of scalars) {
      const sheet = workbook.getWorksheet(scalar.sheet || 1) || workbook.worksheets[0];
      if (sheet) inyectarValorSeguro(sheet.getCell(scalar.cell), scalar.value);
    }
    
    for (const tabla of tables) {
      const sheet = workbook.getWorksheet(tabla.sheetName) || workbook.worksheets[0];
      if (!sheet) continue;
      const columnasTabla = [...new Set(tabla.rowCells.map(c => c.column))];
      
      for (let r = tabla.startRow; r <= tabla.endRow; r++) {
        for (const col of columnasTabla) {
           sheet.getCell(`${col}${r}`).value = null; 
        }
      }

      const filasAgrupadas = tabla.rowCells.reduce((acc, cellData) => {
        if (!acc[cellData.row]) acc[cellData.row] = [];
        acc[cellData.row].push(cellData);
        return acc;
      }, {} as Record<number, typeof tabla.rowCells>);

      for (const filaNumStr of Object.keys(filasAgrupadas)) {
        const filaNum = Number(filaNumStr);
        for (const celdaData of filasAgrupadas[filaNum]) {
          const cell = sheet.getCell(celdaData.cell);
          inyectarValorSeguro(cell, celdaData.value);
        }
      }
    }
     datosPlantillaCorreo = {
  // Dato interno para el worker de correos (A quién se lo enviamos)
  emailDestino:ordenTrabajo.clientes.CORREO, 
  
  // Variables exactas que lee la plantilla HTML (Handlebars)
  nombreCliente: ordenTrabajo.clientes.NOMBRE_CONTACTO || ordenTrabajo.clientes.RAZON_SOCIAL, // Mapea a {{nombreCliente}}
  numeroOT: ordenTrabajo.CODIGO_OT,                                         // Mapea a {{numeroOT}}
  numeroCotizacion: ordenTrabajo.no_cotizacion                  // Mapea a {{numeroCotizacion}}
};
  }
   
  if (tipo === 3) {
    const { scalars, tables } = resolverDatosRecepcionConCeldas(recepcion, mappingConfig);

    for (const scalar of scalars) {
      const sheet = workbook.getWorksheet(scalar.sheet || 1) || workbook.worksheets[0];
      if (sheet) inyectarValorSeguro(sheet.getCell(scalar.cell), scalar.value);
    }
    
    for (const tabla of tables) {
      const sheet = workbook.getWorksheet(tabla.sheetName) || workbook.worksheets[0];
      if (!sheet) continue;
      const columnasTabla = [...new Set(tabla.rowCells.map(c => c.column))];
      
      for (let r = tabla.startRow; r <= tabla.endRow; r++) {
        for (const col of columnasTabla) {
           sheet.getCell(`${col}${r}`).value = null; 
        }
      }

      const filasAgrupadas = tabla.rowCells.reduce((acc, cellData) => {
        if (!acc[cellData.row]) acc[cellData.row] = [];
        acc[cellData.row].push(cellData);
        return acc;
      }, {} as Record<number, typeof tabla.rowCells>);

      for (const filaNumStr of Object.keys(filasAgrupadas)) {
        const filaNum = Number(filaNumStr);
        for (const celdaData of filasAgrupadas[filaNum]) {
          const cell = sheet.getCell(celdaData.cell);
          inyectarValorSeguro(cell, celdaData.value);
        }
      }
    }
  }

  workbook.eachSheet((sheet) => {
    sheet.pageSetup = {
      paperSize: 9, orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 999,
      margins: { left: 0.25, right: 0.25, top: 0.5, bottom: 0.5, header: 0.1, footer: 0.1 }
    };
    // ... limpieza de richText ...
  });

  const convertAsync = promisify(convert);
  const updatedBuffer = await workbook.xlsx.writeBuffer();
  
  const prefix = tipo === 2 ? 'ordenes_trabajo_generadas' : 
                 tipo === 3 ? 'recepciones_generadas' : 'cotizaciones_generadas';
  
  const codigoSeguro = codigo_actual ? codigo_actual.replace(/\s+/g, '_') : `registro_${id_registro}`;
  const nombreBase = tipo_entry === 'prod' ? codigoSeguro : `test_${id_job}`;
  
  const s3Key = `${prefix}/${nombreBase}.xlsx`; 
  const s3Key_pdf = `${prefix}/${nombreBase}.pdf`; 

  const pdfBuffer = await convertAsync(Buffer.from(updatedBuffer), '.pdf', undefined);
  
  await Promise.all([
    s3Client.send(new PutObjectCommand({ Bucket: BUCKET_NAME, Key: s3Key, Body: Buffer.from(updatedBuffer), ContentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })),
    s3Client.send(new PutObjectCommand({ Bucket: BUCKET_NAME, Key: s3Key_pdf, Body: pdfBuffer, ContentType: 'application/pdf' }))
  ]);

  const parse: url = { excel: s3Key, url_pdf: s3Key_pdf };

  await prisma.quote.update({
    where: { id: id_job },
    data: { status: 'COMPLETED', fileUrl: null, data: parse }
  });

  const usuarioId = job.data.id_usuario || 1; 

  const fkDataGuardar = 
    tipo === 1 ? { ID_COTIZACION_FK: Number(id_registro) } :
    tipo === 2 ? { ID_ORDEN_TRABAJO_FK: Number(id_registro) } :
                 { ID_RECEPCION_FK: Number(id_registro) };

  let documentoId;
  let nuevaVersionNum = 1;

  if (docExistente) {
    documentoId = docExistente.ID_DOCUMENTO;
    const ultimaVersion = await prisma.version_documentos.findFirst({ where: { ID_DOCUMENTO_FK: documentoId }, orderBy: { VERSION: 'desc' } });
    nuevaVersionNum = ultimaVersion ? ultimaVersion.VERSION + 1 : 1;
    await prisma.documentos.update({ where: { ID_DOCUMENTO: documentoId }, data: { RUTA_URL: s3Key_pdf } });
  } else {
    try {
      const nuevoDoc = await prisma.documentos.create({
        data: { NOMBRE: nombreBase, RUTA_URL: s3Key_pdf, PROVEEDOR: 'AWS_S3', MIME_TYPE: 'application/pdf', ...fkDataGuardar }
      });
      documentoId = nuevoDoc.ID_DOCUMENTO;
    } catch (error: any) {
      if (error.code === 'P2002') {
        const docRecuperado = await prisma.documentos.findFirst({ where: { ...fkDataGuardar } });
        if (!docRecuperado) throw new Error("Fallo crítico recuperando documento concurrente.");
        documentoId = docRecuperado.ID_DOCUMENTO;
        const ultimaVersion = await prisma.version_documentos.findFirst({ where: { ID_DOCUMENTO_FK: documentoId }, orderBy: { VERSION: 'desc' } });
        nuevaVersionNum = ultimaVersion ? ultimaVersion.VERSION + 1 : 1;
      } else { throw error; }
    }
  }

  await prisma.version_documentos.create({
    data: { ID_DOCUMENTO_FK: documentoId, VERSION: nuevaVersionNum, RUTA_URL: s3Key_pdf, usuario_fk: usuarioId, content_json: { excel: s3Key, pdf: s3Key_pdf } }
  });

  return {
    exito: true,
    tipo_documento: tipo,
    estado: cotizacion?.ESTADO || null,
    id_registro: id_registro,
    url_pdf: s3Key_pdf,
    url_excel: s3Key,
    datos_correo: datosPlantillaCorreo,
    action: action
  };
}