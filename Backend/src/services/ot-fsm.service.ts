// services/ot-fsm.service.ts
// Máquina de estados finitos para Órdenes de Trabajo (EstadoOT).
// Las transiciones automáticas se derivan de los datos reales (recepción,
// asignación, estampillas y certificados aprobados). Una OT aprobada puede
// reabrirse si cambia su conjunto de instrumentos antes del envío.
import { Prisma, EstadoOT } from '@prisma/client';
import { AppError } from '../lib/errors.js';

export const ORDEN_ESTADOS: EstadoOT[] = [
  EstadoOT.Creada,
  EstadoOT.En_recepción,
  EstadoOT.Asignada,
  EstadoOT.En_calibración,
  EstadoOT.Certificado_en_revisión,
  EstadoOT.Certificado_aprobado,
  EstadoOT.Certificado_enviado,
];

function rango(estado: EstadoOT): number {
  return ORDEN_ESTADOS.indexOf(estado);
}

interface EstadoIbcNormalizado {
  entrada: Record<string, unknown>;
  salida: Record<string, unknown>;
}

function parseEstadoIbc(raw: Prisma.JsonValue | null | undefined): EstadoIbcNormalizado {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { entrada: {}, salida: {} };
  }
  const obj = raw as Record<string, unknown>;
  const entrada =
    obj.entrada && typeof obj.entrada === 'object' && !Array.isArray(obj.entrada)
      ? (obj.entrada as Record<string, unknown>)
      : obj;
  const salida =
    obj.salida && typeof obj.salida === 'object' && !Array.isArray(obj.salida)
      ? (obj.salida as Record<string, unknown>)
      : {};
  return { entrada, salida };
}

function entradaIbcCompleta(raw: Prisma.JsonValue | null | undefined): boolean {
  const { entrada } = parseEstadoIbc(raw);
  return ['E', 'T', 'D', 'A'].every((key) => typeof entrada[key] === 'boolean');
}

export interface ResultadoFSM {
  estadoAnterior: EstadoOT;
  estadoNuevo: EstadoOT;
  actualizado: boolean;
  condiciones: {
    recepcionOk: boolean;
    algunInstrumentoListo: boolean;
    algunaCalibracionYEstampilla: boolean;
    algunCertificadoAprobado: boolean;
    todosCertificadosAprobados: boolean;
    pagoRealizado: boolean;
  };
}

type PrismaTx = Prisma.TransactionClient;

export function cabeceraRecepcionLista(recepcion: {
  FECHA_RECEPCION?: Date | null;
  NOMBRE_ENTREGA?: string | null;
  NOMBRE_RECIBE?: string | null;
} | null | undefined): boolean {
  return Boolean(recepcion?.FECHA_RECEPCION && recepcion.NOMBRE_ENTREGA?.trim() && recepcion.NOMBRE_RECIBE?.trim());
}

export function instrumentoListoParaAsignar(detalle: {
  ESTAMPILLA?: string | null;
  ESTADO_IBC?: Prisma.JsonValue | null;
}): boolean {
  const estampilla = detalle.ESTAMPILLA?.trim();
  return Boolean(estampilla && !/^TEMP-/i.test(estampilla) && entradaIbcCompleta(detalle.ESTADO_IBC));
}

type IdentidadUnidad = { ID_UNIDAD_FK?: string | null; ITEM?: number | null };

export function vincularUnidadRecepcion<T extends IdentidadUnidad>(
  unidadOT: IdentidadUnidad,
  recibidos: readonly T[],
): T | undefined {
  if (unidadOT.ID_UNIDAD_FK) {
    const exacto = recibidos.find((detalle) => detalle.ID_UNIDAD_FK === unidadOT.ID_UNIDAD_FK);
    if (exacto) return exacto;
  }
  // Registros previos al ID persistente: usar el ítem si identifica una sola fila
  // y al menos uno de los dos registros todavía carece de ID.
  if (unidadOT.ITEM == null) return undefined;
  const candidatos = recibidos.filter((detalle) => detalle.ITEM === unidadOT.ITEM);
  const candidato = candidatos.length === 1 ? candidatos[0] : undefined;
  return candidato && (!unidadOT.ID_UNIDAD_FK || !candidato.ID_UNIDAD_FK) ? candidato : undefined;
}

