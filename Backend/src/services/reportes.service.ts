// services/reportes.service.ts
// Consolida los datos de reportes con joins correctos y genera los archivos
// de exportación (PDF / Excel) sin depender de Fastify ni del worker.
import { PrismaClient, Prisma } from '@prisma/client';
import ExcelJS from 'exceljs';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import sharp from 'sharp';
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
  series: { mes: string; interno: number; externo: number; tasa: number }[];
  certificados: CertificadoReporte[];
  tecnicos: TecnicoReporte[];
  trazabilidad: TrazabilidadReporte[];
  filtrosAplicados: FiltrosReporte;
}

export interface FilaAuditoriaFactura {
  orden: string;
  estadoOt: string;
  sitio: string;
  recepcion: string;
  fechaRecepcion: string | null;
  instrumento: string;
  marca: string;
  modelo: string;
  serie: string;
  codigoInventario: string;
  estampilla: string;
  tecnico: string;
  fechaCalibracion: string | null;
  certificado: string;
  estadoCertificado: string;
}

export interface ReporteAuditoriaFactura {
  numeroFactura: string;
  cliente: string;
  nit: string;
  fecha: string | null;
  valor: number;
  estado: string;
  ordenFactura: string;
  filas: FilaAuditoriaFactura[];
}

function enRangoFecha(fecha: Date | null | undefined, inicio?: string, fin?: string): boolean {
  if (!fecha) return false;
  const t = fecha.getTime();
  if (inicio && t < new Date(`${inicio}T00:00:00-05:00`).getTime()) return false;
  if (fin && t > new Date(`${fin}T23:59:59.999-05:00`).getTime()) return false;
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
      certificados: { select: { ESTADO_REVISION: true } },
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
    if (!cal.certificados) continue;
    g.equipos += 1;
    if (ot?.VIGENTE && (ot.estado === 'Certificado_aprobado' || ot.estado === 'Certificado_enviado') &&
        ot.CREATED_AT && cal.CREATED_AT) {
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
      if (filtros.tecnico && !t.tecnico.split(', ').some((nombre) => norm(nombre) === norm(filtros.tecnico))) return false;
      if (filtros.tipoServicio && !t.tipoServicio.split(', ').some((tipo) => norm(tipo) === norm(filtros.tipoServicio))) return false;
      return true;
    });

  // ======================================================================
  // 4. KPIs
  // ======================================================================
  const otPorTecnico = filtros.tecnico
    ? calibraciones.filter((cal) => norm(cal.usuarios?.NOMBRE_COMPLETO) === norm(filtros.tecnico))
      .map((cal) => cal.recepcion_equipo_detalles?.recepciones_equipo?.ordenes_trabajo).filter((ot) => ot != null)
    : [];
  const idsCotizacionesPorTecnico = [...new Set(otPorTecnico.flatMap((ot) => ot.ID_COTIZACION_FK == null ? [] : [ot.ID_COTIZACION_FK]))];
  const idsOtPorTecnico = [...new Set(otPorTecnico.map((ot) => ot.ID_ORDEN_TRABAJO))];
  const cliente = filtros.cliente ? { RAZON_SOCIAL: { contains: filtros.cliente, mode: 'insensitive' as const } } : undefined;
  const servicio = filtros.tipoServicio ? { equals: filtros.tipoServicio, mode: 'insensitive' as const } : undefined;
  const [cotizaciones, ordenes] = await Promise.all([
    prisma.cotizaciones.findMany({
      where: {
        ...(cliente ? { clientes: cliente } : {}),
        ...(servicio ? { cotizacion_detalles: { some: { activacion: true, TIPO_SERVICIO: servicio } } } : {}),
        ...(filtros.tecnico ? { ID_COTIZACION: { in: idsCotizacionesPorTecnico } } : {}),
      },
      select: { CREATED_AT: true, ESTADO: true, historial_estado_cotizacion: {
        where: { ESTADO_NUEVO: { in: ['ENVIADA', 'APROBADA'] } },
        orderBy: { CREATED_AT: 'asc' },
        select: { ESTADO_NUEVO: true, CREATED_AT: true },
      } },
    }),
    prisma.ordenes_trabajo.findMany({
      where: {
        VIGENTE: true,
        estado: { not: 'Certificado_enviado' },
        orden_trabajo_hijas: { none: {} },
        recepciones_equipo: { some: { VIGENTE: true, activacion: true } },
        ...(cliente ? { clientes: cliente } : {}),
        ...(servicio ? { orden_trabajo_detalles: { some: { AND: [
          { OR: [{ activacion: true }, { activacion: null }] },
          { TIPO_SERVICIO: servicio },
        ] } } } : {}),
        ...(filtros.tecnico ? { ID_ORDEN_TRABAJO: { in: idsOtPorTecnico } } : {}),
      },
      orderBy: [{ VERSION: 'desc' }, { ID_ORDEN_TRABAJO: 'desc' }],
      select: { ID_COTIZACION_FK: true, ID_OT_RAIZ: true, ID_ORDEN_TRABAJO: true, CREATED_AT: true,
        SITIO_CALIBRACION: true, ES_INTERNO_USC: true, ES_EN_SITIO: true },
    }),
  ]);
  const enPeriodo = (fecha: Date | null | undefined) => (!filtros.fechaInicio && !filtros.fechaFin) ||
    enRangoFecha(fecha, filtros.fechaInicio, filtros.fechaFin);
  const emitidas = cotizaciones.flatMap((cot) => {
    const evento = cot.historial_estado_cotizacion.find((h) => h.ESTADO_NUEVO === 'ENVIADA');
    const fecha = evento?.CREATED_AT ?? (cot.ESTADO !== 'BORRADOR' ? cot.CREATED_AT : null);
    if (!fecha || !enPeriodo(fecha)) return [];
    return [{ fecha, aprobada: cot.historial_estado_cotizacion.some((h) => h.ESTADO_NUEVO === 'APROBADA') ||
      cot.ESTADO === 'APROBADA' || cot.ESTADO === 'EN_SEGUIMIENTO' }];
  });
  const porGrupo = new Map<string, { fecha: Date | null; interno: boolean }>();
  for (const ot of ordenes) {
    const sitio = ot.SITIO_CALIBRACION ?? (ot.ES_INTERNO_USC ? 'INTERNO_USC' : ot.ES_EN_SITIO ? 'CLIENTE' : 'LABORATORIO');
    const familia = ot.ID_COTIZACION_FK != null ? `cot:${ot.ID_COTIZACION_FK}` : `ot:${ot.ID_OT_RAIZ ?? ot.ID_ORDEN_TRABAJO}`;
    const grupo = `${familia}:${sitio}`;
    if (!porGrupo.has(grupo)) porGrupo.set(grupo, { fecha: ot.CREATED_AT, interno: sitio === 'INTERNO_USC' });
  }
  const operativas = [...porGrupo.values()].filter((ot) => enPeriodo(ot.fecha));
  const calcularConversion = (cotizacionesDelPeriodo: typeof emitidas) => cotizacionesDelPeriodo.length
    ? Math.round(cotizacionesDelPeriodo.filter((cot) => cot.aprobada).length / cotizacionesDelPeriodo.length * 100)
    : 0;
  const zona = 'America/Bogota';
  const claveMes = new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', timeZone: zona });
  const etiquetaMes = new Intl.DateTimeFormat('es-CO', { month: 'short', year: '2-digit', timeZone: zona });
  const fechaReferencia = filtros.fechaFin ? new Date(`${filtros.fechaFin}T12:00:00-05:00`) : new Date();
  const ultimoDia = Number.isNaN(fechaReferencia.getTime()) ? new Date() : fechaReferencia;
  const [anio, mes] = claveMes.format(ultimoDia).split('-').map(Number);
  const series = Array.from({ length: 6 }, (_, indice) => {
    const fecha = new Date(Date.UTC(anio, mes - 6 + indice, 15, 12));
    const clave = claveMes.format(fecha);
    const ordenesDelMes = operativas.filter((ot) => ot.fecha && claveMes.format(ot.fecha) === clave);
    const interno = ordenesDelMes.filter((ot) => ot.interno).length;
    return { mes: etiquetaMes.format(fecha), interno, externo: ordenesDelMes.length - interno,
      tasa: calcularConversion(emitidas.filter((cot) => claveMes.format(cot.fecha) === clave)) };
  });
  const kpis = {
    cotizacionesEmitidas: emitidas.length,
    tasaConversion: calcularConversion(emitidas),
    ingresos: Number(trazabilidad.reduce((total, factura) => total.plus(factura.valor), new Prisma.Decimal(0))),
    ordenesInternas: operativas.filter((ot) => ot.interno).length,
  };

  return { kpis, series, certificados: certs, tecnicos, trazabilidad, filtrosAplicados: filtros };
}

