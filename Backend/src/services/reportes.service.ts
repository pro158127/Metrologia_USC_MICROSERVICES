// services/reportes.service.ts
// Consolida los datos de reportes con joins correctos y genera los archivos
// de exportación (PDF / Excel) sin depender de Fastify ni del worker.
import { PrismaClient } from '@prisma/client';
import ExcelJS from 'exceljs';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

export interface FiltrosReporte {
  fechaInicio?: string;
  fechaFin?: string;
  tipoServicio?: string;
  cliente?: string;
  tecnico?: string;
}

export interface CertificadoReporte {
  codigo: string;
  instrumento: string;
  estampilla: string | null;
  cliente: string;
  nit: string;
  tecnico: string;
  ot: string;
  fecha: string | null;
  rutaUrl: string | null;
  tipoServicio: string | null;
  idTecnico: number | null;
}

export interface TecnicoReporte {
  tecnico: string;
  ots: number;
  equipos: number;
  promedioDias: number;
}

export interface TrazabilidadReporte {
  factura: string;
  cliente: string;
  fecha: string | null;
  valor: number;
  ots: string;
  equipos: number;
  cert: string | null;
  tecnico: string;
  tipoServicio: string;
}

export interface DatosReporte {
  kpis: {
    cotizacionesEmitidas: number;
    tasaConversion: number;
    ingresos: number;
    ordenesInternas: number;
  };
  certificados: CertificadoReporte[];
  tecnicos: TecnicoReporte[];
  trazabilidad: TrazabilidadReporte[];
  filtrosAplicados: FiltrosReporte;
}

function enRangoFecha(fecha: Date | null | undefined, inicio?: string, fin?: string): boolean {
  if (!fecha) return false;
  const t = fecha.getTime();
  if (inicio && t < new Date(`${inicio}T00:00:00`).getTime()) return false;
  if (fin && t > new Date(`${fin}T23:59:59`).getTime()) return false;
  return true;
}

const norm = (s?: string | null): string => (s ?? '').trim().toLowerCase();

