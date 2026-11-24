import type exceljs from 'exceljs';
import type { MappingConfig } from '../routes/plantillas-generacion.schemas.js';
import { escribirFechaFacturacionOT, resolverContactoSolicitante } from './orden-trabajo-excel-fields.js';

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

// ============================================================================
// ETIQUETAS CANÓNICAS PARA LA ORDEN DE TRABAJO
// ============================================================================
const LISTA_UNIDADES = [
  'psi', 'bar', 'mbar', 'kPa', 'MPa', 'Pa', 'mmHg', 'inHg',
  'kgf/cm²', 'cmH2O', 'kg', 'g', 'mg', 'lb', '°C', '°F', '%HR',
];

const LISTAS_DESPLEGABLES_OT: Record<string, string[]> = {
  tipo_servicio: ['Acreditado', 'No_acreditado'],
  sitio_calibracion: ['Laboratorio permanente', 'En sitio', 'Interno USC'],
  unidad: LISTA_UNIDADES,
};

function mapearTipoServicio(valor?: string | null): string {
  const v = (valor ?? '').toString().trim();
  const upper = v.toUpperCase().replace(/_/g, ' ');
  if (!v) return 'Acreditado';
  if (upper.includes('NO') && upper.includes('ACREDIT')) return 'No_acreditado';
  return 'Acreditado';
}

function mapearSitioCalibracion(valor?: string | null): string {
  const v = (valor ?? '').toString().trim().toUpperCase();
  if (v.includes('INTERNO USC') || v.includes('INTERNO_USC')) return 'Interno USC';
  if (v.startsWith('CLI')) return 'En sitio';
  return 'Laboratorio permanente';
}