/** Consulta una sola factura y sigue sus OTs operativas, recepciones, unidades y certificados. */
export async function obtenerReporteAuditoriaFactura(
  prisma: PrismaClient,
  numeroFactura: string,
): Promise<ReporteAuditoriaFactura | null> {
  const factura = await prisma.facturas.findUnique({
    where: { NUMERO_FACTURA: numeroFactura.trim() },
    include: {
      clientes: true,
      ordenes_trabajo: {
        include: {
          orden_trabajo_hijas: {
            where: { VIGENTE: true },
            include: {
              orden_trabajo_detalles: true,
              recepciones_equipo: {
                where: { VIGENTE: true, activacion: true },
                include: {
                  recepcion_equipo_detalles: {
                    where: { OR: [{ activacion: true }, { activacion: null }] },
                    include: { calibraciones: { include: { usuarios: true, certificados: true } } },
                  },
                },
              },
            },
          },
          orden_trabajo_detalles: true,
          recepciones_equipo: {
            where: { VIGENTE: true, activacion: true },
            include: {
              recepcion_equipo_detalles: {
                where: { OR: [{ activacion: true }, { activacion: null }] },
                include: { calibraciones: { include: { usuarios: true, certificados: true } } },
              },
            },
          },
        },
      },
    },
  });
  if (!factura) return null;

  const ordenRaiz = factura.ordenes_trabajo;
  const ordenes = ordenRaiz?.orden_trabajo_hijas?.length
    ? ordenRaiz.orden_trabajo_hijas
    : ordenRaiz
      ? [ordenRaiz]
      : [];
  const filas: FilaAuditoriaFactura[] = [];
  for (const orden of ordenes) {
    const sitio = orden.SITIO_CALIBRACION ?? (orden.ES_INTERNO_USC ? 'INTERNO_USC' : orden.ES_EN_SITIO ? 'CLIENTE' : 'LABORATORIO');
    for (const recepcion of orden.recepciones_equipo ?? []) {
      for (const detalle of recepcion.recepcion_equipo_detalles ?? []) {
        const calibracion = detalle.calibraciones;
        const certificado = calibracion?.certificados;
        filas.push({
          orden: orden.CODIGO_OT,
          estadoOt: String(orden.estado ?? '—'),
          sitio: String(sitio),
          recepcion: recepcion.CODIGO_RECEPCION,
          fechaRecepcion: recepcion.FECHA_RECEPCION?.toISOString() ?? null,
          instrumento: detalle.INSTRUMENTO,
          marca: detalle.MARCA ?? '—',
          modelo: detalle.MODELO ?? '—',
          serie: detalle.SERIE ?? '—',
          codigoInventario: detalle.CODIGO_INVENTARIO ?? '—',
          estampilla: detalle.ESTAMPILLA ?? '—',
          tecnico: calibracion?.usuarios?.NOMBRE_COMPLETO ?? '—',
          fechaCalibracion: calibracion?.CREATED_AT?.toISOString() ?? null,
          certificado: certificado?.CODIGO_CERTIFICADO ?? '—',
          estadoCertificado: certificado?.ESTADO_REVISION ?? 'SIN_CERTIFICADO',
        });
      }
    }
  }

  return {
    numeroFactura: factura.NUMERO_FACTURA,
    cliente: factura.clientes?.RAZON_SOCIAL ?? ordenRaiz?.Razon_social ?? '—',
    nit: factura.clientes?.NIT ?? ordenRaiz?.NIT ?? '—',
    fecha: factura.FECHA?.toISOString() ?? null,
    valor: Number(factura.VALOR),
    estado: factura.ESTADO,
    ordenFactura: ordenRaiz?.CODIGO_OT ?? '—',
    filas,
  };
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

const escaparSvg = (valor: string): string => valor.replace(/[&<>"']/g, (caracter) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;',
}[caracter] ?? caracter));