/** Avanza con el progreso por unidad. La aprobación sigue exigiendo todas las unidades. */
export async function evaluarTransicionesOT(
  tx: PrismaTx,
  idOT: number
): Promise<ResultadoFSM> {
  const ot = await tx.ordenes_trabajo.findUnique({
    where: { ID_ORDEN_TRABAJO: idOT },
    include: {
      orden_trabajo_detalles: true,
      recepciones_equipo: {
        where: { VIGENTE: true, activacion: true },
        orderBy: [{ VERSION: 'desc' }, { ID_RECEPCION: 'desc' }],
        take: 1,
        include: {
          recepcion_equipo_detalles: {
            where: { OR: [{ activacion: true }, { activacion: null }] },
          },
        },
      },
    },
  });

  if (!ot) throw new AppError(404, `Orden de trabajo ${idOT} no encontrada`);

  const estadoActual = (ot.estado ?? EstadoOT.Creada) as EstadoOT;
  const recepcion = ot.recepciones_equipo[0] ?? null;
  const recDetalles = (recepcion?.recepcion_equipo_detalles ?? []).filter(
    (d) => d.activacion !== false
  );

  const otDetallesActivos = ot.orden_trabajo_detalles.filter(
    (d) => d.activacion !== false
  );

  const pares = otDetallesActivos.map((detalle) => vincularUnidadRecepcion(detalle, recDetalles));
  const recepcionOk =
    cabeceraRecepcionLista(recepcion) &&
    pares.some((detalle) => detalle && entradaIbcCompleta(detalle.ESTADO_IBC));

  const recDetallesValidos = pares.filter(
    (detalle): detalle is NonNullable<typeof detalle> => detalle != null && instrumentoListoParaAsignar(detalle),
  );
  const algunInstrumentoListo = recDetallesValidos.length > 0;

  const instrumentoIds = pares.flatMap((detalle) => detalle ? [detalle.ID_INSTRUMENTO] : []);

  const conCalibracion = new Set<number>();
  const conCertificadoAprobado = new Set<number>();
  const conCertificadoEnRevision = new Set<number>();
  if (instrumentoIds.length > 0) {
    const [calibraciones, certificados] = await Promise.all([
      tx.calibraciones.findMany({
        where: { ID_INSTRUMENTO_FK: { in: instrumentoIds } },
        select: { ID_INSTRUMENTO_FK: true },
      }),
      tx.certificados.findMany({
        where: {
          calibraciones: { ID_INSTRUMENTO_FK: { in: instrumentoIds } },
        },
        select: { ESTADO_REVISION: true, calibraciones: { select: { ID_INSTRUMENTO_FK: true } } },
      }),
    ]);

    calibraciones.forEach((c) => conCalibracion.add(c.ID_INSTRUMENTO_FK));
    certificados.forEach((certificado) => {
      const idInstrumento = certificado.calibraciones?.ID_INSTRUMENTO_FK;
      if (idInstrumento == null) return;
      if (certificado.ESTADO_REVISION === 'APROBADO') conCertificadoAprobado.add(idInstrumento);
      if (certificado.ESTADO_REVISION === 'PENDIENTE_REVISION') conCertificadoEnRevision.add(idInstrumento);
    });
  }

  const algunaCalibracionYEstampilla = recDetallesValidos.some((detalle) =>
    conCalibracion.has(detalle.ID_INSTRUMENTO));
  const algunCertificadoAprobado = conCertificadoAprobado.size > 0;
  const todosCertificadosAprobados = pares.length > 0 && new Set(instrumentoIds).size === pares.length &&
    pares.every((detalle) => detalle != null && conCertificadoAprobado.has(detalle.ID_INSTRUMENTO));

  const pagoRealizado = ot.estado_pago === 'PAGADO';

  const condiciones = {
    recepcionOk,
    algunInstrumentoListo,
    algunaCalibracionYEstampilla,
    algunCertificadoAprobado,
    todosCertificadosAprobados,
    pagoRealizado,
  };

  const cumplidos: EstadoOT[] = [];
  if (recepcionOk) cumplidos.push(EstadoOT.En_recepción);
  if (recepcionOk && algunInstrumentoListo) cumplidos.push(EstadoOT.Asignada);
  if (recepcionOk && algunaCalibracionYEstampilla) cumplidos.push(EstadoOT.En_calibración);
  if (recepcionOk && (algunCertificadoAprobado || conCertificadoEnRevision.size > 0)) {
    cumplidos.push(EstadoOT.Certificado_en_revisión);
  }
  if (todosCertificadosAprobados) {
    cumplidos.push(EstadoOT.Certificado_aprobado);
  }
  const perdioAprobacion = estadoActual === EstadoOT.Certificado_aprobado && !todosCertificadosAprobados;
  const objetivo = cumplidos.reduce(
    (max, e) => (rango(e) > rango(max) ? e : max),
    perdioAprobacion ? EstadoOT.Creada : estadoActual
  );
  const debeActualizar = objetivo !== estadoActual;

  if (debeActualizar) {
    await tx.ordenes_trabajo.update({
      where: { ID_ORDEN_TRABAJO: idOT },
      data: { estado: objetivo },
    });
  }

  return {
    estadoAnterior: estadoActual,
    estadoNuevo: objetivo,
    actualizado: debeActualizar,
    condiciones,
  };
}