export async function obtenerDatosReporte(
  prisma: PrismaClient,
  filtros: FiltrosReporte = {},
): Promise<DatosReporte> {
  // ======================================================================
  // 1. Certificados con join completo (certificado → calibración → recepción → OT → cliente)
  // ======================================================================
  const certificados = await prisma.certificados.findMany({
    include: {
      documentos: true,
      calibraciones: {
        include: {
          usuarios: true,
          recepcion_equipo_detalles: {
            include: {
              recepciones_equipo: {
                include: {
                  ordenes_trabajo: { include: { clientes: true, orden_trabajo_detalles: true } },
                },
              },
            },
          },
        },
      },
    },
    orderBy: { ID_CERTIFICADO: 'desc' },
  });

  const certs: CertificadoReporte[] = certificados
    .map((cert) => {
      const cal = cert.calibraciones;
      const det = cal?.recepcion_equipo_detalles;
      const ot = det?.recepciones_equipo?.ordenes_trabajo;
      const otDetalle = ot?.orden_trabajo_detalles.find((detalleOT) =>
        det?.ID_UNIDAD_FK != null
          ? detalleOT.ID_UNIDAD_FK === det.ID_UNIDAD_FK
          : det?.ITEM != null && detalleOT.ITEM === det.ITEM,
      ) ?? null;
      return {
        codigo: cert.CODIGO_CERTIFICADO,
        instrumento: det?.INSTRUMENTO ?? '—',
        estampilla: det?.ESTAMPILLA ?? null,
        cliente: ot?.clientes?.RAZON_SOCIAL ?? '—',
        nit: ot?.clientes?.NIT ?? '—',
        tecnico: cal?.usuarios?.NOMBRE_COMPLETO ?? '—',
        ot: ot?.CODIGO_OT ?? '—',
        fecha: cal?.CREATED_AT ? cal.CREATED_AT.toISOString() : null,
        rutaUrl: cert.documentos?.RUTA_URL ?? null,
        tipoServicio: otDetalle?.TIPO_SERVICIO ?? null,
        idTecnico: cal?.ID_TECNICO_FK ?? null,
      };
    })
    .filter((c) => {
      if (filtros.fechaInicio || filtros.fechaFin) {
        if (!c.fecha) return false;
        const f = new Date(c.fecha);
        if (!enRangoFecha(f, filtros.fechaInicio, filtros.fechaFin)) return false;
      }
      if (filtros.tecnico && norm(c.tecnico) !== norm(filtros.tecnico)) return false;
      if (filtros.cliente && !norm(c.cliente).includes(norm(filtros.cliente))) return false;
      if (filtros.tipoServicio && norm(c.tipoServicio) !== norm(filtros.tipoServicio)) return false;
      return true;
    });

  // ======================================================================
  // 2. Resumen por técnico (desde calibraciones → usuario)
  // ======================================================================
  const calibraciones = await prisma.calibraciones.findMany({
    include: {
      usuarios: true,
      recepcion_equipo_detalles: {
        include: {
          recepciones_equipo: {
            include: {
              ordenes_trabajo: { include: { clientes: true, orden_trabajo_detalles: true } },
            },
          },
        },
      },
    },
  });

  const gruposTecnico = new Map<
    number,
    { nombre: string; diasPorOT: Map<number, number>; equipos: number }
  >();
  for (const cal of calibraciones) {
    const id = cal.ID_TECNICO_FK;
    if (!id) continue;
    const detalle = cal.recepcion_equipo_detalles;
    const ot = detalle?.recepciones_equipo?.ordenes_trabajo ?? null;
    const detalleOT = ot?.orden_trabajo_detalles.find(
      (item) =>
        detalle?.ID_UNIDAD_FK != null
          ? item.ID_UNIDAD_FK === detalle.ID_UNIDAD_FK
          : detalle?.ITEM != null && item.ITEM === detalle.ITEM,
    );
    const nombreTecnico = cal.usuarios?.NOMBRE_COMPLETO ?? `Técnico ${id}`;
    if (filtros.tecnico && norm(nombreTecnico) !== norm(filtros.tecnico)) continue;
    if (filtros.cliente && !norm(ot?.clientes?.RAZON_SOCIAL).includes(norm(filtros.cliente))) continue;
    if (filtros.tipoServicio && norm(detalleOT?.TIPO_SERVICIO) !== norm(filtros.tipoServicio)) continue;
    if ((filtros.fechaInicio || filtros.fechaFin) && !enRangoFecha(cal.CREATED_AT, filtros.fechaInicio, filtros.fechaFin)) continue;
    const g = gruposTecnico.get(id) ?? {
      nombre: nombreTecnico,
      diasPorOT: new Map<number, number>(),
      equipos: 0,
    };
    g.equipos += 1;
    if (ot?.ID_ORDEN_TRABAJO && ot.CREATED_AT && cal.CREATED_AT) {
      const dias = Math.max(0, (cal.CREATED_AT.getTime() - ot.CREATED_AT.getTime()) / 86400000);
      const previo = g.diasPorOT.get(ot.ID_ORDEN_TRABAJO) ?? 0;
      g.diasPorOT.set(ot.ID_ORDEN_TRABAJO, Math.max(previo, dias));
    }
    gruposTecnico.set(id, g);
  }

  const tecnicos: TecnicoReporte[] = Array.from(gruposTecnico.entries())
    .map(([, g]) => ({
      tecnico: g.nombre,
      ots: g.diasPorOT.size,
      equipos: g.equipos,
      promedioDias:
        g.diasPorOT.size > 0
          ? Array.from(g.diasPorOT.values()).reduce((total, dias) => total + dias, 0) / g.diasPorOT.size
          : 0,
    }))
    .sort((a, b) => b.equipos - a.equipos);

  // ======================================================================
  // 3. Trazabilidad (factura → OT → certificados)
  // ======================================================================
  const facturas = await prisma.facturas.findMany({
    include: {
      clientes: true,
      ordenes_trabajo: {
        include: {
          clientes: true,
          orden_trabajo_detalles: true,
          orden_trabajo_hijas: {
            where: { VIGENTE: true },
            include: {
              orden_trabajo_detalles: true,
              recepciones_equipo: {
                where: { VIGENTE: true, activacion: { not: false } },
                include: {
                  recepcion_equipo_detalles: {
                    where: { OR: [{ activacion: true }, { activacion: null }] },
                    include: { calibraciones: { include: { certificados: true, usuarios: true } } },
                  },
                },
              },
            },
          },
          recepciones_equipo: {
            where: { VIGENTE: true, activacion: { not: false } },
            include: {
              recepcion_equipo_detalles: {
                where: { OR: [{ activacion: true }, { activacion: null }] },
                include: { calibraciones: { include: { certificados: true, usuarios: true } } },
              },
            },
          },
        },
      },
    },
    orderBy: { FECHA: 'desc' },
  });

  const trazabilidad: TrazabilidadReporte[] = facturas
    .map((f) => {
      const ot = f.ordenes_trabajo;
      const otsOperativas = ot?.orden_trabajo_hijas?.length
        ? ot.orden_trabajo_hijas
        : ot
          ? [ot]
          : [];
      const certs: string[] = [];
      const tecnicos = new Set<string>();
      const tiposServicio = new Set<string>();
      let equipos = 0;
      for (const orden of otsOperativas) {
        for (const recepcion of orden.recepciones_equipo ?? []) {
          for (const detalle of recepcion.recepcion_equipo_detalles ?? []) {
            if (detalle.activacion === false) continue;
            equipos += 1;
            const detalleOT = orden.orden_trabajo_detalles.find(
              (item) =>
                detalle.ID_UNIDAD_FK != null
                  ? item.ID_UNIDAD_FK === detalle.ID_UNIDAD_FK
                  : detalle.ITEM != null && item.ITEM === detalle.ITEM,
            );
            if (detalleOT?.TIPO_SERVICIO) tiposServicio.add(detalleOT.TIPO_SERVICIO);
            const tecnico = detalle.calibraciones?.usuarios?.NOMBRE_COMPLETO;
            if (tecnico) tecnicos.add(tecnico);
            const codigoCertificado = detalle.calibraciones?.certificados?.CODIGO_CERTIFICADO;
            if (codigoCertificado) certs.push(codigoCertificado);
          }
        }
      }
      const fechaFactura = f.FECHA ?? null;
      return {
        factura: f.NUMERO_FACTURA,
        cliente: f.clientes?.RAZON_SOCIAL ?? ot?.clientes?.RAZON_SOCIAL ?? '—',
        fecha: fechaFactura ? fechaFactura.toISOString() : null,
        valor: Number(f.VALOR ?? 0),
        ots: otsOperativas.map((orden) => orden.CODIGO_OT).join(', ') || '—',
        equipos,
        cert: certs.length > 0 ? Array.from(new Set(certs)).join(', ') : null,
        tecnico: Array.from(tecnicos).join(', ') || '—',
        tipoServicio: Array.from(tiposServicio).join(', ') || '—',
      };
    })
    .filter((t) => {
      if (filtros.cliente && !norm(t.cliente).includes(norm(filtros.cliente))) return false;
      if ((filtros.fechaInicio || filtros.fechaFin) && !enRangoFecha(t.fecha ? new Date(t.fecha) : null, filtros.fechaInicio, filtros.fechaFin)) return false;
      if (filtros.tecnico && !norm(t.tecnico).includes(norm(filtros.tecnico))) return false;
      if (filtros.tipoServicio && !norm(t.tipoServicio).includes(norm(filtros.tipoServicio))) return false;
      return true;
    });

  // ======================================================================
  // 4. KPIs
  // ======================================================================
  const [totalCotizaciones, cotizacionesAprobadas, facturasMonto, ordenesInternas] =
    await Promise.all([
      prisma.cotizaciones.count(),
      prisma.cotizaciones.count({ where: { ESTADO: 'APROBADA' } }),
      prisma.facturas.aggregate({ _sum: { VALOR: true } }),
      prisma.ordenes_trabajo.count({ where: { ES_INTERNO_USC: true } }),
    ]);

  const kpis = {
    cotizacionesEmitidas: totalCotizaciones,
    tasaConversion:
      totalCotizaciones > 0 ? Math.round((cotizacionesAprobadas / totalCotizaciones) * 100) : 0,
    ingresos: Number(facturasMonto._sum.VALOR ?? 0),
    ordenesInternas: ordenesInternas,
  };

  return { kpis, certificados: certs, tecnicos, trazabilidad, filtrosAplicados: filtros };
}