function crearGraficasSvg(datos: DatosReporte): [string, string] {
  const ancho = 1000;
  const alto = 360;
  const izquierda = 72;
  const derecha = 32;
  const arriba = 62;
  const abajo = 62;
  const anchoPlot = ancho - izquierda - derecha;
  const altoPlot = alto - arriba - abajo;
  const serie = datos.series.slice(-12);
  const maximo = Math.max(1, ...serie.map((punto) => punto.interno + punto.externo));
  const xCentro = (i: number) => izquierda + anchoPlot * (i + 0.5) / Math.max(1, serie.length);
  const barras = serie.map((punto, i) => {
    const barW = Math.min(54, anchoPlot / Math.max(1, serie.length) * 0.55);
    const totalH = altoPlot * (punto.interno + punto.externo) / maximo;
    const internoH = altoPlot * punto.interno / maximo;
    const x = xCentro(i) - barW / 2;
    const yBase = arriba + altoPlot;
    return `<rect x="${x}" y="${yBase - totalH}" width="${barW}" height="${totalH - internoH}" rx="3" fill="#5680F9"/><rect x="${x}" y="${yBase - internoH}" width="${barW}" height="${internoH}" rx="3" fill="#AFC4FD"/><text x="${xCentro(i)}" y="${alto - 26}" text-anchor="middle" font-size="13" fill="#475569">${escaparSvg(punto.mes)}</text>`;
  }).join('');
  const lineasGuia = [0, 0.5, 1].map((p) => {
    const y = arriba + altoPlot * p;
    return `<line x1="${izquierda}" y1="${y}" x2="${ancho - derecha}" y2="${y}" stroke="#E2E8F0"/><text x="${izquierda - 14}" y="${y + 4}" text-anchor="end" font-size="12" fill="#64748B">${Math.round(maximo * (1 - p))}</text>`;
  }).join('');
  const svgBase = (titulo: string, contenido: string) => `<svg xmlns="http://www.w3.org/2000/svg" width="${ancho}" height="${alto}" viewBox="0 0 ${ancho} ${alto}"><rect width="100%" height="100%" fill="#FFFFFF"/><text x="${izquierda}" y="32" font-family="Arial, sans-serif" font-size="20" font-weight="700" fill="#17356B">${titulo}</text>${contenido}</svg>`;
  const barrasSvg = svgBase('OT operativas vigentes por mes', `${lineasGuia}${barras}<rect x="${izquierda}" y="${alto - 10}" width="13" height="13" fill="#5680F9"/><text x="${izquierda + 20}" y="${alto}" font-size="12" fill="#475569">Externo</text><rect x="${izquierda + 110}" y="${alto - 10}" width="13" height="13" fill="#AFC4FD"/><text x="${izquierda + 130}" y="${alto}" font-size="12" fill="#475569">Interno USC</text>`);

  const puntos = serie.map((punto, i) => ({ x: xCentro(i), y: arriba + altoPlot * (1 - Math.max(0, Math.min(100, punto.tasa)) / 100), tasa: punto.tasa, mes: punto.mes }));
  const conversionGuias = [0, 25, 50, 75, 100].map((valor) => {
    const y = arriba + altoPlot * (1 - valor / 100);
    return `<line x1="${izquierda}" y1="${y}" x2="${ancho - derecha}" y2="${y}" stroke="#E2E8F0"/><text x="${izquierda - 14}" y="${y + 4}" text-anchor="end" font-size="12" fill="#64748B">${valor}%</text>`;
  }).join('');
  const d = puntos.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
  const lineaSvg = svgBase('Tasa de conversión mensual', `${conversionGuias}<path d="${d}" fill="none" stroke="#22C55E" stroke-width="4"/>${puntos.map((p) => `<circle cx="${p.x}" cy="${p.y}" r="5" fill="#22C55E"/><text x="${p.x}" y="${p.y - 12}" text-anchor="middle" font-size="12" fill="#166534">${p.tasa}%</text><text x="${p.x}" y="${alto - 26}" text-anchor="middle" font-size="13" fill="#475569">${escaparSvg(p.mes)}</text>`).join('')}`);
  return [barrasSvg, lineaSvg];
}

