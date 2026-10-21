// services/ot-fsm.service.ts
// Máquina de estados finitos para Órdenes de Trabajo (EstadoOT).
// Las transiciones automáticas se derivan de los datos reales (recepción,
// asignación, estampillas y certificados aprobados). El avance es monotónico:
// `evaluarTransicionesOT` nunca retrocede un estado.
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

/** `estado_ibc_entrada` presente: al menos un flag de la entrada en `true`. */
export function entradaIbcPresente(raw: Prisma.JsonValue | null | undefined): boolean {
  const { entrada } = parseEstadoIbc(raw);
  return Object.values(entrada).some((v) => v === true);
}

/**
 * Información del instrumento "llena", ignorando `numero_estampilla` (ESTAMPILLA)
 * y `numero_inventario` (CODIGO_INVENTARIO).
 */
export function instrumentoRecepcionCompleto(det: {
  INSTRUMENTO?: string | null;
  MARCA?: string | null;
  MODELO?: string | null;
  SERIE?: string | null;
  RESOLUCION?: string | null;
}): boolean {
  const requeridos = [det.INSTRUMENTO, det.MARCA, det.MODELO, det.SERIE, det.RESOLUCION];
  return requeridos.every((v) => v != null && String(v).trim() !== '');
}

export interface ResultadoFSM {
  estadoAnterior: EstadoOT;
  estadoNuevo: EstadoOT;
  actualizado: boolean;
  condiciones: {
    recepcionOk: boolean;
    todosConTecnico: boolean;
    algunaCalibracionYEstampilla: boolean;
    algunCertificadoAprobado: boolean;
    todosCertificadosAprobados: boolean;
    pagoRealizado: boolean;
  };
}

type PrismaTx = Prisma.TransactionClient;

const nombreLleno = (v: string | null | undefined): boolean =>
  v != null && String(v).trim() !== '';

const tieneEstampilla = (d: { ESTAMPILLA: string | null }): boolean => {
  const v = d.ESTAMPILLA;
  if (v == null || String(v).trim() === '') return false;
  // Los placeholders heredados `TEMP-*` no cuentan como estampilla real.
  return !String(v).toUpperCase().startsWith('TEMP-');
};

/**
 * Recalcula y, si corresponde, avanza el estado de la OT según sus datos.
 * Debe invocarse dentro de la misma transacción que mutó recepción/instrumentos.
 *
 * Ciclo de vida (monotónico):
 *   En_recepción            -> cabecera (fecha recepción + entrega + recibe) y ≥1 IBC de entrada.
 *   Asignada                -> recepción OK y todos los instrumentos con técnico.
 *   En_calibración          -> recepción OK y ≥1 instrumento con PDF (calibración) + estampilla.
 *   Certificado_en_revisión -> recepción OK y ≥1 certificado APROBADO.
 *   Certificado_aprobado    -> recepción OK y 100% instrumentos con certificado APROBADO.
 *   Certificado_enviado     -> 100% aprobado y estado de pago PAGADO.
 */