async function cargarLogoReporte(): Promise<Buffer | null> {
  const candidatos = [
    process.env.REPORT_LOGO_PATH,
    resolve(process.cwd(), '../Frontend/public/logo.png'),
    resolve(process.cwd(), 'Frontend/public/logo.png'),
  ].filter((ruta): ruta is string => Boolean(ruta));
  for (const ruta of candidatos) {
    try {
      return await readFile(ruta);
    } catch {
      // En una instalación que no monte Frontend/public, se conserva el reporte
      // con su encabezado textual y sin logo.
    }
  }
  return null;
}

const fechaReporte = (value: string | null): string =>
  value ? new Date(value).toLocaleDateString('es-CO') : '—';

const filtrosComoTexto = (filtros: FiltrosReporte): string => {
  const activos = [
    filtros.fechaInicio && `Desde: ${filtros.fechaInicio}`,
    filtros.fechaFin && `Hasta: ${filtros.fechaFin}`,
    filtros.tipoServicio && `Servicio: ${filtros.tipoServicio}`,
    filtros.cliente && `Cliente: ${filtros.cliente}`,
    filtros.tecnico && `Técnico: ${filtros.tecnico}`,
  ].filter(Boolean);
  return activos.length ? activos.join(' · ') : 'Sin filtros; se incluyen todos los registros disponibles.';
};

