// services/ot-versionado.service.ts
// Versionado de Órdenes de Trabajo en re-importación.
// - Diferencias (diff) entre el Excel entrante y la familia vigente (Master + hijas).
// - Si cambia algo escalar/tabular se crea una NUEVA versión de toda la familia
//   (nuevas filas con código incrementado) y se marca la anterior VIGENTE=false.
// - Si el cambio incluye datos tabulares, también se versiona la Recepción anclada.
// - La Cotización NUNCA se modifica en este flujo.
import { Prisma } from '@prisma/client';
import { generarConsecutivo } from './consecutivo.service.js';
import { InstrumentoResuelto, SitioCalibracion } from './ot-split.service.js';

type Tx = Prisma.TransactionClient;

export interface VersionadoResult {
  cambio: boolean;
  cambioTabular: boolean;
  ots: { id: number; codigo: string; esNueva: boolean }[];
  recepciones: { id: number; codigo: string; esNueva: boolean }[];
}

interface OtFamilia {
  ID_ORDEN_TRABAJO: number;
  CODIGO_OT: string;
  SITIO_CALIBRACION: string | null;
  ID_OT_PADRE_FK: number | null;
  ID_OT_RAIZ: number | null;
  VERSION: number;
  orden_trabajo_detalles: {
    ITEM: number;
    TIPO_SERVICIO: string;
    INSTRUMENTO: string;
    FABRICANTE: string | null;
    MODELO: string | null;
    SERIE: string | null;
    CODIGO_INVENTARIO: string | null;
    UBICACION: string | null;
    PUNTOS_CALIBRAR: string[];
    UNIDAD: string | null;
    INTERVALO_RANGO: string | null;
    RESOLUCION: string | null;
    DECLARACION_CONFORMIDAD: boolean;
    LIMITE_CONTROL_EMC: string | null;
    DOC_ESPECIFICACION: string | null;
    REGLA_DECISION: string | null;
    sitio_calibracion: string | null;
  }[];
  recepciones_equipo: { ID_RECEPCION: number; CODIGO_RECEPCION: string; ID_RECEPCION_RAIZ: number | null; VERSION: number }[];
}

function normalizarValor(v: unknown): unknown {
  if (v instanceof Date) return v.getTime();
  if (v === undefined) return null;
  if (Array.isArray(v)) return v.map(normalizarValor);
  if (typeof v === 'object' && v !== null) return JSON.stringify(v);
  return v;
}

/** Compara la cabecera entrante (`datosOT`, con llaves = columnas DB) contra una OT existente. */
function headerIgual(datosOT: Record<string, unknown>, ot: Record<string, unknown>): boolean {
  for (const [key, val] of Object.entries(datosOT)) {
    if (normalizarValor(val) !== normalizarValor(ot[key])) return false;
  }
  return true;
}

function canonicalInstrumentoResuelto(inst: InstrumentoResuelto): string {
  return JSON.stringify({
    item: inst.item ?? null,
    tipo_servicio: inst.tipo_servicio ?? null,
    instrumento: inst.instrumento,
    fabricante: inst.fabricante ?? null,
    modelo: inst.modelo ?? null,
    serie: inst.serie ?? null,
    codigo_interno: inst.codigo_interno ?? null,
    ubicacion: inst.ubicacion ?? null,
    puntos: [...(inst.puntos_calibracion ?? [])].sort(),
    unidad: inst.unidad ?? null,
    intervalo: inst.intervalo_medicion ?? null,
    resolucion: inst.resolucion_division ?? null,
    declaracion: inst.declaracion_conformidad ?? false,
    emp: inst.emp_ajuste_control ?? inst.emp_limite_control ?? null,
    doc: inst.documento_especificacion ?? null,
    regla: inst.regla_decision ?? null,
    sitio: inst.sitio,
  });
}

function canonicalDetalleOt(d: OtFamilia['orden_trabajo_detalles'][number]): string {
  return JSON.stringify({
    item: d.ITEM,
    tipo_servicio: d.TIPO_SERVICIO,
    instrumento: d.INSTRUMENTO,
    fabricante: d.FABRICANTE ?? null,
    modelo: d.MODELO ?? null,
    serie: d.SERIE ?? null,
    codigo_interno: d.CODIGO_INVENTARIO ?? null,
    ubicacion: d.UBICACION ?? null,
    puntos: [...(d.PUNTOS_CALIBRAR ?? [])].sort(),
    unidad: d.UNIDAD ?? null,
    intervalo: d.INTERVALO_RANGO ?? null,
    resolucion: d.RESOLUCION ?? null,
    declaracion: d.DECLARACION_CONFORMIDAD ?? false,
    emp: d.LIMITE_CONTROL_EMC ?? null,
    doc: d.DOC_ESPECIFICACION ?? null,
    regla: d.REGLA_DECISION ?? null,
    sitio: d.sitio_calibracion,
  });
}

function snapshotTabular(instrumentos: string[]): string {
  return [...instrumentos].sort().join('\n');
}