export async function evaluarTransicionesOT(
  tx: PrismaTx,
  idOT: number
): Promise<ResultadoFSM> {
  const ot = await tx.ordenes_trabajo.findUnique({
    where: { ID_ORDEN_TRABAJO: idOT },
    include: {
      orden_trabajo_detalles: true,
      recepciones_equipo: { include: { recepcion_equipo_detalles: true } },
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

  const match = (otDet: { ITEM: number; INSTRUMENTO: string }) => {
    if (otDet.ITEM != null) {
      const byItem = recDetalles.find((r) => r.ITEM === otDet.ITEM);
      if (byItem) return byItem;
    }
    return recDetalles.find((r) => r.INSTRUMENTO === otDet.INSTRUMENTO) ?? null;
  };

  const pares = otDetallesActivos.map((otDet) => ({
    otDet,
    recDet: match(otDet),
  }));

  const hayInstrumentos = otDetallesActivos.length > 0;

  const recepcionOk =
    !!recepcion &&
    recepcion.FECHA_RECEPCION != null &&
    nombreLleno(recepcion.NOMBRE_ENTREGA) &&
    nombreLleno(recepcion.NOMBRE_RECIBE) &&
    hayInstrumentos &&
    pares.some((p) => p.recDet != null && entradaIbcPresente(p.recDet.ESTADO_IBC));

  const todosConTecnico =
    hayInstrumentos &&
    otDetallesActivos.every((d) => d.asignado != null && d.asignado > 0);

  const recDetallesValidos = pares
    .map((p) => p.recDet)
    .filter((d): d is NonNullable<typeof d> => d != null);

  const instrumentoIds = recDetallesValidos.map((d) => d.ID_INSTRUMENTO);

  const conCalibracion = new Set<number>();
  const conCertificadoAprobado = new Set<number>();
  if (instrumentoIds.length > 0) {
    const [calibraciones, certificadosAprobados] = await Promise.all([
      tx.calibraciones.findMany({
        where: { ID_INSTRUMENTO_FK: { in: instrumentoIds } },
        select: { ID_INSTRUMENTO_FK: true },
      }),
      tx.certificados.findMany({
        where: {
          ESTADO_REVISION: 'APROBADO',
          calibraciones: { ID_INSTRUMENTO_FK: { in: instrumentoIds } },
        },
        select: { calibraciones: { select: { ID_INSTRUMENTO_FK: true } } },
      }),
    ]);

    calibraciones.forEach((c) => conCalibracion.add(c.ID_INSTRUMENTO_FK));
    certificadosAprobados.forEach((c) => {
      const idInst = c.calibraciones?.ID_INSTRUMENTO_FK;
      if (idInst != null) conCertificadoAprobado.add(idInst);
    });
  }

  const algunaCalibracionYEstampilla = recDetallesValidos.some(
    (d) => conCalibracion.has(d.ID_INSTRUMENTO) && tieneEstampilla(d)
  );

  const algunCertificadoAprobado = recDetallesValidos.some((d) =>
    conCertificadoAprobado.has(d.ID_INSTRUMENTO)
  );

  const todosCertificadosAprobados =
    hayInstrumentos &&
    pares.every(
      (p) =>
        p.recDet != null && conCertificadoAprobado.has(p.recDet.ID_INSTRUMENTO)
    );

  const pagoRealizado = ot.estado_pago === 'PAGADO';

  const condiciones = {
    recepcionOk,
    todosConTecnico,
    algunaCalibracionYEstampilla,
    algunCertificadoAprobado,
    todosCertificadosAprobados,
    pagoRealizado,
  };

  const cumplidos: EstadoOT[] = [];
  if (recepcionOk) cumplidos.push(EstadoOT.En_recepción);
  if (recepcionOk && todosConTecnico) cumplidos.push(EstadoOT.Asignada);
  if (recepcionOk && algunaCalibracionYEstampilla) cumplidos.push(EstadoOT.En_calibración);
  if (recepcionOk && algunCertificadoAprobado) {
    cumplidos.push(EstadoOT.Certificado_en_revisión);
  }
  if (recepcionOk && todosCertificadosAprobados) {
    cumplidos.push(EstadoOT.Certificado_aprobado);
  }
  if (recepcionOk && todosCertificadosAprobados && pagoRealizado) {
    cumplidos.push(EstadoOT.Certificado_enviado);
  }

  const objetivo = cumplidos.reduce(
    (max, e) => (rango(e) > rango(max) ? e : max),
    estadoActual
  );
  const debeAvanzar = rango(objetivo) > rango(estadoActual);

  if (debeAvanzar) {
    await tx.ordenes_trabajo.update({
      where: { ID_ORDEN_TRABAJO: idOT },
      data: { estado: objetivo },
    });
  }

  return {
    estadoAnterior: estadoActual,
    estadoNuevo: debeAvanzar ? objetivo : estadoActual,
    actualizado: debeAvanzar,
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

/** Bloquea la asignación de técnico si la OT no está en recepción. */
export function validarAsignacionPermitida(estado: EstadoOT | null): void {
  if (estado !== EstadoOT.En_recepción) {
    throw new AppError(
      409,
      'Solo se puede asignar o cambiar el técnico cuando la OT está en "En_recepción".'
    );
  }
}