type ExportColumn = { name: string; width: number; numFmt?: string };

function agregarTablaExcel(
  worksheet: ExcelJS.Worksheet,
  tableName: string,
  columns: ExportColumn[],
  rows: Array<Array<string | number>>,
): void {
  worksheet.addTable({
    name: tableName,
    ref: 'A7',
    headerRow: true,
    totalsRow: false,
    style: { theme: 'TableStyleMedium2', showRowStripes: true, showColumnStripes: false },
    columns: columns.map((column) => ({ name: column.name, filterButton: true })),
    rows,
  });
  columns.forEach((column, index) => {
    worksheet.getColumn(index + 1).width = column.width;
    if (column.numFmt) {
      for (let row = 8; row < 8 + rows.length; row += 1) {
        worksheet.getCell(row, index + 1).numFmt = column.numFmt;
      }
    }
  });
}

function prepararHojaExcel(
  wb: ExcelJS.Workbook,
  nombre: string,
  tableName: string,
  columns: ExportColumn[],
  rows: Array<Array<string | number>>,
  filtros: FiltrosReporte,
  logoId: number | null,
  nota?: string,
): ExcelJS.Worksheet {
  const worksheet = wb.addWorksheet(nombre, {
    views: [{ state: 'frozen', ySplit: 7, xSplit: 1 }],
    properties: { defaultRowHeight: 20 },
  });
  worksheet.mergeCells('C1:G1');
  worksheet.getCell('C1').value = 'Reportes y Consolidados · MetroSoft USC';
  worksheet.getCell('C1').font = { name: 'Aptos Display', size: 18, bold: true, color: { argb: 'FF17356B' } };
  worksheet.getCell('C2').value = nombre;
  worksheet.getCell('C2').font = { name: 'Aptos', size: 12, bold: true, color: { argb: 'FF5680F9' } };
  worksheet.mergeCells('C3:G3');
  worksheet.getCell('C3').value = `Generado: ${new Date().toLocaleString('es-CO')}`;
  worksheet.getCell('C3').font = { name: 'Aptos', size: 9, color: { argb: 'FF64748B' } };
  worksheet.mergeCells('A5:G5');
  worksheet.getCell('A5').value = `Filtros aplicados: ${filtrosComoTexto(filtros)}${nota ? ` · ${nota}` : ''}`;
  worksheet.getCell('A5').font = { name: 'Aptos', size: 9, italic: true, color: { argb: 'FF475569' } };
  worksheet.getCell('A5').alignment = { wrapText: true, vertical: 'middle' };
  worksheet.getRow(5).height = 30;
  if (logoId != null) {
    worksheet.addImage(logoId, { tl: { col: 0, row: 0 }, ext: { width: 130, height: 74 } });
  }
  agregarTablaExcel(worksheet, tableName, columns, rows);
  return worksheet;
}

