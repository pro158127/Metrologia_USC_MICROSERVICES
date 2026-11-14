// services/reportes.service.ts
// Consolida los datos de reportes con joins correctos y genera los archivos
// de exportación (PDF / Excel) sin depender de Fastify ni del worker.
import { PrismaClient } from '@prisma/client';
import ExcelJS from 'exceljs';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

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
      const otDetalle =
        ot?.orden_trabajo_detalles.find((d) => d.INSTRUMENTO === det?.INSTRUMENTO) ??
        ot?.orden_trabajo_detalles.find((d) => d.ITEM === det?.ITEM) ??
        null;
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
        include: { recepciones_equipo: { include: { ordenes_trabajo: true } } },
      },
    },
  });

  const gruposTecnico = new Map<
    number,
    { nombre: string; otIds: Set<number>; equipos: number; dias: number; ots: number }
  >();
  for (const cal of calibraciones) {
    const id = cal.ID_TECNICO_FK;
    if (!id) continue;
    const ot = cal.recepcion_equipo_detalles?.recepciones_equipo?.ordenes_trabajo ?? null;
    const g = gruposTecnico.get(id) ?? {
      nombre: cal.usuarios?.NOMBRE_COMPLETO ?? `Técnico ${id}`,
      otIds: new Set<number>(),
      equipos: 0,
      dias: 0,
      ots: 0,
    };
    g.equipos += 1;
    if (ot?.ID_ORDEN_TRABAJO) g.otIds.add(ot.ID_ORDEN_TRABAJO);
    if (ot?.CREATED_AT && cal.CREATED_AT) {
      g.dias += Math.max(0, (cal.CREATED_AT.getTime() - ot.CREATED_AT.getTime()) / 86400000);
    }
    gruposTecnico.set(id, g);
  }

  const tecnicos: TecnicoReporte[] = Array.from(gruposTecnico.entries())
    .map(([, g]) => ({
      tecnico: g.nombre,
      ots: g.otIds.size,
      equipos: g.equipos,
      promedioDias: g.ots > 0 ? g.dias / g.ots : 0,
    }))
    .filter((t) => !filtros.tecnico || norm(t.tecnico) === norm(filtros.tecnico))
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
          recepciones_equipo: {
            include: {
              recepcion_equipo_detalles: {
                include: { calibraciones: { include: { certificados: true } } },
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
      const certs = (ot?.recepciones_equipo ?? []).flatMap((rec) =>
        (rec.recepcion_equipo_detalles ?? []).flatMap((det) =>
          det.calibraciones?.certificados ? [det.calibraciones.certificados.CODIGO_CERTIFICADO] : [],
        ),
      );
      return {
        factura: f.NUMERO_FACTURA,
        cliente: f.clientes?.RAZON_SOCIAL ?? ot?.clientes?.RAZON_SOCIAL ?? '—',
        fecha: f.FECHA ? f.FECHA.toISOString() : null,
        valor: Number(f.VALOR ?? 0),
        ots: ot?.CODIGO_OT ?? '—',
        equipos: (ot?.recepciones_equipo ?? []).reduce(
          (acc, r) => acc + (r.recepcion_equipo_detalles?.length ?? 0),
          0,
        ),
        cert: certs.length > 0 ? certs.join(', ') : null,
      };
    })
    .filter((t) => !filtros.cliente || norm(t.cliente).includes(norm(filtros.cliente)));

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

  return { kpis, certificados: certs, tecnicos, trazabilidad };
}

