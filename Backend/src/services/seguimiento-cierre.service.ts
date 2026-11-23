import { Prisma } from '@prisma/client';

type Tx = Prisma.TransactionClient;

/** True only when every current OT has paid, sent certificates and completed receipts. */
export async function cotizacionListaParaSeguimiento(tx: Tx, idCotizacion: number): Promise<boolean> {
  const ots = await tx.ordenes_trabajo.findMany({
    where: { ID_COTIZACION_FK: idCotizacion, VIGENTE: true },
    select: {
      ID_ORDEN_TRABAJO: true,
      ID_OT_PADRE_FK: true,
      estado: true,
      estado_pago: true,
      recepciones_equipo: {
        where: { VIGENTE: true, activacion: { not: false } },
        select: { ESTADO: true },
      },
    },
  });

  const maestras = new Set(ots.map((ot) => ot.ID_OT_PADRE_FK));
  const operativas = ots.filter((ot) => !maestras.has(ot.ID_ORDEN_TRABAJO));
  return operativas.length > 0 && operativas.every((ot) =>
    ot.estado === 'Certificado_enviado' &&
    ot.estado_pago === 'PAGADO' &&
    ot.recepciones_equipo.length > 0 &&
    ot.recepciones_equipo.every((recepcion) => recepcion.ESTADO === 'ENTREGADO')
  );
}

/** Completes the approved quote's commercial handoff once all delivery conditions hold. */
export async function cerrarSeguimientoSiCompleto(
  tx: Tx,
  idCotizacion: number,
  idUsuario: number | null,
): Promise<boolean> {
  if (!(await cotizacionListaParaSeguimiento(tx, idCotizacion))) return false;

  const cotizacion = await tx.cotizaciones.findUnique({
    where: { ID_COTIZACION: idCotizacion },
    select: { ESTADO: true, CODIGO_COTIZACION: true },
  });
  if (!cotizacion || cotizacion.ESTADO !== 'APROBADA') return false;

  const cierre = await tx.cotizaciones.updateMany({
    where: { ID_COTIZACION: idCotizacion, ESTADO: 'APROBADA' },
    data: { ESTADO: 'EN_SEGUIMIENTO' },
  });
  if (cierre.count !== 1) return false;
  await tx.historial_estado_cotizacion.create({
    data: {
      ID_COTIZACION_FK: idCotizacion,
      ESTADO_ANTERIOR: 'APROBADA',
      ESTADO_NUEVO: 'EN_SEGUIMIENTO',
      ID_USUARIO_FK: idUsuario,
      MOTIVO: 'Entrega completa: pago registrado, certificados enviados y recepciones finalizadas.',
    },
  });
  await tx.seguimientos_comerciales.create({
    data: {
      ID_COTIZACION_FK: idCotizacion,
      TIPO: 'OTRO',
      DESCRIPCION: `Cierre de entrega completado para la cotización ${cotizacion.CODIGO_COTIZACION}.`,
      RESULTADO: 'ENTREGA_COMPLETA',
      ID_USUARIO_FK: idUsuario,
      ORIGEN: 'SISTEMA',
    },
  });
  return true;
}