async function cargarGraficasPng(datos: DatosReporte): Promise<[Buffer, Buffer]> {
  const svgs = crearGraficasSvg(datos);
  return Promise.all(svgs.map((svg) => sharp(Buffer.from(svg)).png().toBuffer())) as Promise<[Buffer, Buffer]>;
}

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

  const hojaIndicadores = prepararHojaExcel(wb, 'Indicadores', 'TablaIndicadores', [
    { name: 'Indicador', width: 34 },
    { name: 'Valor', width: 20 },
  ], [
    ['Cotizaciones emitidas', datos.kpis.cotizacionesEmitidas],
    ['Tasa de conversión (%)', datos.kpis.tasaConversion],
    ['Ingresos facturados (COP)', datos.kpis.ingresos],
    ['Órdenes internas USC', datos.kpis.ordenesInternas],
  ], datos.filtrosAplicados, logoId, 'Indicadores generales del sistema.');
  const [chartOts, chartConversion] = await cargarGraficasPng(datos);
  const chartOtsId = wb.addImage({ base64: 'data:image/png;base64,' + chartOts.toString('base64'), extension: 'png' });
  const chartConversionId = wb.addImage({ base64: 'data:image/png;base64,' + chartConversion.toString('base64'), extension: 'png' });
  hojaIndicadores.addImage(chartOtsId, { tl: { col: 0, row: 13 }, ext: { width: 760, height: 274 } });
  hojaIndicadores.addImage(chartConversionId, { tl: { col: 0, row: 29 }, ext: { width: 760, height: 274 } });

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
  const [chartOts, chartConversion] = await cargarGraficasPng(datos);
  const pdfChartOts = await doc.embedPng(chartOts);
  const pdfChartConversion = await doc.embedPng(chartConversion);
  const chartW = (contentW - 14) / 2;
  const chartH = chartW * altoGraficaPdfRatio();
  const paginaGraficas = pages[pages.length - 1];
  paginaGraficas.drawImage(pdfChartOts, { x: margin, y: pageH - 112 - chartH, width: chartW, height: chartH });
  paginaGraficas.drawImage(pdfChartConversion, { x: margin + chartW + 14, y: pageH - 112 - chartH, width: chartW, height: chartH });
  y = pageH - 130 - chartH;
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