// ======================================================================
// EXPORTACIÓN EXCEL
// ======================================================================
export async function generarReporteExcel(datos: DatosReporte): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'MetroSoft USC';

  const kpi = wb.addWorksheet('KPIs');
  kpi.columns = [
    { header: 'Indicador', key: 'k', width: 30 },
    { header: 'Valor', key: 'v', width: 20 },
  ];
  kpi.addRows([
    { k: 'Cotizaciones emitidas', v: datos.kpis.cotizacionesEmitidas },
    { k: 'Tasa de conversión (%)', v: datos.kpis.tasaConversion },
    { k: 'Ingresos facturados', v: datos.kpis.ingresos },
    { k: 'Órdenes internas USC', v: datos.kpis.ordenesInternas },
  ]);

  const tec = wb.addWorksheet('Resumen por técnico');
  tec.columns = [
    { header: 'Técnico', key: 'tecnico', width: 40 },
    { header: 'OT completadas', key: 'ots', width: 16 },
    { header: 'Equipos calibrados', key: 'equipos', width: 18 },
    { header: 'Promedio días', key: 'dias', width: 16 },
  ];
  tec.addRows(
    datos.tecnicos.map((t) => ({
      tecnico: t.tecnico,
      ots: t.ots,
      equipos: t.equipos,
      dias: Number(t.promedioDias.toFixed(1)),
    })),
  );

  const cert = wb.addWorksheet('Certificados');
  cert.columns = [
    { header: 'N° Certificado', key: 'codigo', width: 24 },
    { header: 'Instrumento', key: 'instrumento', width: 30 },
    { header: 'Estampilla', key: 'estampilla', width: 18 },
    { header: 'Cliente', key: 'cliente', width: 30 },
    { header: 'NIT', key: 'nit', width: 16 },
    { header: 'Técnico', key: 'tecnico', width: 28 },
    { header: 'OT', key: 'ot', width: 18 },
    { header: 'Fecha', key: 'fecha', width: 16 },
  ];
  cert.addRows(
    datos.certificados.map((c) => ({
      codigo: c.codigo,
      instrumento: c.instrumento,
      estampilla: c.estampilla ?? '',
      cliente: c.cliente,
      nit: c.nit,
      tecnico: c.tecnico,
      ot: c.ot,
      fecha: c.fecha ? new Date(c.fecha).toLocaleDateString('es-CO') : '',
    })),
  );

  const traz = wb.addWorksheet('Trazabilidad');
  traz.columns = [
    { header: 'Factura', key: 'factura', width: 20 },
    { header: 'Cliente', key: 'cliente', width: 30 },
    { header: 'Fecha', key: 'fecha', width: 16 },
    { header: 'Valor', key: 'valor', width: 16 },
    { header: 'OT', key: 'ots', width: 18 },
    { header: 'Equipos', key: 'equipos', width: 12 },
    { header: 'Certificados', key: 'cert', width: 30 },
  ];
  traz.addRows(
    datos.trazabilidad.map((t) => ({
      factura: t.factura,
      cliente: t.cliente,
      fecha: t.fecha ? new Date(t.fecha).toLocaleDateString('es-CO') : '',
      valor: t.valor,
      ots: t.ots,
      equipos: t.equipos,
      cert: t.cert ?? '',
    })),
  );

  return Buffer.from(await wb.xlsx.writeBuffer());
}

// ======================================================================
// EXPORTACIÓN PDF (texto plano con tablas simples)
// ======================================================================
export async function generarReportePdf(datos: DatosReporte): Promise<Buffer> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);

  let y = 0;
  const pageH = 792;
  const margin = 50;
  let page = doc.addPage([612, pageH]);

  const newPageIfNeeded = (needed = 60) => {
    if (y < needed) {
      page = doc.addPage([612, pageH]);
      y = pageH - margin;
    }
  };

  const drawTitle = (text: string) => {
    newPageIfNeeded(80);
    y -= 20;
    page.drawText(text, { x: margin, y, size: 14, font: bold, color: rgb(0.1, 0.1, 0.2) });
    y -= 8;
  };

  const drawRow = (text: string) => {
    newPageIfNeeded(30);
    y -= 14;
    page.drawText(text, { x: margin, y, size: 9, font, color: rgb(0.2, 0.2, 0.2) });
  };

  drawTitle('Reporte y Consolidados — MetroSoft USC');

  drawTitle('KPIs');
  drawRow(`Cotizaciones emitidas: ${datos.kpis.cotizacionesEmitidas}`);
  drawRow(`Tasa de conversión: ${datos.kpis.tasaConversion}%`);
  drawRow(`Ingresos facturados: ${datos.kpis.ingresos}`);
  drawRow(`Órdenes internas USC: ${datos.kpis.ordenesInternas}`);

  drawTitle('Resumen por técnico');
  drawRow('Técnico | OT completadas | Equipos calibrados | Promedio días');
  for (const t of datos.tecnicos) {
    drawRow(`${t.tecnico} | ${t.ots} | ${t.equipos} | ${t.promedioDias.toFixed(1)}`);
  }

  drawTitle('Certificados');
  drawRow('N° Cert | Instrumento | Estampilla | Cliente | NIT | Técnico | OT | Fecha');
  for (const c of datos.certificados) {
    drawRow(
      `${c.codigo} | ${c.instrumento} | ${c.estampilla ?? ''} | ${c.cliente} | ${c.nit} | ${c.tecnico} | ${c.ot} | ${
        c.fecha ? new Date(c.fecha).toLocaleDateString('es-CO') : ''
      }`,
    );
  }

  drawTitle('Trazabilidad');
  drawRow('Factura | Cliente | Fecha | Valor | OT | Equipos | Certificados');
  for (const t of datos.trazabilidad) {
    drawRow(
      `${t.factura} | ${t.cliente} | ${t.fecha ? new Date(t.fecha).toLocaleDateString('es-CO') : ''} | ${t.valor} | ${t.ots} | ${t.equipos} | ${t.cert ?? ''}`,
    );
  }

  return Buffer.from(await doc.save());
}