export async function reimportarFamiliaOTVersionada(
  tx: Tx,
  input: {
    idCotizacion: number;
    idCliente: number | null;
    idUsuario: number;
    datosOT: Record<string, unknown>;
    instrumentosResueltos: InstrumentoResuelto[];
    solicitante: string;
  }
): Promise<VersionadoResult> {
  const familia = await tx.ordenes_trabajo.findMany({
    where: { ID_COTIZACION_FK: input.idCotizacion, VIGENTE: true },
    include: {
      orden_trabajo_detalles: { where: { activacion: true } },
      recepciones_equipo: { where: { activacion: { not: false } } },
    },
    orderBy: { SITIO_CALIBRACION: 'asc' },
  });

  const ots: VersionadoResult['ots'] = [];
  const recepciones: VersionadoResult['recepciones'] = [];

  // Sin familia previa => no es re-importación (debe usarse split inicial).
  if (familia.length === 0) {
    return { cambio: false, cambioTabular: false, ots, recepciones };
  }

  // Cabecera de referencia: la Master (SITIO null) si existe, si no la primera OT.
  const masterActual =
    familia.find((o) => o.SITIO_CALIBRACION == null) ?? familia[0];

  const cambioEscalar = !headerIgual(input.datosOT, masterActual as unknown as Record<string, unknown>);

  const instrumentosActuales = familia.flatMap((o) =>
    o.orden_trabajo_detalles.map((d) => canonicalDetalleOt(d))
  );
  const instrumentosEntrantes = input.instrumentosResueltos.map(canonicalInstrumentoResuelto);

  const cambioTabular = snapshotTabular(instrumentosActuales) !== snapshotTabular(instrumentosEntrantes);

  if (!cambioEscalar && !cambioTabular) {
    // Sin cambios: no se versiona nada.
    return { cambio: false, cambioTabular: false, ots, recepciones };
  }

  // 1. Determinar la raíz de la familia (id de la primera versión).
  const raiz = masterActual.ID_OT_RAIZ ?? masterActual.ID_ORDEN_TRABAJO;
  const nuevaVersion = Math.max(1, ...familia.map((o) => o.VERSION ?? 1)) + 1;

  // 2. Versionar la Master primero (para enlazar las hijas al nuevo id).
  let nuevoMasterId: number | null = null;
  const otMaestro = familia.find((o) => o.SITIO_CALIBRACION == null);
  if (otMaestro) {
    const nuevoCodigo = await generarConsecutivo(tx, 'OT', otMaestro.CODIGO_OT);
    const nuevo = await tx.ordenes_trabajo.create({
      data: {
        CODIGO_OT: nuevoCodigo,
        ID_COTIZACION_FK: input.idCotizacion,
        ID_CLIENTE_FK: input.idCliente,
        ID_OT_PADRE_FK: otMaestro.ID_OT_PADRE_FK,
        ID_OT_RAIZ: raiz,
        VERSION: nuevaVersion,
        VIGENTE: true,
        SITIO_CALIBRACION: null,
        ES_EN_SITIO: false,
        ES_LAB_PERMANENTE: false,
        ES_INTERNO_USC: Boolean(input.datosOT.ES_INTERNO_USC),
        ...input.datosOT,
        estado: 'Creada',
        orden_trabajo_detalles: {
          create: input.instrumentosResueltos.map((inst, index) => ({
            ITEM: index + 1,
            TIPO_SERVICIO: inst.tipo_servicio || 'Calibración',
            INSTRUMENTO: inst.instrumento,
            FABRICANTE: inst.fabricante || null,
            MODELO: inst.modelo || null,
            SERIE: inst.serie || null,
            CODIGO_INVENTARIO: inst.codigo_interno || null,
            UBICACION: inst.ubicacion || null,
            PUNTOS_CALIBRAR: inst.puntos_calibracion || [],
            UNIDAD: inst.unidad || null,
            INTERVALO_RANGO: inst.intervalo_medicion || null,
            RESOLUCION: inst.resolucion_division || null,
            DECLARACION_CONFORMIDAD: inst.declaracion_conformidad ?? false,
            LIMITE_CONTROL_EMC: inst.emp_ajuste_control || inst.emp_limite_control || null,
            DOC_ESPECIFICACION: inst.documento_especificacion || null,
            REGLA_DECISION: inst.regla_decision || null,
            sitio_calibracion: inst.sitio,
            activacion: true,
          })),
        },
      },
    });
    nuevoMasterId = nuevo.ID_ORDEN_TRABAJO;
    ots.push({ id: nuevo.ID_ORDEN_TRABAJO, codigo: nuevo.CODIGO_OT, esNueva: true });
  }

  // 3. Versionar cada hija (SITIO no null), enlazando a la nueva Master si aplica.
  const hijas = familia.filter((o) => o.SITIO_CALIBRACION != null);
  for (const hija of hijas) {
    const sitio: SitioCalibracion = hija.SITIO_CALIBRACION === 'CLIENTE' ? 'CLIENTE' : 'LABORATORIO';
    const instrumentosSitio = input.instrumentosResueltos.filter((i) => i.sitio === sitio);
    const esSitio = sitio === 'CLIENTE';

    const nuevoCodigo = await generarConsecutivo(tx, 'OT', hija.CODIGO_OT);
    const nuevo = await tx.ordenes_trabajo.create({
      data: {
        CODIGO_OT: nuevoCodigo,
        ID_COTIZACION_FK: input.idCotizacion,
        ID_CLIENTE_FK: input.idCliente,
        ID_OT_PADRE_FK: nuevoMasterId ?? hija.ID_OT_PADRE_FK,
        ID_OT_RAIZ: raiz,
        VERSION: nuevaVersion,
        VIGENTE: true,
        SITIO_CALIBRACION: sitio,
        ES_EN_SITIO: esSitio,
        ES_LAB_PERMANENTE: !esSitio,
        ES_INTERNO_USC: Boolean(input.datosOT.ES_INTERNO_USC),
        ...input.datosOT,
        estado: 'Creada',
        orden_trabajo_detalles: {
          create: instrumentosSitio.map((inst, index) => ({
            ITEM: index + 1,
            TIPO_SERVICIO: inst.tipo_servicio || 'Calibración',
            INSTRUMENTO: inst.instrumento,
            FABRICANTE: inst.fabricante || null,
            MODELO: inst.modelo || null,
            SERIE: inst.serie || null,
            CODIGO_INVENTARIO: inst.codigo_interno || null,
            UBICACION: inst.ubicacion || null,
            PUNTOS_CALIBRAR: inst.puntos_calibracion || [],
            UNIDAD: inst.unidad || null,
            INTERVALO_RANGO: inst.intervalo_medicion || null,
            RESOLUCION: inst.resolucion_division || null,
            DECLARACION_CONFORMIDAD: inst.declaracion_conformidad ?? false,
            LIMITE_CONTROL_EMC: inst.emp_ajuste_control || inst.emp_limite_control || null,
            DOC_ESPECIFICACION: inst.documento_especificacion || null,
            REGLA_DECISION: inst.regla_decision || null,
            sitio_calibracion: sitio,
            activacion: true,
          })),
        },
      },
    });
    ots.push({ id: nuevo.ID_ORDEN_TRABAJO, codigo: nuevo.CODIGO_OT, esNueva: true });

    // Recepción anclada: solo se versiona si hubo cambio tabular.
    const recepcionActual = hija.recepciones_equipo[0];
    if (cambioTabular && recepcionActual) {
      const nuevaVersionRec = Math.max(1, recepcionActual.VERSION ?? 1) + 1;
      const recRaiz = recepcionActual.ID_RECEPCION_RAIZ ?? recepcionActual.ID_RECEPCION;
      const nuevoCodigoRec = await generarConsecutivo(tx, 'REC', recepcionActual.CODIGO_RECEPCION);
      const nuevaRec = await tx.recepciones_equipo.create({
        data: {
          CODIGO_RECEPCION: nuevoCodigoRec,
          ID_COTIZACION_FK: input.idCotizacion,
          ID_ORDEN_TRABAJO_FK: nuevo.ID_ORDEN_TRABAJO,
          ID_RECEPCION_RAIZ: recRaiz,
          VERSION: nuevaVersionRec,
          VIGENTE: true,
          SOLICITANTE: input.solicitante,
          SITIO_CALIBRACION: sitio,
          ESTADO: 'BORRADOR',
          activacion: true,
          recepcion_equipo_detalles: {
            create: instrumentosSitio.map((inst, index) => ({
              ITEM: index + 1,
              INSTRUMENTO: inst.instrumento,
              MARCA: inst.fabricante || null,
              MODELO: inst.modelo || null,
              SERIE: inst.serie || null,
              CODIGO_INVENTARIO: inst.codigo_interno || null,
              RESOLUCION: inst.resolucion_division || null,
              activacion: true,
            })),
          },
        },
      });
      recepciones.push({ id: nuevaRec.ID_RECEPCION, codigo: nuevaRec.CODIGO_RECEPCION, esNueva: true });

      // Marcar recepción anterior como no vigente.
      await tx.recepciones_equipo.update({
        where: { ID_RECEPCION: recepcionActual.ID_RECEPCION },
        data: { VIGENTE: false },
      });
    } else if (!cambioTabular && recepcionActual) {
      // Cambio solo escalar: re-enlazar la recepción a la OT nueva (sin versionarla).
      await tx.recepciones_equipo.update({
        where: { ID_RECEPCION: recepcionActual.ID_RECEPCION },
        data: { ID_ORDEN_TRABAJO_FK: nuevo.ID_ORDEN_TRABAJO },
      });
    }
  }

  // 4. Marcar las OTs anteriores como no vigentes.
  await tx.ordenes_trabajo.updateMany({
    where: { ID_COTIZACION_FK: input.idCotizacion, VIGENTE: true, ID_ORDEN_TRABAJO: { notIn: ots.map((o) => o.id) } },
    data: { VIGENTE: false },
  });

  return { cambio: true, cambioTabular, ots, recepciones };
}