function aplicarListasDesplegablesOT(workbook: exceljs.Workbook, mappingConfig: MappingConfig): void {
  for (const table of mappingConfig.mappings.tables) {
    const maxRows = table.key === 'tabla_instrumentos_anexo' ? 20 : 10;
    for (const col of table.columns) {
      const opciones = LISTAS_DESPLEGABLES_OT[col.key];
      if (!opciones || !col.column) continue;

      const sheet = workbook.getWorksheet(table.sheet || 1) || workbook.worksheets[0];
      if (!sheet) continue;

      const startRow = table.startRow;
      const endRow = startRow + maxRows - 1;
      const rango = `${col.column}${startRow}:${col.column}${endRow}`;

      try {
        (sheet as any).dataValidations.add(rango, {
          type: 'list',
          allowBlank: true,
          formulae: [`"${opciones.join(',')}"`],
        });
      } catch (e) {
        console.warn(`[generador_excel] No se pudo aplicar validación en ${rango}:`, e);
      }
    }
  }
}

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
    total_servicio: cotizacion.cotizacion_detalles?.reduce(
      (acc: number, item: any) => acc + Number(item.VALOR_TOTAL || 0),
      0,
    ) ?? 0,
    descuento: cotizacion.descuento || 0, // ✅ Falta mapear la llave del JSON
   viaticos: Number(cotizacion.viaticos || 0), // ✅ Falta mapear la llave del JSON
    monto_total: Number(cotizacion.MONTO_TOTAL || 0),
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
    calib_hora: (ordenTrabajo.HORA_CALIBRACION ?? (ordenTrabajo.FECHA_CALIBRACION ? ordenTrabajo.hora : null))?.toISOString().slice(11, 16) ?? null,

    // ✅ CORRECCIÓN 2: Usar el campo exclusivo del solicitante
    solicitante_razon_social: ordenTrabajo.razon_social_solicitante,

    solicitante_nit: ordenTrabajo.NIT_solicitante,

    // Nota técnica: Priorizamos CODIGO_OT que es el Unique ID formal de tu Prisma
    no_orden_trabajo: ordenTrabajo.CODIGO_OT || ordenTrabajo.no_orden_trabajo,

    no_cotizacion: ordenTrabajo.cotizaciones?.CODIGO_COTIZACION ?? ordenTrabajo.no_cotizacion,
    solicitante_direccion: ordenTrabajo.dirrecion_solcitante,
    solicitante_ciudad: ordenTrabajo.ciudad_solcitante,
    responsable: ordenTrabajo.RESPONSABLE,
    fecha_diligenciamiento: ordenTrabajo.FECHA_CALIBRACION_DILIGENCIAMENTO,
    solicitante_contacto: resolverContactoSolicitante(ordenTrabajo),
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
          const puntos = Array.isArray(item.PUNTOS_CALIBRAR) ? item.PUNTOS_CALIBRAR : [];

          // Iteramos sobre las letras de columnas asignadas en el mapeo (ej: ['H', 'I', 'J', 'K'])
          col.columnsList.forEach((colLetter, index) => {
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
          case 'tipo_servicio': rawValue = mapearTipoServicio(item.TIPO_SERVICIO); break;
          case 'instrumento': rawValue = item.INSTRUMENTO; break;
          case 'sitio_calibracion': rawValue = mapearSitioCalibracion(item.sitio_calibracion); break;
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

  const nombresTecnicos = [...new Set(
    (recepcion.ordenes_trabajo?.orden_trabajo_detalles ?? [])
      .map((detalle: any) => detalle.usuarios?.NOMBRE_COMPLETO?.trim())
      .filter((nombre: string | undefined): nombre is string => Boolean(nombre)),
  )].join(', ');

  const scalarMap: Record<string, any> = {
    solicitante: recepcion.SOLICITANTE,
    nombre_quien_entrega: recepcion.NOMBRE_ENTREGA,
    no_cotizacion: recepcion.cotizaciones?.CODIGO_COTIZACION || '',
    // El formato de Recepción no debe mostrar el consecutivo OT. Se conserva
    // la clave para limpiar una celda que aún esté mapeada en configuraciones antiguas.
    no_orden_trabajo: '',
    sitio_laboratorio_permanente: recepcion.SITIO_CALIBRACION === 'LABORATORIO' ? 'X' : '',
    sitio_instalaciones_cliente: recepcion.SITIO_CALIBRACION === 'CLIENTE' ? 'X' : '',
    sitio_interno_usc: recepcion.SITIO_CALIBRACION === 'INTERNO_USC' ? 'X' : '',
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
    nombre_quien_calibra: nombresTecnicos,
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

  const marcaIbc = (valor: unknown): string => {
    if (valor === true || valor === 'true' || valor === 'TRUE' || valor === 'SI' || valor === 'Sí') return '✓';
    if (valor === false || valor === 'false' || valor === 'FALSE' || valor === 'NO') return '✗';
    return '';
  };

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
            rawValue = marcaIbc(estadoIbc.entrada.E);
            rawValueSalida = marcaIbc(estadoIbc.salida.E);
            break;
          case 'estado_ibc_t':
            rawValue = marcaIbc(estadoIbc.entrada.T);
            rawValueSalida = marcaIbc(estadoIbc.salida.T);
            break;
          case 'estado_ibc_d':
            rawValue = marcaIbc(estadoIbc.entrada.D);
            rawValueSalida = marcaIbc(estadoIbc.salida.D);
            break;
          case 'estado_ibc_a':
            rawValue = marcaIbc(estadoIbc.entrada.A);
            rawValueSalida = marcaIbc(estadoIbc.salida.A);
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
export function hidratarFormatoOperativo(workbook: exceljs.Workbook, tipo: number, registro: unknown, mappingConfig: MappingConfig): void {
  if (tipo === 1) {
    const { scalars, tables } = resolverDatosCotizacionConCeldas(registro, mappingConfig);
     const key_filas=["descuento","viaticos","monto_total","total_cantidad_servicios","total_servicio"]
    for (const scalar of scalars) {

      const sheet = workbook.getWorksheet(scalar.sheet || 1) || workbook.worksheets[0];

      if (sheet){

        const cell = sheet.getCell(scalar.cell);

          // 🌟 VERIFICAR SI EL ESCALAR ESTÁ EN LA LISTA DE CLAVES IMPORTANTES
          if (key_filas.includes(scalar.key)) {
            // Forzamos la visibilidad de su fila y de su columna
            sheet.getRow(Number(cell.row)).hidden = false;
            sheet.getColumn(Number(cell.col)).hidden = false;
          }


        inyectarValorSeguro(sheet.getCell(scalar.cell), scalar.value);}
    }

    for (const tabla of tables) {
      const sheet = workbook.getWorksheet(tabla.sheetName) || workbook.worksheets[0];
      const filaModelo = sheet.getRow(tabla.startRow);
      const alturaModelo = filaModelo.height;
      if (!sheet) continue;
      const columnasTabla = [...new Set(tabla.rowCells.map(c => c.column))];
      const FILA_LIMITE = 50;

      for (let r = tabla.startRow; r <= FILA_LIMITE; r++) {
        const row = sheet.getRow(r);
        row.hidden = r > tabla.endRow;
        if (r > tabla.startRow && r <= tabla.endRow && alturaModelo) {
          row.height = alturaModelo;
        }
        for (const col of columnasTabla) {
           sheet.getCell(`${col}${r}`).value = null;
           const cell = sheet.getCell(`${col}${r}`);
           cell.value = null;
           if (r > tabla.startRow && r <= tabla.endRow) {
             const cellModelo = sheet.getCell(`${col}${tabla.startRow}`);


             cell.border = cellModelo.border ? JSON.parse(JSON.stringify(cellModelo.border)) : undefined;
             cell.fill = cellModelo.fill ? JSON.parse(JSON.stringify(cellModelo.fill)) : undefined;
             cell.numFmt = cellModelo.numFmt;
           }
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
  if (tipo === 2) {
    const { scalars, tables } = resolverDatosOrdenTrabajoConCeldas(registro, mappingConfig);

    for (const scalar of scalars) {
      const sheet = workbook.getWorksheet(scalar.sheet || 1) || workbook.worksheets[0];
      if (!sheet) continue;
      const celda = sheet.getCell(scalar.cell);
      if (scalar.key === 'cert_fecha_limite_facturacion') {
        escribirFechaFacturacionOT(celda, scalar.value);
      } else {
        inyectarValorSeguro(celda, scalar.value);
      }
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
     aplicarListasDesplegablesOT(workbook, mappingConfig);
  }
  if (tipo === 3) {
    const { scalars, tables } = resolverDatosRecepcionConCeldas(registro, mappingConfig);

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

}