/**
 * Transición explícita (rechazo → devolver a técnico, envío de certificados).
 * Por defecto no permite retrocesos; usar `permitirRetroceso` para flujos de anulación.
 */
export async function transicionarOT(
  tx: PrismaTx,
  idOT: number,
  nuevoEstado: EstadoOT,
  opciones?: { permitirRetroceso?: boolean }
): Promise<{ estadoAnterior: EstadoOT; estadoNuevo: EstadoOT }> {
  const ot = await tx.ordenes_trabajo.findUnique({
    where: { ID_ORDEN_TRABAJO: idOT },
    select: { estado: true },
  });
  if (!ot) throw new AppError(404, `Orden de trabajo ${idOT} no encontrada`);

  const actual = (ot.estado ?? EstadoOT.Creada) as EstadoOT;

  if (!opciones?.permitirRetroceso && rango(nuevoEstado) <= rango(actual)) {
    throw new AppError(
      409,
      `Transición inválida: no se puede pasar de "${actual}" a "${nuevoEstado}".`
    );
  }

  await tx.ordenes_trabajo.update({
    where: { ID_ORDEN_TRABAJO: idOT },
    data: { estado: nuevoEstado },
  });

  return { estadoAnterior: actual, estadoNuevo: nuevoEstado };
}

/**
 * La asignación queda abierta después de recepción mientras la unidad no tenga
 * calibración y no exista certificado para todos los instrumentos de la OT.
 * El estado de revisión/aprobación del certificado de otra unidad no bloquea.
 */
export async function validarAsignacionPermitida(
  tx: Prisma.TransactionClient,
  idOT: number,
  idDetalle: number
): Promise<void> {
  const ot = await tx.ordenes_trabajo.findUnique({
    where: { ID_ORDEN_TRABAJO: idOT },
    select: {
      estado: true,
      orden_trabajo_detalles: {
        where: { OR: [{ activacion: true }, { activacion: null }] },
        select: { ID_DETALLE: true, ID_UNIDAD_FK: true, ITEM: true },
      },
    },
  });

  const estado = ot?.estado ?? EstadoOT.Creada;
  if (!ot || estado === EstadoOT.Creada) {
    throw new AppError(
      409,
      'La asignación se habilita cuando hay un instrumento con estampilla e IBC de entrada completos.'
    );
  }

  if (estado === EstadoOT.Certificado_enviado) {
    throw new AppError(
      409,
      'No se puede asignar: los certificados de la OT ya fueron enviados.'
    );
  }

  const recepcion = await tx.recepciones_equipo.findFirst({
    where: { ID_ORDEN_TRABAJO_FK: idOT, VIGENTE: true, activacion: true },
    orderBy: [{ VERSION: 'desc' }, { ID_RECEPCION: 'desc' }],
    include: {
      recepcion_equipo_detalles: {
        where: { OR: [{ activacion: true }, { activacion: null }] },
        include: { calibraciones: { include: { certificados: true } } },
      },
    },
  });

  const recibidos = recepcion?.recepcion_equipo_detalles ?? [];
  const unidades = ot.orden_trabajo_detalles;
  if (unidades.length > 0 && unidades.every((unidad) =>
    vincularUnidadRecepcion(unidad, recibidos)?.calibraciones?.certificados != null
  )) {
    throw new AppError(409, 'No se puede asignar: todos los instrumentos de la OT ya tienen certificado generado.');
  }

  const unidadOT = unidades.find((unidad) => unidad.ID_DETALLE === idDetalle);
  const detalle = unidadOT ? vincularUnidadRecepcion(unidadOT, recibidos) : undefined;
  if (detalle?.calibraciones != null) {
    throw new AppError(409, 'No se puede cambiar la asignación: este instrumento ya tiene una calibración iniciada.');
  }
  if (!cabeceraRecepcionLista(recepcion) || !detalle || !instrumentoListoParaAsignar(detalle)) {
    throw new AppError(409, 'Completa la estampilla y los cuatro campos del IBC de entrada de este instrumento antes de asignarlo.');
  }
}