// ======================================================================
// EXPORTACIÓN EXCEL — tablas nativas con autofiltro y filas congeladas.
// ======================================================================
export async function generarReporteExcel(datos: DatosReporte): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'MetroSoft USC';
  wb.subject = 'Reporte de operación, certificados y trazabilidad';
  wb.created = new Date();
  const logo = await cargarLogoReporte();
  const logoId = logo ? wb.addImage({ base64: logo.toString('base64'), extension: 'png' }) : null;

  prepararHojaExcel(wb, 'Indicadores', 'TablaIndicadores', [
    { name: 'Indicador', width: 34 },
    { name: 'Valor', width: 20 },
  ], [
    ['Cotizaciones emitidas', datos.kpis.cotizacionesEmitidas],
    ['Tasa de conversión (%)', datos.kpis.tasaConversion],
    ['Ingresos facturados (COP)', datos.kpis.ingresos],
    ['Órdenes internas USC', datos.kpis.ordenesInternas],
  ], datos.filtrosAplicados, logoId, 'Indicadores generales del sistema.');

  const hojaTecnicos = prepararHojaExcel(wb, 'Resumen por técnico', 'TablaTecnicos', [
    { name: 'Técnico', width: 34 },
    { name: 'OT atendidas', width: 16 },
    { name: 'Equipos calibrados', width: 20 },
    { name: 'Promedio días por OT', width: 22, numFmt: '0.0' },
  ], datos.tecnicos.map((tecnico) => [
    tecnico.tecnico,
    tecnico.ots,
    tecnico.equipos,
    Number(tecnico.promedioDias.toFixed(1)),
  ]), datos.filtrosAplicados, logoId);
  hojaTecnicos.getColumn(4).numFmt = '0.0';

  prepararHojaExcel(wb, 'Certificados', 'TablaCertificados', [
    { name: 'Código certificado', width: 25 },
    { name: 'Orden de trabajo', width: 20 },
    { name: 'Cliente', width: 32 },
    { name: 'NIT', width: 18 },
    { name: 'Instrumento', width: 32 },
    { name: 'Estampilla', width: 20 },
    { name: 'Tipo de servicio', width: 24 },
    { name: 'Técnico', width: 30 },
    { name: 'Fecha de calibración', width: 22 },
  ], datos.certificados.map((certificado) => [
    certificado.codigo,
    certificado.ot,
    certificado.cliente,
    certificado.nit,
    certificado.instrumento,
    certificado.estampilla ?? '',
    certificado.tipoServicio ?? '—',
    certificado.tecnico,
    fechaReporte(certificado.fecha),
  ]), datos.filtrosAplicados, logoId);

  prepararHojaExcel(wb, 'Trazabilidad', 'TablaTrazabilidad', [
    { name: 'Factura', width: 22 },
    { name: 'Cliente', width: 32 },
    { name: 'Fecha', width: 18 },
    { name: 'Valor (COP)', width: 18, numFmt: '"$" #,##0' },
    { name: 'Órdenes de trabajo', width: 36 },
    { name: 'Equipos', width: 12 },
    { name: 'Certificados', width: 36 },
    { name: 'Técnicos', width: 34 },
    { name: 'Tipos de servicio', width: 30 },
  ], datos.trazabilidad.map((traza) => [
    traza.factura,
    traza.cliente,
    fechaReporte(traza.fecha),
    traza.valor,
    traza.ots,
    traza.equipos,
    traza.cert ?? '—',
    traza.tecnico,
    traza.tipoServicio,
  ]), datos.filtrosAplicados, logoId);

  return Buffer.from(await wb.xlsx.writeBuffer());
}