export async function generarAuditoriaFacturaExcel(datos: ReporteAuditoriaFactura): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'MetroSoft USC';
  wb.subject = 'Trazabilidad de auditoría ' + datos.numeroFactura;
  wb.created = new Date();
  const resumen = wb.addWorksheet('Factura');
  resumen.columns = [{ header: 'Dato', key: 'dato', width: 28 }, { header: 'Valor', key: 'valor', width: 45 }];
  resumen.addRows([
    { dato: 'Número de factura', valor: datos.numeroFactura },
    { dato: 'Cliente', valor: datos.cliente },
    { dato: 'NIT', valor: datos.nit },
    { dato: 'Fecha', valor: fechaReporte(datos.fecha) },
    { dato: 'Valor COP', valor: datos.valor },
    { dato: 'Estado de factura', valor: datos.estado },
    { dato: 'OT asociada a factura', valor: datos.ordenFactura },
    { dato: 'Unidades trazadas', valor: datos.filas.length },
    { dato: 'Generado', valor: new Date().toLocaleString('es-CO') },
  ]);
  resumen.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  resumen.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF17356B' } };

  const detalle = wb.addWorksheet('Trazabilidad por equipo', { views: [{ state: 'frozen', ySplit: 1, xSplit: 3 }] });
  const columns = [
    'Orden de trabajo', 'Estado OT', 'Sitio', 'Recepción', 'Fecha recepción', 'Instrumento',
    'Marca', 'Modelo', 'Serie', 'Código inventario', 'Estampilla', 'Técnico',
    'Fecha calibración', 'Certificado', 'Estado certificado',
  ];
  detalle.addTable({
    name: 'TrazabilidadFactura', ref: 'A1', headerRow: true, totalsRow: false,
    style: { theme: 'TableStyleMedium2', showRowStripes: true, showColumnStripes: false },
    columns: columns.map((name) => ({ name, filterButton: true })),
    rows: datos.filas.map((fila) => [
      fila.orden, fila.estadoOt, fila.sitio, fila.recepcion, fechaReporte(fila.fechaRecepcion),
      fila.instrumento, fila.marca, fila.modelo, fila.serie, fila.codigoInventario,
      fila.estampilla, fila.tecnico, fechaReporte(fila.fechaCalibracion), fila.certificado,
      fila.estadoCertificado,
    ]),
  });
  [22, 24, 20, 22, 20, 32, 20, 20, 20, 22, 18, 30, 20, 24, 24].forEach((width, index) => {
    detalle.getColumn(index + 1).width = width;
  });
  return Buffer.from(await wb.xlsx.writeBuffer());
}