// ======================================================================
// EXPORTACIÓN PDF — tablas con cuadrícula, paginación y encabezados repetidos.
// ======================================================================
export async function generarReportePdf(datos: DatosReporte): Promise<Buffer> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const pageW = 842;
  const pageH = 595;
  const margin = 28;
  const contentW = pageW - margin * 2;
  const navy = rgb(0.08, 0.14, 0.29);
  const blue = rgb(0.15, 0.34, 0.72);
  const light = rgb(0.94, 0.96, 0.99);
  const line = rgb(0.78, 0.82, 0.88);
  const ink = rgb(0.14, 0.19, 0.27);
  const logoBytes = await cargarLogoReporte();
  const logo = logoBytes ? await doc.embedPng(logoBytes) : null;
  const pages: ReturnType<typeof doc.addPage>[] = [];
  let page: ReturnType<typeof doc.addPage>;
  let y = 0;

  const pdfText = (value: string): string => value.replace(/[^\u0000-\u00FF]/g, ' ');
  const wrap = (value: string, maxWidth: number, size: number, face = font): string[] => {
    const words = pdfText(value || '—').split(/\s+/);
    const lines: string[] = [];
    let current = '';
    for (const word of words) {
      const candidate = current ? `${current} ${word}` : word;
      if (face.widthOfTextAtSize(candidate, size) <= maxWidth || !current) current = candidate;
      else { lines.push(current); current = word; }
    }
    if (current) lines.push(current);
    return lines.length ? lines : ['—'];
  };
  const createPage = () => {
    page = doc.addPage([pageW, pageH]);
    pages.push(page);
    page.drawRectangle({ x: 0, y: pageH - 82, width: pageW, height: 82, color: navy });
    if (logo) {
      const scale = Math.min(112 / logo.width, 60 / logo.height);
      const width = logo.width * scale;
      const height = logo.height * scale;
      page.drawImage(logo, { x: margin, y: pageH - 70 + (60 - height) / 2, width, height });
    }
    const titleX = margin + (logo ? 128 : 0);
    page.drawText('REPORTES Y CONSOLIDADOS', {
      x: titleX, y: pageH - 39, size: 16, font: bold, color: rgb(1, 1, 1),
    });
    page.drawText('MetroSoft USC · Informe operativo', {
      x: titleX, y: pageH - 58, size: 9, font, color: rgb(0.82, 0.87, 0.96),
    });
    const filterLines = wrap(`Filtros: ${filtrosComoTexto(datos.filtrosAplicados)}`, contentW, 7.5);
    filterLines.slice(0, 2).forEach((text, index) => page.drawText(text, {
      x: margin, y: pageH - 98 - index * 10, size: 7.5, font, color: rgb(0.32, 0.39, 0.5),
    }));
    y = pageH - 124;
  };

  type PdfColumn = { title: string; width: number };
  const drawTable = (title: string, columns: PdfColumn[], rows: string[][]) => {
    const widths = columns.map((column) => contentW * column.width / columns.reduce((sum, c) => sum + c.width, 0));
    const fontSize = columns.length > 7 ? 6.5 : columns.length > 4 ? 7 : 8;
    const lineHeight = fontSize + 2.2;
    const headerHeight = 25;
    const drawSectionHeading = () => {
      y -= 19;
      page.drawRectangle({ x: margin, y: y - 2, width: 3, height: 14, color: blue });
      page.drawText(pdfText(title), { x: margin + 10, y, size: 11, font: bold, color: navy });
      y -= 8;
    };
    const drawHead = () => {
      let x = margin;
      for (let i = 0; i < columns.length; i += 1) {
        page.drawRectangle({ x, y: y - headerHeight, width: widths[i], height: headerHeight, color: navy, borderColor: line, borderWidth: 0.4 });
        const lines = wrap(columns[i].title, widths[i] - 8, 7, bold).slice(0, 2);
        lines.forEach((text, lineIndex) => page.drawText(text, {
          x: x + 4, y: y - 10 - lineIndex * 8, size: 7, font: bold, color: rgb(1, 1, 1),
        }));
        x += widths[i];
      }
      y -= headerHeight;
    };
    const startSection = () => { drawSectionHeading(); drawHead(); };
    if (y < 155) createPage();
    startSection();
    rows.forEach((row, rowIndex) => {
      const cells = row.map((value, index) => wrap(value, widths[index] - 8, fontSize));
      const rowHeight = Math.max(22, Math.max(...cells.map((cell) => cell.length)) * lineHeight + 8);
      if (y - rowHeight < 38) {
        createPage();
        startSection();
      }
      let x = margin;
      for (let i = 0; i < columns.length; i += 1) {
        page.drawRectangle({
          x, y: y - rowHeight, width: widths[i], height: rowHeight,
          color: rowIndex % 2 === 0 ? rgb(1, 1, 1) : light,
          borderColor: line, borderWidth: 0.35,
        });
        cells[i].forEach((text, lineIndex) => page.drawText(text, {
          x: x + 4, y: y - 6 - fontSize - lineIndex * lineHeight,
          size: fontSize, font, color: ink,
        }));
        x += widths[i];
      }
      y -= rowHeight;
    });
    y -= 8;
  };

  createPage();
  drawTable('Indicadores generales', [
    { title: 'Indicador', width: 3 }, { title: 'Valor', width: 1 },
  ], [
    ['Cotizaciones emitidas', String(datos.kpis.cotizacionesEmitidas)],
    ['Tasa de conversión', `${datos.kpis.tasaConversion}%`],
    ['Ingresos facturados (COP)', new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(datos.kpis.ingresos)],
    ['Órdenes internas USC', String(datos.kpis.ordenesInternas)],
  ]);
  drawTable('Resumen por técnico', [
    { title: 'Técnico', width: 4 }, { title: 'OT atendidas', width: 1.3 },
    { title: 'Equipos calibrados', width: 1.5 }, { title: 'Promedio días por OT', width: 1.8 },
  ], datos.tecnicos.map((t) => [t.tecnico, String(t.ots), String(t.equipos), t.promedioDias.toFixed(1)]));
  drawTable('Certificados', [
    { title: 'Código certificado', width: 2.1 }, { title: 'OT', width: 1.3 },
    { title: 'Cliente', width: 2.2 }, { title: 'NIT', width: 1.4 },
    { title: 'Instrumento', width: 2.2 }, { title: 'Estampilla', width: 1.4 },
    { title: 'Servicio', width: 1.5 }, { title: 'Técnico', width: 1.8 }, { title: 'Fecha', width: 1.2 },
  ], datos.certificados.map((c) => [
    c.codigo, c.ot, c.cliente, c.nit, c.instrumento, c.estampilla ?? '—',
    c.tipoServicio ?? '—', c.tecnico, fechaReporte(c.fecha),
  ]));
  drawTable('Trazabilidad de facturación y servicio', [
    { title: 'Factura', width: 1.5 }, { title: 'Cliente', width: 2 },
    { title: 'Fecha', width: 1.1 }, { title: 'Valor COP', width: 1.4 },
    { title: 'Órdenes de trabajo', width: 2.1 }, { title: 'Equipos', width: 0.8 },
    { title: 'Certificados', width: 2.2 }, { title: 'Técnicos', width: 1.8 }, { title: 'Tipos de servicio', width: 1.8 },
  ], datos.trazabilidad.map((t) => [
    t.factura, t.cliente, fechaReporte(t.fecha),
    new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(t.valor),
    t.ots, String(t.equipos), t.cert ?? '—', t.tecnico, t.tipoServicio,
  ]));

  pages.forEach((pdfPage, index) => {
    pdfPage.drawLine({ start: { x: margin, y: 27 }, end: { x: pageW - margin, y: 27 }, thickness: 0.6, color: line });
    pdfPage.drawText(`Generado ${new Date().toLocaleString('es-CO')}  ·  Página ${index + 1} de ${pages.length}`, {
      x: margin, y: 14, size: 7, font, color: rgb(0.38, 0.43, 0.52),
    });
  });

  return Buffer.from(await doc.save());
}