export async function generarAuditoriaFacturaPdf(datos: ReporteAuditoriaFactura): Promise<Buffer> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const width = 842;
  const height = 595;
  const margin = 34;
  const navy = rgb(0.08, 0.14, 0.29);
  const blue = rgb(0.15, 0.34, 0.72);
  const ink = rgb(0.14, 0.19, 0.27);
  const light = rgb(0.94, 0.96, 0.99);
  const safe = (value: string) => value.replace(/[^\u0000-\u00FF]/g, ' ');
  let page = doc.addPage([width, height]);
  let y = height - 119;
  const encabezado = () => {
    page.drawRectangle({ x: 0, y: height - 91, width, height: 91, color: navy });
    page.drawText('REPORTE DE TRAZABILIDAD PARA AUDITORÍA', { x: margin, y: height - 42, size: 16, font: bold, color: rgb(1, 1, 1) });
    page.drawText('Factura ' + safe(datos.numeroFactura) + ' · ' + safe(datos.cliente) + ' · NIT ' + safe(datos.nit), { x: margin, y: height - 64, size: 10, font, color: rgb(0.88, 0.91, 0.97) });
    page.drawText('Fecha: ' + fechaReporte(datos.fecha) + '   Valor: ' + new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(datos.valor) + '   Estado: ' + safe(datos.estado) + '   OT: ' + safe(datos.ordenFactura), { x: margin, y: height - 81, size: 8, font, color: rgb(0.88, 0.91, 0.97) });
    y = height - 119;
    page.drawRectangle({ x: margin, y: y - 22, width: width - margin * 2, height: 22, color: blue });
    page.drawText('OT / Recepción / Instrumento / Identificación / Calibración / Certificado', { x: margin + 8, y: y - 15, size: 8, font: bold, color: rgb(1, 1, 1) });
    y -= 24;
  };
  encabezado();
  for (const [index, fila] of datos.filas.entries()) {
    if (y < 70) {
      page = doc.addPage([width, height]);
      encabezado();
    }
    page.drawRectangle({ x: margin, y: y - 43, width: width - margin * 2, height: 43, color: index % 2 === 0 ? rgb(1, 1, 1) : light, borderColor: rgb(0.78, 0.82, 0.88), borderWidth: 0.4 });
    const lineas = [
      fila.orden + ' (' + fila.estadoOt + ', ' + fila.sitio + ') · ' + fila.recepcion + ' (' + fechaReporte(fila.fechaRecepcion) + ') · ' + fila.instrumento,
      'Marca/modelo/serie: ' + fila.marca + ' / ' + fila.modelo + ' / ' + fila.serie + ' · Inventario: ' + fila.codigoInventario + ' · Estampilla: ' + fila.estampilla,
      'Técnico: ' + fila.tecnico + ' (' + fechaReporte(fila.fechaCalibracion) + ') · Certificado: ' + fila.certificado + ' · Revisión: ' + fila.estadoCertificado,
    ];
    lineas.forEach((texto, i) => page.drawText(safe(texto).slice(0, 170), { x: margin + 8, y: y - 12 - i * 13, size: i === 0 ? 8 : 7.5, font: i === 0 ? bold : font, color: ink }));
    y -= 45;
  }
  if (datos.filas.length === 0) {
    page.drawText('No se encontraron unidades vinculadas a las OT y recepciones vigentes de esta factura.', { x: margin, y: y - 18, size: 9, font, color: ink });
  }
  for (const [index, pdfPage] of doc.getPages().entries()) {
    pdfPage.drawLine({ start: { x: margin, y: 26 }, end: { x: width - margin, y: 26 }, thickness: 0.6, color: rgb(0.78, 0.82, 0.88) });
    pdfPage.drawText('Generado ' + new Date().toLocaleString('es-CO') + ' · Página ' + (index + 1) + ' de ' + doc.getPageCount(), { x: margin, y: 13, size: 7, font, color: rgb(0.38, 0.43, 0.52) });
  }
  return Buffer.from(await doc.save());
}

function altoGraficaPdfRatio(): number { return 360 / 1000; }
